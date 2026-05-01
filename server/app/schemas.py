from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field


class SignalOut(BaseModel):
    name: str
    value: float
    note: str


class AnalyzeRequest(BaseModel):
    text: str = Field(min_length=20, max_length=20000)
    source_url: str = Field(min_length=4, max_length=4096)


class AnalyzeResponse(BaseModel):
    id: int
    risk_score: float
    risk_label: str
    ai_detected: bool
    signals: list[SignalOut]


class ReportResponse(BaseModel):
    id: int
    source_url: str
    source_text: str
    risk_score: float
    risk_label: str
    ai_detected: bool
    ai_confidence: float | None = None
    ai_reasoning: str | None = None
    signals: list[SignalOut]
    created_at: datetime


class DomainReportHistoryItem(BaseModel):
    id: int
    source_url: str
    risk_score: float
    risk_label: str
    ai_detected: bool
    signals: list[SignalOut]
    created_at: datetime


class DomainReportHistoryResponse(BaseModel):
    domain: str
    limit: int
    items: list[DomainReportHistoryItem]


class HistoryItemResponse(BaseModel):
    id: int
    source_url: str
    source_excerpt: str
    risk_score: float
    risk_label: str
    ai_detected: bool
    ai_confidence: float | None = None
    created_at: datetime


class CheckAIRequest(BaseModel):
    analysis_id: int


class CheckAIResponse(BaseModel):
    analysis_id: int
    ai_detected: bool
    ai_confidence: float
    ai_reasoning: str


class TldrRequest(BaseModel):
    text: str = Field(min_length=20, max_length=20000)
    source_url: str = Field(min_length=4, max_length=4096)
    mode: Literal["local-neural", "openai"] = "local-neural"


class TldrResponse(BaseModel):
    id: int
    summary: str
    source_url: str
    mode: Literal["local-neural", "openai"]
    created_at: datetime


class TldrStatusResponse(BaseModel):
    mode: Literal["local-neural"] = "local-neural"
    status: Literal["idle", "loading", "ready", "failed"]
    model: str
    device: Literal["cpu", "cuda"] | None = None
    error: str | None = None


class ApiKeyRequest(BaseModel):
    api_key: str = Field(min_length=20, max_length=256)


class SettingsResponse(BaseModel):
    has_api_key: bool
    api_key_preview: str | None = None
