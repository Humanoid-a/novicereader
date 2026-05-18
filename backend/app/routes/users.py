from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.models.user import (
    AuthToken,
    KnowledgeProfileSummary,
    LoginUserRequest,
    RegisterUserRequest,
    SaveKnowledgeProfileRequest,
    UserKnowledgeProfile,
    UserKnowledgeProfileListItem,
    UserKnowledgeProfileRecord,
    UserProfile,
)
from app.models.usage import TokenUsageSummary
from app.services.auth_dependency import get_current_user
from app.services.user_service import (
    delete_user_knowledge_profile_record,
    get_user_knowledge_profile_record,
    get_knowledge_profile_summary,
    list_user_knowledge_profile_summaries,
    login_user,
    register_user,
    save_user_knowledge_profile_record,
    select_user_knowledge_profile_record,
    update_user_knowledge_profile,
)
from app.services.usage_service import get_user_token_usage_summary

router = APIRouter(prefix="/api/users", tags=["users"])
auth_router = APIRouter(prefix="/api/auth", tags=["auth"])


class CreateUserRequest(BaseModel):
    id: str
    displayName: str | None = None
    knowledgeProfile: UserKnowledgeProfile | None = None


@router.get("/{user_id}", response_model=UserProfile)
def read_user_profile(
    user_id: str,
    current_user: UserProfile = Depends(get_current_user),
):
    """
    Read a user profile, creating a default profile when none exists yet.
    """

    if user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Cannot read another user's profile")

    return current_user


@router.post("", response_model=UserProfile)
def create_user(request: CreateUserRequest):
    """
    Register a user with an explicit profile.

    If the caller sends a default knowledge profile, it represents an empty
    onboarding form and uses the high-school baseline.
    """

    raise HTTPException(
        status_code=410,
        detail="Use /api/auth/register with a registration code and password.",
    )


@auth_router.post("/register", response_model=AuthToken)
def register(request: RegisterUserRequest):
    return register_user(request)


@auth_router.post("/login", response_model=AuthToken)
def login(request: LoginUserRequest):
    return login_user(request)


@auth_router.get("/me", response_model=UserProfile)
def read_current_user(current_user: UserProfile = Depends(get_current_user)):
    return current_user


@router.put("/me/knowledge-profile", response_model=UserProfile)
def put_user_knowledge_profile(
    knowledge_profile: UserKnowledgeProfile,
    current_user: UserProfile = Depends(get_current_user),
):
    return update_user_knowledge_profile(current_user.id, knowledge_profile)


@router.get("/me/knowledge-profiles", response_model=list[UserKnowledgeProfileListItem])
def list_user_knowledge_profiles(
    current_user: UserProfile = Depends(get_current_user),
):
    return list_user_knowledge_profile_summaries(current_user.id)


@router.get("/me/knowledge-profiles/{profile_id}", response_model=UserKnowledgeProfileRecord)
def read_user_knowledge_profile(
    profile_id: str,
    current_user: UserProfile = Depends(get_current_user),
):
    return get_user_knowledge_profile_record(current_user.id, profile_id)


@router.put("/me/knowledge-profiles", response_model=UserKnowledgeProfileRecord)
def put_user_knowledge_profile_record(
    request: SaveKnowledgeProfileRequest,
    current_user: UserProfile = Depends(get_current_user),
):
    return save_user_knowledge_profile_record(current_user.id, request)


@router.post("/me/knowledge-profiles/{profile_id}/select", response_model=UserProfile)
def select_user_knowledge_profile(
    profile_id: str,
    current_user: UserProfile = Depends(get_current_user),
):
    return select_user_knowledge_profile_record(current_user.id, profile_id)


@router.delete("/me/knowledge-profiles/{profile_id}", response_model=UserKnowledgeProfileListItem)
def delete_user_knowledge_profile(
    profile_id: str,
    current_user: UserProfile = Depends(get_current_user),
):
    return delete_user_knowledge_profile_record(current_user.id, profile_id)


@router.get("/me/knowledge-summary", response_model=KnowledgeProfileSummary)
def read_user_knowledge_summary(current_user: UserProfile = Depends(get_current_user)):
    return get_knowledge_profile_summary(current_user.id)


@router.get("/me/token-usage", response_model=TokenUsageSummary)
def read_user_token_usage(current_user: UserProfile = Depends(get_current_user)):
    return get_user_token_usage_summary(current_user.id)
