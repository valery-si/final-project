import logging
import time

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from starlette.requests import Request

from app.config import settings
from app.database import Base, engine
from app.routers import analyze, reports, settings as settings_router
from app.services.analyzer import warmup_roberta
from app.services.tldr import warmup_tldr_neural

app = FastAPI(title=settings.app_name)
logger = logging.getLogger(__name__)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.client_base_url],
    allow_origin_regex=r"chrome-extension://.*",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def on_startup() -> None:
    Base.metadata.create_all(bind=engine)
    if settings.preload_roberta:
        warmup_roberta()
    if settings.preload_tldr:
        warmup_tldr_neural()


@app.middleware("http")
async def log_requests(request: Request, call_next):
    started = time.perf_counter()
    logger.warning("Request started: %s %s", request.method, request.url.path)
    response = await call_next(request)
    elapsed_ms = round((time.perf_counter() - started) * 1000, 2)
    logger.warning(
        "Request finished: %s %s status=%s elapsed_ms=%s",
        request.method,
        request.url.path,
        response.status_code,
        elapsed_ms,
    )
    return response


@app.get("/health")
def healthcheck() -> dict[str, str]:
    return {"status": "ok"}


app.include_router(analyze.router, prefix=settings.api_prefix)
app.include_router(reports.router, prefix=settings.api_prefix)
app.include_router(settings_router.router, prefix=settings.api_prefix)
