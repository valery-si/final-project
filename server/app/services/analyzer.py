import hashlib
import logging
import re
from dataclasses import dataclass
from threading import Lock, Thread

from app.config import settings

try:
    import torch
    from transformers import AutoModelForSequenceClassification, AutoTokenizer
except Exception:
    torch = None
    AutoTokenizer = None
    AutoModelForSequenceClassification = None


FALLBACK_EMOTIONAL_TERMS = {
    "shocking",
    "unbelievable",
    "outrage",
    "furious",
    "destroyed",
    "exposed",
    "secret",
    "you won't believe",
    "must see",
    "urgent",
}

FALLBACK_SOURCE_HINTS = {"according to", "report", "study", "source", "data", "evidence"}
logger = logging.getLogger(__name__)
_loader_lock = Lock()
_roberta_instance = None
_roberta_loading = False
_roberta_error = None


@dataclass
class SignalScore:
    name: str
    value: float
    note: str


@dataclass
class AnalysisResult:
    text_hash: str
    risk_score: float
    risk_label: str
    signals: list[SignalScore]


def _normalized_weights() -> tuple[float, float, float]:
    w_emotional = max(settings.weight_emotional, 0.0)
    w_source_inverse = max(settings.weight_source_inverse, 0.0)
    w_structure = max(settings.weight_structure, 0.0)
    total = w_emotional + w_source_inverse + w_structure
    if total == 0:
        return 0.45, 0.35, 0.20
    return (
        w_emotional / total,
        w_source_inverse / total,
        w_structure / total,
    )


def _risk_score(emotional_intensity: float, source_transparency: float, structure_predictability: float) -> float:
    w_emotional, w_source_inverse, w_structure = _normalized_weights()
    risk_score = (
        emotional_intensity * w_emotional
        + (1 - source_transparency) * w_source_inverse
        + structure_predictability * w_structure
    )
    return round(max(0.0, min(risk_score, 1.0)), 4)


def _label_from_score(risk_score: float) -> str:
    threshold_caution = min(max(settings.threshold_caution, 0.0), 1.0)
    threshold_no_go = min(max(settings.threshold_no_go, threshold_caution), 1.0)
    threshold_hard_no_go = min(max(settings.threshold_hard_no_go, threshold_no_go), 1.0)

    if risk_score >= threshold_hard_no_go:
        return "High Risk"
    if risk_score >= threshold_no_go:
        return "Attention Required"
    if risk_score >= threshold_caution:
        return "Mixed Signals"
    return "Mostly Credible Tone"


def _count_matches(text: str, terms: set[str]) -> int:
    lower = text.lower()
    return sum(1 for term in terms if term in lower)


def _resolve_entailment_id(label2id: dict[str, int]) -> int:
    for key, value in label2id.items():
        if "entail" in key.lower():
            return int(value)
    return 2


def _chunk_text(text: str, chunk_size: int = 1400, overlap: int = 220) -> list[str]:
    clean = " ".join(text.split())
    if len(clean) <= chunk_size:
        return [clean]

    chunks: list[str] = []
    start = 0
    while start < len(clean):
        end = start + chunk_size
        chunks.append(clean[start:end])
        if end >= len(clean):
            break
        start = max(0, end - overlap)
    return chunks


class RobertaRiskAnalyzer:
    def __init__(self) -> None:
        if not (torch and AutoTokenizer and AutoModelForSequenceClassification):
            raise RuntimeError("transformers/torch are not installed")

        self.device = "cuda" if torch.cuda.is_available() else "cpu"
        logger.warning("Loading RoBERTa model: %s on %s", settings.roberta_model_name, self.device)
        self.tokenizer = AutoTokenizer.from_pretrained(settings.roberta_model_name)
        self.model = AutoModelForSequenceClassification.from_pretrained(settings.roberta_model_name)
        self.model.to(self.device)
        self.model.eval()
        self.entailment_id = _resolve_entailment_id(self.model.config.label2id)
        logger.warning("RoBERTa model loaded successfully")

    def _entailment_score(self, text: str, hypothesis: str) -> tuple[float, float]:
        chunks = _chunk_text(text)
        scores: list[float] = []
        confidences: list[float] = []

        with torch.no_grad():
            for chunk in chunks:
                encoded = self.tokenizer(
                    chunk,
                    hypothesis,
                    return_tensors="pt",
                    truncation=True,
                    max_length=settings.roberta_max_length,
                )
                encoded = {key: value.to(self.device) for key, value in encoded.items()}
                logits = self.model(**encoded).logits[0]
                probs = torch.softmax(logits, dim=-1)
                scores.append(float(probs[self.entailment_id].item()))
                confidences.append(float(torch.max(probs).item()))

        return sum(scores) / len(scores), sum(confidences) / len(confidences)

    def analyze(self, text: str) -> AnalysisResult:
        emotional_intensity, c1 = self._entailment_score(
            text, "This text uses emotionally manipulative or sensational language."
        )
        source_transparency, c2 = self._entailment_score(
            text, "This text cites specific, verifiable sources and concrete evidence."
        )
        structure_predictability, c3 = self._entailment_score(
            text,
            "This text uses repetitive, generic, overly polished, low-specificity phrasing typical of formulaic or AI-generated writing.",
        )

        risk_score = _risk_score(emotional_intensity, source_transparency, structure_predictability)
        source_weakness = 1 - source_transparency
        label_confidence = round((c1 + c2 + c3) / 3.0, 4)
        risk_label = _label_from_score(risk_score)

        signals = [
            SignalScore(
                name="Emotional Intensity",
                value=round(emotional_intensity, 4),
                note="RoBERTa NLI score for manipulative/sensational phrasing.",
            ),
            SignalScore(
                name="Source Weakness",
                value=round(source_weakness, 4),
                note="Inverse of RoBERTa source/evidence support score.",
            ),
            SignalScore(
                name="Generic AI-like Style",
                value=round(structure_predictability, 4),
                note="RoBERTa NLI score for generic, repetitive, AI-like phrasing patterns.",
            ),
            SignalScore(
                name="Label Confidence",
                value=label_confidence,
                note="Average classification confidence across RoBERTa sub-signals.",
            ),
        ]

        return AnalysisResult(
            text_hash=hashlib.sha256(text.encode("utf-8")).hexdigest(),
            risk_score=risk_score,
            risk_label=risk_label,
            signals=signals,
        )


def _fallback_analyze(text: str) -> AnalysisResult:
    words = re.findall(r"\w+", text)
    length = max(len(words), 1)
    emotional_hits = _count_matches(text, FALLBACK_EMOTIONAL_TERMS)
    source_hits = _count_matches(text, FALLBACK_SOURCE_HINTS)
    exclamation_count = text.count("!")
    all_caps_ratio = sum(1 for w in words if len(w) > 2 and w.isupper()) / length

    emotional_intensity = min((emotional_hits / 5.0) + (exclamation_count / 12.0), 1.0)
    source_transparency = min(source_hits / 5.0, 1.0)
    structure_predictability = min((all_caps_ratio * 2.5) + (0.35 if length < 80 else 0.15), 1.0)

    risk_score = _risk_score(emotional_intensity, source_transparency, structure_predictability)
    source_weakness = 1 - source_transparency
    risk_label = _label_from_score(risk_score)

    signals = [
        SignalScore(
            name="Emotional Intensity",
            value=round(emotional_intensity, 4),
            note="Fallback heuristic: manipulative or sensational wording cues.",
        ),
        SignalScore(
            name="Source Weakness",
            value=round(source_weakness, 4),
            note="Fallback heuristic: missing or unclear source/evidence cues.",
        ),
        SignalScore(
            name="Generic AI-like Style",
            value=round(structure_predictability, 4),
            note="Fallback heuristic: repetitive, generic, or AI-like style cues.",
        ),
    ]

    return AnalysisResult(
        text_hash=hashlib.sha256(text.encode("utf-8")).hexdigest(),
        risk_score=risk_score,
        risk_label=risk_label,
        signals=signals,
    )


def _load_roberta_worker() -> None:
    global _roberta_instance, _roberta_loading, _roberta_error
    try:
        instance = RobertaRiskAnalyzer()
        with _loader_lock:
            _roberta_instance = instance
            _roberta_error = None
    except Exception as exc:
        with _loader_lock:
            _roberta_error = str(exc)
        logger.exception("RoBERTa background load failed")
    finally:
        with _loader_lock:
            _roberta_loading = False


def _start_roberta_loading_if_needed() -> None:
    global _roberta_loading
    with _loader_lock:
        if _roberta_instance is not None or _roberta_loading:
            return
        _roberta_loading = True
    Thread(target=_load_roberta_worker, daemon=True).start()


def warmup_roberta() -> None:
    if not settings.roberta_enabled:
        logger.warning("RoBERTa preload skipped because ROBERTA_ENABLED is false")
        return
    logger.warning("Starting RoBERTa preload")
    _start_roberta_loading_if_needed()


def analyze_text(text: str) -> AnalysisResult:
    global _roberta_error
    if not settings.roberta_enabled:
        return _fallback_analyze(text)

    if _roberta_instance is None:
        _start_roberta_loading_if_needed()
        if _roberta_loading:
            logger.warning("RoBERTa still loading, using fallback analyzer for this request")
        elif _roberta_error:
            logger.warning("RoBERTa unavailable (%s), using fallback analyzer", _roberta_error)
        return _fallback_analyze(text)

    try:
        logger.warning("Running RoBERTa inference")
        return _roberta_instance.analyze(text)
    except Exception:
        _roberta_error = "inference failure"
        logger.exception("RoBERTa inference failed, using fallback analyzer")
        return _fallback_analyze(text)
