import json
import logging
import re
from threading import Lock
from threading import Thread
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from app.config import settings

try:
    from transformers import pipeline
except Exception:
    pipeline = None

try:
    import torch
except Exception:
    torch = None

_neural_lock = Lock()
_neural_summarizer = None
_neural_loading = False
_neural_error = None
_neural_device = None
logger = logging.getLogger(__name__)


def _load_neural_worker(force_device: int | None = None) -> None:
    global _neural_summarizer, _neural_loading, _neural_error, _neural_device
    try:
        if pipeline is None:
            with _neural_lock:
                _neural_error = "transformers is not installed"
                _neural_device = None
            return

        if force_device is not None:
            device = force_device
        else:
            device = 0 if (torch is not None and torch.cuda.is_available()) else -1
        logger.warning("Loading TLDR neural model %s on %s", settings.tldr_neural_model, "cuda" if device == 0 else "cpu")
        summarizer = pipeline(
            "summarization",
            model=settings.tldr_neural_model,
            tokenizer=settings.tldr_neural_model,
            device=device,
        )
        with _neural_lock:
            _neural_summarizer = summarizer
            _neural_error = None
            _neural_device = "cuda" if device == 0 else "cpu"
        logger.warning("TLDR neural model loaded successfully: %s on %s", settings.tldr_neural_model, _neural_device)
    except Exception as exc:
        with _neural_lock:
            _neural_error = str(exc)
            _neural_device = None
        logger.exception("TLDR neural model load failed")
    finally:
        with _neural_lock:
            _neural_loading = False


def _start_neural_loading_if_needed() -> None:
    global _neural_loading
    with _neural_lock:
        if _neural_summarizer is not None or _neural_loading:
            return
        _neural_loading = True
    Thread(target=_load_neural_worker, daemon=True).start()


def warmup_tldr_neural() -> None:
    logger.warning("Starting TLDR neural preload")
    _start_neural_loading_if_needed()


def get_local_neural_status(start_loading: bool = True) -> dict:
    global _neural_summarizer, _neural_loading, _neural_error, _neural_device
    if start_loading and _neural_summarizer is None and not _neural_loading and _neural_error is None:
        _start_neural_loading_if_needed()

    if _neural_summarizer is not None:
        status = "ready"
    elif _neural_loading:
        status = "loading"
    elif _neural_error:
        status = "failed"
    else:
        status = "idle"

    return {
        "mode": "local-neural",
        "status": status,
        "model": settings.tldr_neural_model,
        "device": _neural_device,
        "error": _neural_error,
    }


def _extract_json_payload(text_out: str) -> dict:
    cleaned = text_out.strip()
    fence_match = re.search(r"```(?:json)?\s*([\s\S]*?)\s*```", cleaned, re.IGNORECASE)
    if fence_match:
        cleaned = fence_match.group(1).strip()

    try:
        return json.loads(cleaned)
    except json.JSONDecodeError:
        pass

    start = cleaned.find("{")
    end = cleaned.rfind("}")
    if start != -1 and end != -1 and end > start:
        return json.loads(cleaned[start : end + 1])

    raise json.JSONDecodeError("No JSON object found", cleaned, 0)


def _get_encoder_token_limit() -> int:
    summarizer = _neural_summarizer
    tokenizer = getattr(summarizer, "tokenizer", None)
    model = getattr(summarizer, "model", None)
    config = getattr(model, "config", None)

    candidates = [
        getattr(config, "max_position_embeddings", None),
        getattr(config, "n_positions", None),
        getattr(config, "max_encoder_position_embeddings", None),
    ]

    tokenizer_limit = getattr(tokenizer, "model_max_length", None)
    if isinstance(tokenizer_limit, int) and 0 < tokenizer_limit <= 32768:
        candidates.append(tokenizer_limit)

    valid = [value for value in candidates if isinstance(value, int) and value > 0]
    return min(valid) if valid else 1024


def _needs_cpu_retry(exc: Exception) -> bool:
    message = str(exc).lower()
    return "cuda" in message and (
        "device-side assert" in message
        or "indexing.cu" in message
        or "srcindex < srcselectdimsize" in message
    )


def _reload_neural_on_cpu() -> None:
    global _neural_summarizer, _neural_error, _neural_device, _neural_loading
    logger.warning("Reloading TLDR neural model on CPU after CUDA inference failure")
    with _neural_lock:
        _neural_summarizer = None
        _neural_error = None
        _neural_device = None
        _neural_loading = True
    _load_neural_worker(force_device=-1)


def _generate_local_summary(clean: str) -> str:
    summarizer = _neural_summarizer
    tokenizer = getattr(summarizer, "tokenizer", None)
    model = getattr(summarizer, "model", None)
    if tokenizer is None or model is None:
        raise RuntimeError("Local neural TLDR model is not initialized correctly")

    encoder_limit = _get_encoder_token_limit()
    encoded = tokenizer(
        clean,
        return_tensors="pt",
        truncation=True,
        max_length=encoder_limit,
    )

    input_ids = encoded["input_ids"]
    attention_mask = encoded.get("attention_mask")
    input_length = int(attention_mask[0].sum().item()) if attention_mask is not None else int(input_ids.shape[-1])

    max_new_tokens = max(32, min(120, int(input_length * 0.55)))
    min_new_tokens = max(18, min(45, int(max_new_tokens * 0.45)))
    if input_length <= 96:
        max_new_tokens = max(24, min(72, input_length // 2))
        min_new_tokens = max(12, min(28, max_new_tokens // 2))
    if min_new_tokens >= max_new_tokens:
        min_new_tokens = max(8, max_new_tokens - 8)

    model_device = getattr(model, "device", None)
    if model_device is not None:
        encoded = {key: value.to(model_device) for key, value in encoded.items()}

    summary_ids = model.generate(
        **encoded,
        max_new_tokens=max_new_tokens,
        min_new_tokens=min_new_tokens,
        num_beams=4,
        no_repeat_ngram_size=3,
        do_sample=False,
        early_stopping=True,
    )
    return tokenizer.decode(summary_ids[0], skip_special_tokens=True, clean_up_tokenization_spaces=True).strip()


def run_local_neural_tldr(text: str) -> str:
    global _neural_summarizer, _neural_error, _neural_loading
    if not text.strip():
        return "No text content available to summarize."

    if _neural_summarizer is None:
        _start_neural_loading_if_needed()
        if _neural_loading:
            raise RuntimeError("Local neural TLDR model is loading. Retry in 15-60 seconds.")
        message = _neural_error or "Neural TLDR model is unavailable"
        raise RuntimeError(f"Local neural TLDR unavailable: {message}")

    clean = " ".join(text.split())[:6000]
    if len(clean) < 120:
        return clean

    try:
        summary = _generate_local_summary(clean)
    except Exception as exc:
        if _neural_device == "cuda" and _needs_cpu_retry(exc):
            try:
                _reload_neural_on_cpu()
                summary = _generate_local_summary(clean)
            except Exception as retry_exc:
                raise RuntimeError(f"Local neural TLDR inference failed after CPU retry: {retry_exc}") from retry_exc
        else:
            raise RuntimeError(f"Local neural TLDR inference failed: {exc}") from exc

    if not summary:
        raise RuntimeError("Local neural TLDR produced empty output")
    return summary[:900]


def run_openai_tldr(text: str, api_key: str) -> str:
    prompt = (
        "Summarize the text in 2-4 concise bullet points. "
        "Return strict JSON: {\"summary\": \"...\"}. "
        "Do not include markdown.\n\n"
        f"TEXT:\n{text[:5000]}"
    )
    payload = {
        "model": settings.openai_model,
        "input": [{"role": "user", "content": [{"type": "input_text", "text": prompt}]}],
        "max_output_tokens": 220,
    }

    request = Request(
        url=f"{settings.openai_base_url}/responses",
        data=json.dumps(payload).encode("utf-8"),
        method="POST",
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        },
    )

    try:
        with urlopen(request, timeout=30) as response:
            raw = json.loads(response.read().decode("utf-8"))
    except (HTTPError, URLError, TimeoutError) as exc:
        raise RuntimeError(f"OpenAI request failed: {exc}") from exc

    text_out = ""
    for item in raw.get("output", []):
        for content in item.get("content", []):
            if content.get("type") == "output_text":
                text_out += content.get("text", "")

    if not text_out.strip():
        raise RuntimeError("OpenAI response did not contain output text")

    try:
        parsed = _extract_json_payload(text_out)
        summary = str(parsed["summary"]).strip()
        if summary:
            return summary[:900]
    except (json.JSONDecodeError, KeyError, TypeError, ValueError):
        pass

    return text_out.strip().replace("\n\n", "\n")[:900]
