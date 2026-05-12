from fastapi import Depends
from fastapi.security import OAuth2PasswordBearer

from app.models.user import UserProfile
from app.services.user_service import get_user_from_access_token


oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login")


def get_current_user(token: str = Depends(oauth2_scheme)) -> UserProfile:
    return get_user_from_access_token(token)
