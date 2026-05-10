from pathlib import Path

BASE_DIR = Path(__file__).resolve().parents[2]
STORAGE_DIR = BASE_DIR / "storage"
DB_DIR = BASE_DIR / "db"

PAPERS_DB_PATH = DB_DIR / "papers.json"
USERS_DB_PATH = DB_DIR / "users.json"


def ensure_base_dirs() -> None:
    STORAGE_DIR.mkdir(exist_ok=True)
    DB_DIR.mkdir(exist_ok=True)

    if not PAPERS_DB_PATH.exists():
        PAPERS_DB_PATH.write_text("[]", encoding="utf-8")

    if not USERS_DB_PATH.exists():
        USERS_DB_PATH.write_text("[]", encoding="utf-8")


def get_user_paper_dir(user_id: str, paper_id: str) -> Path:
    return STORAGE_DIR / "users" / user_id / "papers" / paper_id


def get_annotations_path(user_id: str, paper_id: str) -> Path:
    return get_user_paper_dir(user_id, paper_id) / "annotations.json"


def get_chat_thread_path(user_id: str, paper_id: str) -> Path:
    return get_user_paper_dir(user_id, paper_id) / "chat.json"


def get_document_context_path(user_id: str, paper_id: str) -> Path:
    return get_user_paper_dir(user_id, paper_id) / "context.json"