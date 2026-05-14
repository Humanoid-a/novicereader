"""
Move existing JSON/local-file NoviceReader data into Postgres and configured PDF storage.

Run from the repo root after setting backend/.env with DATABASE_URL and, if desired,
PDF_STORAGE_BACKEND=s3 plus S3 credentials:

    cd backend
    python scripts/migrate_json_to_postgres_s3.py
"""

from pathlib import Path
import sys

from dotenv import load_dotenv


BACKEND_DIR = Path(__file__).resolve().parents[1]
sys.path.append(str(BACKEND_DIR))
load_dotenv(BACKEND_DIR / ".env")

from app.storage.data_store import (  # noqa: E402
    ensure_database_schema,
    is_database_enabled,
    save_paper_record,
    save_token_usage_record,
    save_user_record,
    write_annotation_records,
    write_document_context,
    write_guest_session_records,
    write_question_conversation_records,
)
from app.storage.json_store import read_json  # noqa: E402
from app.storage.paths import (  # noqa: E402
    GUEST_SESSIONS_DB_PATH,
    PAPERS_DB_PATH,
    STORAGE_DIR,
    USERS_DB_PATH,
    get_annotations_path,
    get_chat_thread_path,
    get_document_context_path,
    get_user_paper_dir,
    get_user_token_usage_path,
)
from app.storage.pdf_storage import save_pdf_from_path  # noqa: E402


def migrate_users() -> int:
    users = read_json(USERS_DB_PATH, [])

    for user in users:
        save_user_record(user)

    return len(users)


def migrate_papers() -> int:
    papers = read_json(PAPERS_DB_PATH, [])

    for paper in papers:
        paper_dir = get_user_paper_dir(paper["userId"], paper["id"])
        source_path = paper_dir / paper["storedFilename"]

        if source_path.exists():
            paper["storageKey"] = save_pdf_from_path(
                user_id=paper["userId"],
                paper_id=paper["id"],
                stored_filename=paper["storedFilename"],
                content_type=paper["contentType"],
                source_path=source_path,
            )

        save_paper_record(paper)
        write_annotation_records(
            paper["userId"],
            paper["id"],
            read_json(get_annotations_path(paper["userId"], paper["id"]), []),
        )
        write_question_conversation_records(
            paper["userId"],
            paper["id"],
            _read_conversations(paper["userId"], paper["id"]),
        )
        write_document_context(
            paper["userId"],
            paper["id"],
            read_json(
                get_document_context_path(paper["userId"], paper["id"]),
                {
                    "paperId": paper["id"],
                    "userId": paper["userId"],
                    "strategy": "selected_plus_metadata",
                    "tokenBudgetHint": 4000,
                    "blocks": [],
                },
            ),
        )

    return len(papers)


def _read_conversations(user_id: str, paper_id: str) -> list[dict]:
    stored_chat = read_json(get_chat_thread_path(user_id, paper_id), None)

    if isinstance(stored_chat, dict) and "conversations" in stored_chat:
        return stored_chat.get("conversations", [])

    if isinstance(stored_chat, dict) and "turns" in stored_chat:
        return [stored_chat]

    return []


def migrate_guest_sessions() -> int:
    sessions = read_json(GUEST_SESSIONS_DB_PATH, [])
    write_guest_session_records(sessions)

    return len(sessions)


def migrate_token_usage() -> int:
    count = 0
    users_dir = STORAGE_DIR / "users"

    if not users_dir.exists():
        return count

    for user_dir in users_dir.iterdir():
        if not user_dir.is_dir():
            continue

        for record in read_json(get_user_token_usage_path(user_dir.name), []):
            save_token_usage_record(record)
            count += 1

    return count


def main() -> None:
    if not is_database_enabled():
        raise SystemExit("DATABASE_URL must be configured before running migration.")

    ensure_database_schema()
    user_count = migrate_users()
    paper_count = migrate_papers()
    guest_session_count = migrate_guest_sessions()
    token_usage_count = migrate_token_usage()

    print(
        "Migration complete: "
        f"{user_count} users, "
        f"{paper_count} papers, "
        f"{guest_session_count} guest sessions, "
        f"{token_usage_count} token usage records."
    )


if __name__ == "__main__":
    main()
