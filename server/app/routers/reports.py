from urllib.parse import urlparse

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import desc, select
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Analysis
from app.schemas import DomainReportHistoryItem, DomainReportHistoryResponse, HistoryItemResponse, ReportResponse, SignalOut
from app.security import get_current_user

router = APIRouter(tags=["reports"])


def _source_group(url: str) -> str:
    parsed = urlparse(url)
    if parsed.scheme == "file":
        filename = parsed.path.rstrip("/").split("/")[-1] or "local file"
        return f"local file: {filename}"
    host = parsed.netloc or parsed.path.split("/")[0]
    return host.lower().removeprefix("www.") or "unknown"


@router.get("/history", response_model=list[HistoryItemResponse])
def get_history(db: Session = Depends(get_db), user=Depends(get_current_user)) -> list[HistoryItemResponse]:
    rows = db.scalars(
        select(Analysis)
        .where(Analysis.user_id == user.id)
        .order_by(desc(Analysis.created_at))
        .limit(200)
    ).all()
    return [
        HistoryItemResponse(
            id=row.id,
            source_url=row.source_url,
            source_excerpt=(row.source_text or "").strip().replace("\n", " ")[:220],
            risk_score=row.risk_score,
            risk_label=row.risk_label,
            ai_detected=row.ai_detected,
            ai_confidence=row.ai_confidence,
            created_at=row.created_at,
        )
        for row in rows
    ]


@router.get("/report/{analysis_id}", response_model=ReportResponse)
def get_report(
    analysis_id: int,
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
) -> ReportResponse:
    row = db.scalar(select(Analysis).where(Analysis.id == analysis_id, Analysis.user_id == user.id))
    if not row:
        raise HTTPException(status_code=404, detail="Report not found")

    return ReportResponse(
        id=row.id,
        source_url=row.source_url,
        source_text=row.source_text,
        risk_score=row.risk_score,
        risk_label=row.risk_label,
        ai_detected=row.ai_detected,
        ai_confidence=row.ai_confidence,
        ai_reasoning=row.ai_reasoning,
        signals=[SignalOut(name=s.name, value=s.value, note=s.note) for s in row.signals],
        created_at=row.created_at,
    )


@router.get("/domain-history", response_model=DomainReportHistoryResponse)
def get_domain_history(
    domain: str,
    limit: int = 30,
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
) -> DomainReportHistoryResponse:
    clean_domain = domain.strip().lower().removeprefix("www.")
    clean_limit = min(max(limit, 1), 60)
    if clean_limit not in (30, 45, 60):
        clean_limit = 30

    rows = db.scalars(
        select(Analysis).where(Analysis.user_id == user.id).order_by(desc(Analysis.created_at))
    ).all()
    matching_rows = [row for row in rows if _source_group(row.source_url).lower() == clean_domain][:clean_limit]

    return DomainReportHistoryResponse(
        domain=clean_domain,
        limit=clean_limit,
        items=[
            DomainReportHistoryItem(
                id=row.id,
                source_url=row.source_url,
                risk_score=row.risk_score,
                risk_label=row.risk_label,
                ai_detected=row.ai_detected,
                signals=[SignalOut(name=s.name, value=s.value, note=s.note) for s in row.signals],
                created_at=row.created_at,
            )
            for row in matching_rows
        ],
    )


@router.delete("/report/{analysis_id}")
def delete_report(
    analysis_id: int,
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
) -> dict[str, int]:
    row = db.scalar(select(Analysis).where(Analysis.id == analysis_id, Analysis.user_id == user.id))
    if not row:
        raise HTTPException(status_code=404, detail="Report not found")
    db.delete(row)
    db.commit()
    return {"deleted": 1}


@router.delete("/history")
def clear_history(db: Session = Depends(get_db), user=Depends(get_current_user)) -> dict[str, int]:
    rows = db.scalars(select(Analysis).where(Analysis.user_id == user.id)).all()
    count = len(rows)
    for row in rows:
        db.delete(row)
    db.commit()
    return {"deleted": count}
