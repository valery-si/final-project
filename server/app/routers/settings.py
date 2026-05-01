from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.database import get_db
from app.schemas import ApiKeyRequest, SettingsResponse
from app.security import get_current_user

router = APIRouter(prefix="/settings", tags=["settings"])


def _api_key_preview(api_key: str | None) -> str | None:
    if not api_key:
        return None
    clean = api_key.strip()
    if not clean:
        return None
    if len(clean) <= 7:
        return f"{clean[:3]}...{clean[-1:]}"
    return f"{clean[:3]}...{clean[-4:]}"


@router.get("", response_model=SettingsResponse)
def get_settings(user=Depends(get_current_user)) -> SettingsResponse:
    return SettingsResponse(
        has_api_key=bool(user.api_key),
        api_key_preview=_api_key_preview(user.api_key),
    )


@router.put("/api-key", response_model=SettingsResponse)
def set_api_key(
    payload: ApiKeyRequest,
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
) -> SettingsResponse:
    user.api_key = payload.api_key.strip()
    db.add(user)
    db.commit()
    return SettingsResponse(
        has_api_key=True,
        api_key_preview=_api_key_preview(user.api_key),
    )


@router.delete("/api-key", response_model=SettingsResponse)
def delete_api_key(
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
) -> SettingsResponse:
    user.api_key = None
    db.add(user)
    db.commit()
    return SettingsResponse(has_api_key=False, api_key_preview=None)
