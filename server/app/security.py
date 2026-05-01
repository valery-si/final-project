from fastapi import Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import UserProfile

LOCAL_USERNAME = "local-user"


def get_current_user(db: Session = Depends(get_db)) -> UserProfile:
    user = db.scalar(select(UserProfile).where(UserProfile.username == LOCAL_USERNAME))
    if user:
        return user

    user = UserProfile(username=LOCAL_USERNAME)
    db.add(user)
    db.commit()
    db.refresh(user)
    return user
