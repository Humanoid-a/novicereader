from datetime import datetime, timedelta, timezone
import re
import secrets
import uuid

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
    SaveKnowledgeProfileRequest,
    StoredUserProfile,
    UserKnowledgeProfile,
    UserKnowledgeProfileListItem,
    UserKnowledgeProfileRecord,
    UserProfile,
)
from app.storage.data_store import get_user_record, save_user_record


TEST_USER_ID = "test-user-001"
USERNAME_PATTERN = re.compile(r"^[a-z0-9][a-z0-9_-]{2,31}$")
password_hash = PasswordHash.recommended()
DUMMY_PASSWORD_HASH = password_hash.hash("novicereader-dummy-password")
DEFAULT_KNOWLEDGE_DESCRIPTION = (
    "Assume a curious high-school student who may need technical terms, "
    "math notation, and research methods explained from first principles."
)
DEFAULT_KNOWLEDGE_PROFILE_NAME = "Highschool"


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def default_knowledge_profile() -> UserKnowledgeProfile:
    return UserKnowledgeProfile()


def normalize_knowledge_profile_name(name: str) -> str:
    normalized = re.sub(r"\s+", " ", name).strip()

    if not normalized:
        raise HTTPException(status_code=400, detail="Profile name is required")

    if len(normalized) > 80:
        raise HTTPException(status_code=400, detail="Profile name is too long")

    return normalized


def default_knowledge_profile_record(
    knowledge_profile: UserKnowledgeProfile | dict | None = None,
) -> UserKnowledgeProfileRecord:
    timestamp = now_iso()
    profile = (
        knowledge_profile
        if isinstance(knowledge_profile, UserKnowledgeProfile)
        else UserKnowledgeProfile(**(knowledge_profile or {}))
    )

    return UserKnowledgeProfileRecord(
        id=str(uuid.uuid4()),
        name=DEFAULT_KNOWLEDGE_PROFILE_NAME,
        knowledgeProfile=profile,
        createdAt=timestamp,
        updatedAt=timestamp,
    )


def coerce_knowledge_profile_record(record: object) -> UserKnowledgeProfileRecord | None:
    if not isinstance(record, dict):
        return None

    try:
        timestamp = now_iso()
        return UserKnowledgeProfileRecord(
            id=str(record.get("id") or uuid.uuid4()),
            name=normalize_knowledge_profile_name(
                str(record.get("name") or DEFAULT_KNOWLEDGE_PROFILE_NAME)
            ),
            knowledgeProfile=UserKnowledgeProfile(
                **(record.get("knowledgeProfile") or {})
            ),
            createdAt=str(record.get("createdAt") or timestamp),
            updatedAt=str(record.get("updatedAt") or timestamp),
        )
    except Exception:
        return None


def ensure_user_knowledge_profiles(user: dict, persist: bool = True) -> dict:
    next_user = user.copy()
    raw_records = next_user.get("knowledgeProfiles")
    raw_record_list = raw_records if isinstance(raw_records, list) else []
    records = [
        record
        for record in (
            coerce_knowledge_profile_record(raw_record)
            for raw_record in raw_record_list
        )
        if record is not None
    ]

    if not records:
        records = [
            default_knowledge_profile_record(
                next_user.get("knowledgeProfile") or default_knowledge_profile()
            )
        ]

    selected_profile_id = next_user.get("selectedKnowledgeProfileId")
    selected_record = next(
        (record for record in records if record.id == selected_profile_id),
        records[0],
    )
    next_user["knowledgeProfiles"] = [record.model_dump() for record in records]
    next_user["selectedKnowledgeProfileId"] = selected_record.id
    next_user["knowledgeProfile"] = selected_record.knowledgeProfile.model_dump()

    if persist:
        next_user["updatedAt"] = now_iso()
        save_user_record(next_user)

    return next_user


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
    data = ensure_user_knowledge_profiles(data, persist=False)

    return UserProfile(**data)


def stored_user_from_dict(user: dict) -> StoredUserProfile:
    data = user.copy()
    data.setdefault("username", data["id"])
    data.setdefault("displayName", "NoviceReader User")
    data.setdefault("disabled", False)
    data = ensure_user_knowledge_profiles(data, persist=False)

    if not data.get("passwordHash"):
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
    normalized_user_id = normalize_username(user_id)
    user = get_user_record(normalized_user_id)

    if user is not None:
        return public_user(user)

    raise HTTPException(status_code=404, detail="User not found")


def get_user_profile(user_id: str) -> UserProfile:
    return ensure_user_profile(user_id)


def get_stored_user(user_id: str) -> StoredUserProfile:
    normalized_user_id = normalize_username(user_id)
    user = get_user_record(normalized_user_id)

    if user is not None:
        return stored_user_from_dict(user)

    raise HTTPException(status_code=404, detail="User not found")


def create_user_profile(
    user_id: str,
    display_name: str | None = None,
    knowledge_profile: UserKnowledgeProfile | None = None,
) -> UserProfile:
    normalized_user_id = normalize_username(user_id)

    if get_user_record(normalized_user_id) is not None:
        raise HTTPException(status_code=409, detail="User already exists")

    user = default_user_profile(normalized_user_id, display_name)

    if knowledge_profile is not None:
        user.knowledgeProfile = knowledge_profile
        user.updatedAt = now_iso()

    user_data = ensure_user_knowledge_profiles(user.model_dump(), persist=False)
    save_user_record(user_data)

    return public_user(user_data)


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

    existing_user = get_user_record(username)

    if existing_user is not None and existing_user.get("passwordHash"):
        raise HTTPException(status_code=409, detail="Username is already taken")

    timestamp = now_iso()

    if existing_user is None:
        user = StoredUserProfile(
            id=username,
            username=username,
            displayName=request.displayName or username,
            passwordHash=password_hash.hash(request.password),
            knowledgeProfile=request.knowledgeProfile or default_knowledge_profile(),
            createdAt=timestamp,
            updatedAt=timestamp,
        )
        stored_user_data = user.model_dump()
    else:
        existing_user["username"] = username
        existing_user["displayName"] = request.displayName or existing_user.get("displayName") or username
        existing_user["passwordHash"] = password_hash.hash(request.password)
        existing_user["disabled"] = False
        existing_user["updatedAt"] = timestamp

        if request.knowledgeProfile is not None:
            existing_user["knowledgeProfile"] = request.knowledgeProfile.model_dump()
        user = stored_user_from_dict(existing_user)
        stored_user_data = existing_user

    stored_user_data = ensure_user_knowledge_profiles(stored_user_data, persist=False)
    user = stored_user_from_dict(stored_user_data)
    save_user_record(stored_user_data)

    return AuthToken(
        accessToken=create_access_token(user.id),
        user=public_user(user),
    )


def authenticate_user(username: str, password: str) -> StoredUserProfile | None:
    normalized_username = normalize_username(username)
    user = get_user_record(normalized_username)
    stored_user: StoredUserProfile | None = (
        stored_user_from_dict(user) if user is not None else None
    )

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
    user = get_user_record(user_id)

    if user is None:
        raise HTTPException(status_code=404, detail="User not found")

    user = ensure_user_knowledge_profiles(user, persist=False)
    selected_profile_id = user.get("selectedKnowledgeProfileId")
    records = [
        UserKnowledgeProfileRecord(**record)
        for record in user.get("knowledgeProfiles", [])
    ]
    timestamp = now_iso()
    updated_records: list[UserKnowledgeProfileRecord] = []

    for record in records:
        if record.id == selected_profile_id:
            record.knowledgeProfile = knowledge_profile
            record.updatedAt = timestamp

        updated_records.append(record)

    user["knowledgeProfiles"] = [record.model_dump() for record in updated_records]
    user["updatedAt"] = now_iso()
    user["knowledgeProfile"] = knowledge_profile.model_dump()
    save_user_record(user)

    return public_user(user)


def list_user_knowledge_profile_summaries(
    user_id: str,
) -> list[UserKnowledgeProfileListItem]:
    user = get_user_record(user_id)

    if user is None:
        raise HTTPException(status_code=404, detail="User not found")

    user = ensure_user_knowledge_profiles(user)
    selected_profile_id = user.get("selectedKnowledgeProfileId")

    return [
        UserKnowledgeProfileListItem(
            id=record["id"],
            name=record["name"],
            isSelected=record["id"] == selected_profile_id,
            updatedAt=record["updatedAt"],
        )
        for record in sorted(
            user.get("knowledgeProfiles", []),
            key=lambda record: str(record.get("updatedAt") or ""),
            reverse=True,
        )
    ]


def get_user_knowledge_profile_record(
    user_id: str,
    profile_id: str,
) -> UserKnowledgeProfileRecord:
    user = get_user_record(user_id)

    if user is None:
        raise HTTPException(status_code=404, detail="User not found")

    user = ensure_user_knowledge_profiles(user)

    for record in user.get("knowledgeProfiles", []):
        if record.get("id") == profile_id:
            return UserKnowledgeProfileRecord(**record)

    raise HTTPException(status_code=404, detail="Knowledge profile not found")


def save_user_knowledge_profile_record(
    user_id: str,
    request: SaveKnowledgeProfileRequest,
) -> UserKnowledgeProfileRecord:
    user = get_user_record(user_id)

    if user is None:
        raise HTTPException(status_code=404, detail="User not found")

    user = ensure_user_knowledge_profiles(user, persist=False)
    timestamp = now_iso()
    profile_name = normalize_knowledge_profile_name(request.name)
    profile_id = request.id or str(uuid.uuid4())
    records = [
        UserKnowledgeProfileRecord(**record)
        for record in user.get("knowledgeProfiles", [])
    ]

    if any(
        record.id != profile_id and record.name.casefold() == profile_name.casefold()
        for record in records
    ):
        raise HTTPException(status_code=400, detail="Each profile needs a unique name")

    existing_record = next(
        (record for record in records if record.id == profile_id),
        None,
    )
    saved_record = UserKnowledgeProfileRecord(
        id=profile_id,
        name=profile_name,
        knowledgeProfile=request.knowledgeProfile,
        createdAt=existing_record.createdAt if existing_record else timestamp,
        updatedAt=timestamp,
    )
    next_records = [
        record for record in records if record.id != profile_id
    ] + [saved_record]

    user["knowledgeProfiles"] = [record.model_dump() for record in next_records]

    if request.makeActive:
        user["selectedKnowledgeProfileId"] = saved_record.id
        user["knowledgeProfile"] = saved_record.knowledgeProfile.model_dump()

    user["updatedAt"] = timestamp
    save_user_record(user)

    return saved_record


def select_user_knowledge_profile_record(
    user_id: str,
    profile_id: str,
) -> UserProfile:
    user = get_user_record(user_id)

    if user is None:
        raise HTTPException(status_code=404, detail="User not found")

    user = ensure_user_knowledge_profiles(user, persist=False)
    selected_record = None

    for record in user.get("knowledgeProfiles", []):
        if record.get("id") == profile_id:
            selected_record = UserKnowledgeProfileRecord(**record)
            break

    if selected_record is None:
        raise HTTPException(status_code=404, detail="Knowledge profile not found")

    user["selectedKnowledgeProfileId"] = selected_record.id
    user["knowledgeProfile"] = selected_record.knowledgeProfile.model_dump()
    user["updatedAt"] = now_iso()
    save_user_record(user)

    return public_user(user)


def delete_user_knowledge_profile_record(
    user_id: str,
    profile_id: str,
) -> UserKnowledgeProfileListItem:
    user = get_user_record(user_id)

    if user is None:
        raise HTTPException(status_code=404, detail="User not found")

    user = ensure_user_knowledge_profiles(user, persist=False)
    records = [
        UserKnowledgeProfileRecord(**record)
        for record in user.get("knowledgeProfiles", [])
    ]

    if not any(record.id == profile_id for record in records):
        raise HTTPException(status_code=404, detail="Knowledge profile not found")

    remaining_records = [record for record in records if record.id != profile_id]
    created_default = False

    if not remaining_records:
        remaining_records = [default_knowledge_profile_record()]
        created_default = True

    selected_profile_id = user.get("selectedKnowledgeProfileId")
    selected_record = next(
        (record for record in remaining_records if record.id == selected_profile_id),
        remaining_records[0],
    )
    user["knowledgeProfiles"] = [record.model_dump() for record in remaining_records]
    user["selectedKnowledgeProfileId"] = selected_record.id
    user["knowledgeProfile"] = selected_record.knowledgeProfile.model_dump()
    user["updatedAt"] = now_iso()
    save_user_record(user)

    return UserKnowledgeProfileListItem(
        id=selected_record.id,
        name=selected_record.name,
        isSelected=True,
        updatedAt=selected_record.updatedAt,
    )


def summarize_knowledge_profile(user: UserProfile) -> KnowledgeProfileSummary:
    profile = user.knowledgeProfile

    assumptions: list[str] = []
    known_information: list[str] = []
    knowledge_gaps: list[str] = []

    if profile.assumedFromEmptyOnboarding:
        assumptions.append(
            "The user has not filled out onboarding, so NoviceReader assumes a high-school baseline."
        )

    background_summary = profile.backgroundSummary.strip()

    if background_summary:
        known_information.append(background_summary)
    elif profile.assumedFromEmptyOnboarding:
        known_information.append(DEFAULT_KNOWLEDGE_DESCRIPTION)

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
