from fastapi import APIRouter
from pydantic import BaseModel

from app.models.user import KnowledgeProfileSummary, UserKnowledgeProfile, UserProfile
from app.services.user_service import (
    create_user_profile,
    get_knowledge_profile_summary,
    get_user_profile,
    update_user_knowledge_profile,
)

router = APIRouter(prefix="/api/users", tags=["users"])


class CreateUserRequest(BaseModel):
    id: str
    displayName: str | None = None
    knowledgeProfile: UserKnowledgeProfile | None = None


@router.get("/{user_id}", response_model=UserProfile)
def read_user_profile(user_id: str):
    """
    Read a user profile, creating a default profile when none exists yet.
    """

    return get_user_profile(user_id)


@router.post("", response_model=UserProfile)
def create_user(request: CreateUserRequest):
    """
    Register a user with an explicit profile.

    If the caller sends a default knowledge profile, it represents an empty
    onboarding form and uses the high-school baseline.
    """

    return create_user_profile(
        user_id=request.id,
        display_name=request.displayName,
        knowledge_profile=request.knowledgeProfile,
    )


@router.put("/{user_id}/knowledge-profile", response_model=UserProfile)
def put_user_knowledge_profile(
    user_id: str,
    knowledge_profile: UserKnowledgeProfile,
):
    return update_user_knowledge_profile(user_id, knowledge_profile)


@router.get("/{user_id}/knowledge-summary", response_model=KnowledgeProfileSummary)
def read_user_knowledge_summary(user_id: str):
    return get_knowledge_profile_summary(user_id)
