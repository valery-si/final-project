import logging

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Analysis, Signal, TldrSummary
from app.schemas import (
    AnalyzeRequest,
    AnalyzeResponse,
    CheckAIRequest,
    CheckAIResponse,
    SignalOut,
    TldrRequest,
    TldrResponse,
    TldrStatusResponse,
)
from app.security import get_current_user
from app.services.ai_audit import run_ai_audit
from app.services.analyzer import analyze_text
from app.services.tldr import get_local_neural_status, run_local_neural_tldr, run_openai_tldr

router = APIRouter(tags=["analysis"])
logger = logging.getLogger(__name__)


@router.post("/analyze", response_model=AnalyzeResponse)
def analyze(
    payload: AnalyzeRequest,
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
) -> AnalyzeResponse:
    logger.info("Analyze request started: user=%s text_len=%s", user.username, len(payload.text))
    result = analyze_text(payload.text)
    analysis = Analysis(
        user_id=user.id,
        text_hash=result.text_hash,
        source_url=payload.source_url,
        source_text=payload.text,
        risk_score=result.risk_score,
        risk_label=result.risk_label,
        ai_detected=False,
    )
    db.add(analysis)
    db.flush()

    for signal in result.signals:
        db.add(
            Signal(
                analysis_id=analysis.id,
                name=signal.name,
                value=signal.value,
                note=signal.note,
            )
        )
    db.commit()
    logger.info("Analyze request completed: user=%s analysis_id=%s", user.username, analysis.id)

    return AnalyzeResponse(
        id=analysis.id,
        risk_score=analysis.risk_score,
        risk_label=analysis.risk_label,
        ai_detected=analysis.ai_detected,
        signals=[
            SignalOut(name=s.name, value=s.value, note=s.note)
            for s in result.signals
        ],
    )


@router.post("/check-ai", response_model=CheckAIResponse)
def check_ai(
    payload: CheckAIRequest,
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
) -> CheckAIResponse:
    analysis = db.scalar(
        select(Analysis).where(Analysis.id == payload.analysis_id, Analysis.user_id == user.id)
    )
    if not analysis:
        raise HTTPException(status_code=404, detail="Analysis not found")
    if not user.api_key:
        raise HTTPException(status_code=400, detail="No API key configured")

    try:
        ai_detected, ai_confidence, ai_reasoning = run_ai_audit(analysis.source_text, user.api_key)
    except RuntimeError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc

    analysis.ai_detected = ai_detected
    analysis.ai_confidence = ai_confidence
    analysis.ai_reasoning = ai_reasoning
    db.commit()

    return CheckAIResponse(
        analysis_id=analysis.id,
        ai_detected=ai_detected,
        ai_confidence=ai_confidence,
        ai_reasoning=ai_reasoning,
    )


@router.post("/tldr", response_model=TldrResponse)
def summarize_text(
    payload: TldrRequest,
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
) -> TldrResponse:
    summary_text = ""
    mode = payload.mode
    if mode in ("local", "local-fast"):
        mode = "local-neural"

    if mode == "openai":
        if not user.api_key:
            raise HTTPException(status_code=400, detail="No API key configured")
        try:
            summary_text = run_openai_tldr(payload.text, user.api_key)
        except RuntimeError as exc:
            raise HTTPException(status_code=502, detail=str(exc)) from exc
    else:
        try:
            summary_text = run_local_neural_tldr(payload.text)
        except RuntimeError as exc:
            raise HTTPException(status_code=502, detail=str(exc)) from exc

    row = TldrSummary(
        user_id=user.id,
        source_url=payload.source_url,
        source_text=payload.text,
        mode=mode,
        summary=summary_text,
    )
    db.add(row)
    db.commit()
    db.refresh(row)

    return TldrResponse(
        id=row.id,
        summary=row.summary,
        source_url=row.source_url,
        mode=mode,
        created_at=row.created_at,
    )


@router.get("/tldr-status", response_model=TldrStatusResponse)
def tldr_status(user=Depends(get_current_user)) -> TldrStatusResponse:
    status = get_local_neural_status(start_loading=True)
    return TldrStatusResponse(
        mode="local-neural",
        status=status["status"],
        model=status["model"],
        device=status["device"],
        error=status["error"],
    )
