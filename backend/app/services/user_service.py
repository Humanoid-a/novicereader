from datetime import datetime, timezone

from fastapi import HTTPException

from app.models.user import KnowledgeProfileSummary, UserKnowledgeProfile, UserProfile
from app.storage.json_store import read_json, write_json
from app.storage.paths import USERS_DB_PATH


TEST_USER_ID = "test-user-001"


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def read_users() -> list[dict]:
    return read_json(USERS_DB_PATH, [])


def write_users(users: list[dict]) -> None:
    write_json(USERS_DB_PATH, users)


def default_knowledge_profile() -> UserKnowledgeProfile:
    return UserKnowledgeProfile()


def default_user_profile(user_id: str, display_name: str | None = None) -> UserProfile:
    timestamp = now_iso()

    return UserProfile(
        id=user_id,
        displayName=display_name or ("Test User" if user_id == TEST_USER_ID else "NoviceReader User"),
        knowledgeProfile=default_knowledge_profile(),
        createdAt=timestamp,
        updatedAt=timestamp,
    )


def ensure_user_profile(user_id: str, display_name: str | None = None) -> UserProfile:
    users = read_users()

    for user in users:
        if user["id"] == user_id:
            return UserProfile(**user)

    user = default_user_profile(user_id, display_name)
    users.append(user.model_dump())
    write_users(users)

    return user


def get_user_profile(user_id: str) -> UserProfile:
    return ensure_user_profile(user_id)


def create_user_profile(
    user_id: str,
    display_name: str | None = None,
    knowledge_profile: UserKnowledgeProfile | None = None,
) -> UserProfile:
    users = read_users()

    if any(user["id"] == user_id for user in users):
        raise HTTPException(status_code=409, detail="User already exists")

    user = default_user_profile(user_id, display_name)

    if knowledge_profile is not None:
        user.knowledgeProfile = knowledge_profile
        user.updatedAt = now_iso()

    users.append(user.model_dump())
    write_users(users)

    return user


def update_user_knowledge_profile(
    user_id: str,
    knowledge_profile: UserKnowledgeProfile,
) -> UserProfile:
    users = read_users()

    for index, user in enumerate(users):
        if user["id"] != user_id:
            continue

        updated_user = UserProfile(**user)
        updated_user.knowledgeProfile = knowledge_profile
        updated_user.updatedAt = now_iso()
        users[index] = updated_user.model_dump()
        write_users(users)

        return updated_user

    user = default_user_profile(user_id)
    user.knowledgeProfile = knowledge_profile
    user.updatedAt = now_iso()
    users.append(user.model_dump())
    write_users(users)

    return user


def summarize_knowledge_profile(user: UserProfile) -> KnowledgeProfileSummary:
    profile = user.knowledgeProfile

    assumptions: list[str] = []
    known_information: list[str] = []
    knowledge_gaps: list[str] = []

    if profile.assumedFromEmptyOnboarding:
        assumptions.append(
            "The user has not filled out onboarding, so NoviceReader assumes a high-school baseline."
        )

    if profile.backgroundSummary:
        known_information.append(profile.backgroundSummary)

    if profile.knownCourses:
        known_information.append("Courses: " + ", ".join(profile.knownCourses))

    if profile.knownConcepts:
        known_information.append("Known concepts: " + ", ".join(profile.knownConcepts))

    if profile.knownDomains:
        known_information.append("Known domains: " + ", ".join(profile.knownDomains))

    if profile.learningGoals:
        known_information.append("Learning goals: " + ", ".join(profile.learningGoals))

    if profile.weakAreas:
        knowledge_gaps.extend(profile.weakAreas)

    if not profile.knownCourses and not profile.knownConcepts and not profile.knownDomains:
        knowledge_gaps.append("No specific subject-matter knowledge has been provided yet.")

    guidance = (
        f"Use a {profile.explanationPreference} tone with {profile.explanationDepth} depth. "
        "Define specialized terms before using them, connect ideas to familiar examples, "
        "and avoid assuming college-level research or math background unless the profile says otherwise."
    )

    return KnowledgeProfileSummary(
        userId=user.id,
        overview=(
            f"{user.displayName} is best modeled as a {profile.educationLevel.replace('_', ' ')} "
            "reader for now."
        ),
        assumedLevel=profile.educationLevel,
        assumptions=assumptions,
        knownInformation=known_information,
        knowledgeGaps=knowledge_gaps,
        explanationGuidance=guidance,
    )


def get_knowledge_profile_summary(user_id: str) -> KnowledgeProfileSummary:
    return summarize_knowledge_profile(get_user_profile(user_id))
