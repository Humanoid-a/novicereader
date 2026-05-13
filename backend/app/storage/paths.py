from pathlib import Path
import re

BASE_DIR = Path(__file__).resolve().parents[2]
STORAGE_DIR = BASE_DIR / "storage"
DB_DIR = BASE_DIR / "db"

PAPERS_DB_PATH = DB_DIR / "papers.json"
USERS_DB_PATH = DB_DIR / "users.json"
GUEST_SESSIONS_DB_PATH = DB_DIR / "guest_sessions.json"
SAFE_STORAGE_COMPONENT_PATTERN = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$")


def validate_storage_component(value: str, name: str) -> str:
    if not SAFE_STORAGE_COMPONENT_PATTERN.fullmatch(value):
        raise ValueError(f"Invalid {name} storage identifier")

    return value


def ensure_base_dirs() -> None:
    STORAGE_DIR.mkdir(exist_ok=True)
    DB_DIR.mkdir(exist_ok=True)

    if not PAPERS_DB_PATH.exists():
        PAPERS_DB_PATH.write_text("[]", encoding="utf-8")

    if not USERS_DB_PATH.exists():
        USERS_DB_PATH.write_text("[]", encoding="utf-8")

    if not GUEST_SESSIONS_DB_PATH.exists():
        GUEST_SESSIONS_DB_PATH.write_text("[]", encoding="utf-8")


def get_user_paper_dir(user_id: str, paper_id: str) -> Path:
    validate_storage_component(user_id, "user")
    validate_storage_component(paper_id, "paper")

    return STORAGE_DIR / "users" / user_id / "papers" / paper_id


def get_user_dir(user_id: str) -> Path:
    validate_storage_component(user_id, "user")

    return STORAGE_DIR / "users" / user_id


def get_user_token_usage_path(user_id: str) -> Path:
    return get_user_dir(user_id) / "token_usage.json"


def get_guest_session_dir(session_id: str) -> Path:
    validate_storage_component(session_id, "guest session")

    return STORAGE_DIR / "guests" / session_id


def get_annotations_path(user_id: str, paper_id: str) -> Path:
    return get_user_paper_dir(user_id, paper_id) / "annotations.json"


def get_chat_thread_path(user_id: str, paper_id: str) -> Path:
    return get_user_paper_dir(user_id, paper_id) / "chat.json"


def get_document_context_path(user_id: str, paper_id: str) -> Path:
    return get_user_paper_dir(user_id, paper_id) / "context.json"
