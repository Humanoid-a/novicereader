from datetime import datetime, timedelta, timezone
import re
import secrets

from fastapi import HTTPException
import jwt
from jwt.exceptions import InvalidTokenError
from pwdlib import PasswordHash

from app.config import settings
from app.models.user import (
    AuthToken,
    KnowledgeProfileSummary,
    LoginUserRequest,
    RegisterUserRequest,
    StoredUserProfile,
    UserKnowledgeProfile,
    UserProfile,
)
from app.storage.json_store import read_json, write_json
from app.storage.paths import USERS_DB_PATH


TEST_USER_ID = "test-user-001"
USERNAME_PATTERN = re.compile(r"^[a-z0-9][a-z0-9_-]{2,31}$")
password_hash = PasswordHash.recommended()
DUMMY_PASSWORD_HASH = password_hash.hash("novicereader-dummy-password")


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def read_users() -> list[dict]:
    return read_json(USERS_DB_PATH, [])


def write_users(users: list[dict]) -> None:
    write_json(USERS_DB_PATH, users)


def default_knowledge_profile() -> UserKnowledgeProfile:
    return UserKnowledgeProfile()


def normalize_username(username: str) -> str:
    normalized = username.strip().lower()

    if not USERNAME_PATTERN.fullmatch(normalized):
        raise HTTPException(
            status_code=400,
            detail=(
                "Username must be 3-32 characters and use only lowercase "
                "letters, numbers, underscores, or hyphens."
            ),
        )

    return normalized


def validate_password(password: str) -> None:
    if len(password) < 8:
        raise HTTPException(
            status_code=400,
            detail="Password must be at least 8 characters.",
        )


def public_user(user: StoredUserProfile | UserProfile | dict) -> UserProfile:
    if isinstance(user, dict):
        data = user.copy()
    else:
        data = user.model_dump()

    data.pop("passwordHash", None)
    data.pop("disabled", None)
    data.setdefault("username", data["id"])
    data.setdefault("displayName", "NoviceReader User")

    return UserProfile(**data)


def stored_user_from_dict(user: dict) -> StoredUserProfile:
    data = user.copy()
    data.setdefault("username", data["id"])
    data.setdefault("displayName", "NoviceReader User")
    data.setdefault("disabled", False)

    if "passwordHash" not in data:
        raise HTTPException(status_code=401, detail="User must register again")

    return StoredUserProfile(**data)


def default_user_profile(user_id: str, display_name: str | None = None) -> UserProfile:
    timestamp = now_iso()
    username = normalize_username(user_id)

    return UserProfile(
        id=username,
        username=username,
        displayName=display_name or "NoviceReader User",
        knowledgeProfile=default_knowledge_profile(),
        createdAt=timestamp,
        updatedAt=timestamp,
    )


def ensure_user_profile(user_id: str, display_name: str | None = None) -> UserProfile:
    users = read_users()
    normalized_user_id = normalize_username(user_id)

    for user in users:
        if user["id"] == normalized_user_id:
            return public_user(user)

    raise HTTPException(status_code=404, detail="User not found")


def get_user_profile(user_id: str) -> UserProfile:
    return ensure_user_profile(user_id)


def get_stored_user(user_id: str) -> StoredUserProfile:
    users = read_users()
    normalized_user_id = normalize_username(user_id)

    for user in users:
        if user["id"] == normalized_user_id:
            return stored_user_from_dict(user)

    raise HTTPException(status_code=404, detail="User not found")


def create_user_profile(
    user_id: str,
    display_name: str | None = None,
    knowledge_profile: UserKnowledgeProfile | None = None,
) -> UserProfile:
    users = read_users()

    normalized_user_id = normalize_username(user_id)

    if any(user["id"] == normalized_user_id for user in users):
        raise HTTPException(status_code=409, detail="User already exists")

    user = default_user_profile(normalized_user_id, display_name)

    if knowledge_profile is not None:
        user.knowledgeProfile = knowledge_profile
        user.updatedAt = now_iso()

    users.append(user.model_dump())
    write_users(users)

    return user


def register_user(request: RegisterUserRequest) -> AuthToken:
    if not settings.registration_code:
        raise HTTPException(
            status_code=503,
            detail="Registration is not configured. Ask the admin for access.",
        )

    if not secrets.compare_digest(request.registrationCode, settings.registration_code):
        raise HTTPException(status_code=403, detail="Invalid registration code")

    username = normalize_username(request.username)
    validate_password(request.password)

    users = read_users()

    existing_user_index = next(
        (index for index, user in enumerate(users) if user.get("id") == username),
        None,
    )

    if existing_user_index is not None and users[existing_user_index].get("passwordHash"):
        raise HTTPException(status_code=409, detail="Username is already taken")

    timestamp = now_iso()

    if existing_user_index is None:
        user = StoredUserProfile(
            id=username,
            username=username,
            displayName=request.displayName or username,
            passwordHash=password_hash.hash(request.password),
            knowledgeProfile=request.knowledgeProfile or default_knowledge_profile(),
            createdAt=timestamp,
            updatedAt=timestamp,
        )
        users.append(user.model_dump())
    else:
        existing_user = users[existing_user_index]
        existing_user["username"] = username
        existing_user["displayName"] = request.displayName or existing_user.get("displayName") or username
        existing_user["passwordHash"] = password_hash.hash(request.password)
        existing_user["disabled"] = False
        existing_user["updatedAt"] = timestamp

        if request.knowledgeProfile is not None:
            existing_user["knowledgeProfile"] = request.knowledgeProfile.model_dump()

        users[existing_user_index] = existing_user
        user = stored_user_from_dict(existing_user)

    write_users(users)

    return AuthToken(
        accessToken=create_access_token(user.id),
        user=public_user(user),
    )


def authenticate_user(username: str, password: str) -> StoredUserProfile | None:
    normalized_username = normalize_username(username)
    users = read_users()
    stored_user: StoredUserProfile | None = None

    for user in users:
        if user.get("id") == normalized_username:
            stored_user = stored_user_from_dict(user)
            break

    if stored_user is None:
        password_hash.verify(password, DUMMY_PASSWORD_HASH)
        return None

    if stored_user.disabled:
        return None

    if not password_hash.verify(password, stored_user.passwordHash):
        return None

    return stored_user


def login_user(request: LoginUserRequest) -> AuthToken:
    user = authenticate_user(request.username, request.password)

    if user is None:
        raise HTTPException(status_code=401, detail="Invalid username or password")

    return AuthToken(
        accessToken=create_access_token(user.id),
        user=public_user(user),
    )


def require_auth_secret_key() -> str:
    if not settings.auth_secret_key or settings.auth_secret_key == "replace_with_output_of_openssl_rand_hex_32":
        raise HTTPException(
            status_code=503,
            detail="Authentication secret is not configured.",
        )

    return settings.auth_secret_key


def create_access_token(user_id: str) -> str:
    expire_at = datetime.now(timezone.utc) + timedelta(
        minutes=settings.access_token_expire_minutes
    )
    payload = {
        "sub": user_id,
        "exp": expire_at,
        "iat": datetime.now(timezone.utc),
        "type": "access",
    }

    return jwt.encode(
        payload,
        require_auth_secret_key(),
        algorithm=settings.auth_algorithm,
    )


def get_user_from_access_token(token: str) -> UserProfile:
    credentials_exception = HTTPException(
        status_code=401,
        detail="Invalid or expired authentication token",
        headers={"WWW-Authenticate": "Bearer"},
    )

    try:
        payload = jwt.decode(
            token,
            require_auth_secret_key(),
            algorithms=[settings.auth_algorithm],
        )
        user_id = payload.get("sub")

        if not isinstance(user_id, str):
            raise credentials_exception
    except InvalidTokenError as error:
        raise credentials_exception from error

    stored_user = get_stored_user(user_id)

    if stored_user.disabled:
        raise HTTPException(status_code=403, detail="User account is disabled")

    return public_user(stored_user)


def update_user_knowledge_profile(
    user_id: str,
    knowledge_profile: UserKnowledgeProfile,
) -> UserProfile:
    users = read_users()

    for index, user in enumerate(users):
        if user["id"] != user_id:
            continue

        user["knowledgeProfile"] = knowledge_profile.model_dump()
        user["updatedAt"] = now_iso()
        users[index] = user
        write_users(users)

        return public_user(user)

    raise HTTPException(status_code=404, detail="User not found")


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
