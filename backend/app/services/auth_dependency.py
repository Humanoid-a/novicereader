from fastapi import Depends, Header, HTTPException, Query
from fastapi.security import OAuth2PasswordBearer

from app.models.user import UserProfile
from app.services.user_service import get_user_from_access_token


oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login")


def get_current_user(token: str = Depends(oauth2_scheme)) -> UserProfile:
    return get_user_from_access_token(token)


def get_current_user_for_file_request(
    authorization: str | None = Header(None),
    access_token: str | None = Query(None),
) -> UserProfile:
    token = access_token

    if not token and authorization:
        scheme, _, value = authorization.partition(" ")

        if scheme.lower() == "bearer" and value:
            token = value

    if not token:
        raise HTTPException(
            status_code=401,
            detail="Not authenticated",
            headers={"WWW-Authenticate": "Bearer"},
        )

    return get_user_from_access_token(token)
