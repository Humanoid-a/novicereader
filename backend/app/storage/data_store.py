from __future__ import annotations

import json
from functools import lru_cache
from typing import Any

from app.config import settings
from app.storage.json_store import read_json, write_json
from app.storage.paths import (
    GUEST_SESSIONS_DB_PATH,
    PAPERS_DB_PATH,
    USERS_DB_PATH,
    get_annotations_path,
    get_chat_thread_path,
    get_document_context_path,
    get_user_token_usage_path,
)


def is_database_enabled() -> bool:
    return bool(settings.database_url)


@lru_cache(maxsize=1)
def get_engine():
    if not settings.database_url:
        raise RuntimeError("DATABASE_URL is not configured")

    from sqlalchemy import create_engine

    return create_engine(settings.database_url, pool_pre_ping=True)


def text(statement: str):
    from sqlalchemy import text as sqlalchemy_text

    return sqlalchemy_text(statement)


def _as_json(value: Any) -> str:
    return json.dumps(value)


def _coerce_json(value: Any, default: Any) -> Any:
    if value is None:
        return default

    if isinstance(value, str):
        return json.loads(value)

    return value


def _row_to_dict(row: Any) -> dict:
    return dict(row._mapping)


def ensure_database_schema() -> None:
    if not is_database_enabled():
        return

    ddl_statements = [
        """
        CREATE TABLE IF NOT EXISTS users (
            id TEXT PRIMARY KEY,
            username TEXT UNIQUE NOT NULL,
            display_name TEXT NOT NULL,
            password_hash TEXT,
            disabled BOOLEAN NOT NULL DEFAULT FALSE,
            knowledge_profile JSONB NOT NULL DEFAULT '{}'::jsonb,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        )
        """,
        """
        CREATE TABLE IF NOT EXISTS papers (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            original_filename TEXT NOT NULL,
            stored_filename TEXT NOT NULL,
            storage_key TEXT,
            content_type TEXT NOT NULL,
            size_bytes BIGINT NOT NULL,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        )
        """,
        """
        CREATE INDEX IF NOT EXISTS papers_user_id_idx
        ON papers(user_id)
        """,
        """
        CREATE TABLE IF NOT EXISTS document_contexts (
            user_id TEXT NOT NULL,
            paper_id TEXT NOT NULL,
            data JSONB NOT NULL,
            updated_at TEXT NOT NULL,
            PRIMARY KEY (user_id, paper_id)
        )
        """,
        """
        CREATE TABLE IF NOT EXISTS annotations (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL,
            paper_id TEXT NOT NULL,
            target_id TEXT NOT NULL,
            is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
            data JSONB NOT NULL,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        )
        """,
        """
        CREATE INDEX IF NOT EXISTS annotations_user_paper_idx
        ON annotations(user_id, paper_id)
        """,
        """
        CREATE INDEX IF NOT EXISTS annotations_target_idx
        ON annotations(user_id, paper_id, target_id)
        """,
        """
        CREATE TABLE IF NOT EXISTS question_conversations (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL,
            paper_id TEXT NOT NULL,
            data JSONB NOT NULL,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        )
        """,
        """
        CREATE INDEX IF NOT EXISTS question_conversations_user_paper_idx
        ON question_conversations(user_id, paper_id)
        """,
        """
        CREATE TABLE IF NOT EXISTS guest_sessions (
            id TEXT PRIMARY KEY,
            token TEXT NOT NULL,
            user_id TEXT NOT NULL,
            paper_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        )
        """,
        """
        CREATE TABLE IF NOT EXISTS token_usage (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL,
            paper_id TEXT,
            feature TEXT NOT NULL,
            model TEXT NOT NULL,
            input_tokens BIGINT NOT NULL DEFAULT 0,
            output_tokens BIGINT NOT NULL DEFAULT 0,
            total_tokens BIGINT NOT NULL DEFAULT 0,
            raw_usage JSONB NOT NULL DEFAULT '{}'::jsonb,
            created_at TEXT NOT NULL
        )
        """,
        """
        CREATE INDEX IF NOT EXISTS token_usage_user_id_idx
        ON token_usage(user_id)
        """,
    ]

    with get_engine().begin() as connection:
        for statement in ddl_statements:
            connection.execute(text(statement))


def get_user_record(user_id: str) -> dict | None:
    if not is_database_enabled():
        for user in read_json(USERS_DB_PATH, []):
            if user.get("id") == user_id:
                return user

        return None

    with get_engine().connect() as connection:
        row = connection.execute(
            text(
                """
                SELECT id, username, display_name, password_hash, disabled,
                       knowledge_profile, created_at, updated_at
                FROM users
                WHERE id = :id
                """
            ),
            {"id": user_id},
        ).first()

    if row is None:
        return None

    data = _row_to_dict(row)
    return {
        "id": data["id"],
        "username": data["username"],
        "displayName": data["display_name"],
        "passwordHash": data["password_hash"],
        "disabled": data["disabled"],
        "knowledgeProfile": _coerce_json(data["knowledge_profile"], {}),
        "createdAt": data["created_at"],
        "updatedAt": data["updated_at"],
    }


def save_user_record(user: dict) -> None:
    if not is_database_enabled():
        users = read_json(USERS_DB_PATH, [])
        users = [stored for stored in users if stored.get("id") != user.get("id")]
        users.append(user)
        write_json(USERS_DB_PATH, users)
        return

    with get_engine().begin() as connection:
        connection.execute(
            text(
                """
                INSERT INTO users (
                    id, username, display_name, password_hash, disabled,
                    knowledge_profile, created_at, updated_at
                )
                VALUES (
                    :id, :username, :display_name, :password_hash, :disabled,
                    CAST(:knowledge_profile AS jsonb), :created_at, :updated_at
                )
                ON CONFLICT (id) DO UPDATE SET
                    username = EXCLUDED.username,
                    display_name = EXCLUDED.display_name,
                    password_hash = EXCLUDED.password_hash,
                    disabled = EXCLUDED.disabled,
                    knowledge_profile = EXCLUDED.knowledge_profile,
                    updated_at = EXCLUDED.updated_at
                """
            ),
            {
                "id": user["id"],
                "username": user.get("username", user["id"]),
                "display_name": user.get("displayName", "NoviceReader User"),
                "password_hash": user.get("passwordHash"),
                "disabled": bool(user.get("disabled", False)),
                "knowledge_profile": _as_json(user.get("knowledgeProfile", {})),
                "created_at": user["createdAt"],
                "updated_at": user["updatedAt"],
            },
        )


def get_paper_record(user_id: str, paper_id: str) -> dict | None:
    if not is_database_enabled():
        for paper in read_json(PAPERS_DB_PATH, []):
            if paper.get("id") == paper_id and paper.get("userId") == user_id:
                return paper

        return None

    with get_engine().connect() as connection:
        row = connection.execute(
            text(
                """
                SELECT id, user_id, original_filename, stored_filename,
                       storage_key, content_type, size_bytes, created_at, updated_at
                FROM papers
                WHERE id = :id AND user_id = :user_id
                """
            ),
            {"id": paper_id, "user_id": user_id},
        ).first()

    if row is None:
        return None

    data = _row_to_dict(row)
    return {
        "id": data["id"],
        "userId": data["user_id"],
        "originalFilename": data["original_filename"],
        "storedFilename": data["stored_filename"],
        "storageKey": data["storage_key"],
        "contentType": data["content_type"],
        "sizeBytes": int(data["size_bytes"]),
        "createdAt": data["created_at"],
        "updatedAt": data["updated_at"],
    }


def list_paper_records(user_id: str) -> list[dict]:
    if not is_database_enabled():
        return [
            paper
            for paper in read_json(PAPERS_DB_PATH, [])
            if paper.get("userId") == user_id
        ]

    with get_engine().connect() as connection:
        rows = connection.execute(
            text(
                """
                SELECT id, user_id, original_filename, stored_filename,
                       storage_key, content_type, size_bytes, created_at, updated_at
                FROM papers
                WHERE user_id = :user_id
                ORDER BY created_at DESC
                """
            ),
            {"user_id": user_id},
        ).all()

    return [
        {
            "id": row.id,
            "userId": row.user_id,
            "originalFilename": row.original_filename,
            "storedFilename": row.stored_filename,
            "storageKey": row.storage_key,
            "contentType": row.content_type,
            "sizeBytes": int(row.size_bytes),
            "createdAt": row.created_at,
            "updatedAt": row.updated_at,
        }
        for row in rows
    ]


def get_user_paper_size_bytes(user_id: str) -> int:
    if not is_database_enabled():
        return sum(
            int(paper.get("sizeBytes", 0))
            for paper in read_json(PAPERS_DB_PATH, [])
            if paper.get("userId") == user_id
        )

    with get_engine().connect() as connection:
        result = connection.execute(
            text("SELECT COALESCE(SUM(size_bytes), 0) FROM papers WHERE user_id = :user_id"),
            {"user_id": user_id},
        ).scalar_one()

    return int(result)


def save_paper_record(paper: dict) -> None:
    if not is_database_enabled():
        papers = read_json(PAPERS_DB_PATH, [])
        papers = [
            stored
            for stored in papers
            if not (
                stored.get("id") == paper.get("id")
                and stored.get("userId") == paper.get("userId")
            )
        ]
        papers.append(paper)
        write_json(PAPERS_DB_PATH, papers)
        return

    with get_engine().begin() as connection:
        connection.execute(
            text(
                """
                INSERT INTO papers (
                    id, user_id, original_filename, stored_filename, storage_key,
                    content_type, size_bytes, created_at, updated_at
                )
                VALUES (
                    :id, :user_id, :original_filename, :stored_filename, :storage_key,
                    :content_type, :size_bytes, :created_at, :updated_at
                )
                ON CONFLICT (id) DO UPDATE SET
                    original_filename = EXCLUDED.original_filename,
                    stored_filename = EXCLUDED.stored_filename,
                    storage_key = EXCLUDED.storage_key,
                    content_type = EXCLUDED.content_type,
                    size_bytes = EXCLUDED.size_bytes,
                    updated_at = EXCLUDED.updated_at
                """
            ),
            {
                "id": paper["id"],
                "user_id": paper["userId"],
                "original_filename": paper["originalFilename"],
                "stored_filename": paper["storedFilename"],
                "storage_key": paper.get("storageKey"),
                "content_type": paper["contentType"],
                "size_bytes": int(paper["sizeBytes"]),
                "created_at": paper["createdAt"],
                "updated_at": paper["updatedAt"],
            },
        )


def delete_paper_record(user_id: str, paper_id: str) -> None:
    if not is_database_enabled():
        papers = [
            paper
            for paper in read_json(PAPERS_DB_PATH, [])
            if not (paper.get("id") == paper_id and paper.get("userId") == user_id)
        ]
        write_json(PAPERS_DB_PATH, papers)
        return

    with get_engine().begin() as connection:
        params = {"paper_id": paper_id, "user_id": user_id}
        connection.execute(
            text(
                """
                DELETE FROM annotations
                WHERE paper_id = :paper_id AND user_id = :user_id
                """
            ),
            params,
        )
        connection.execute(
            text(
                """
                DELETE FROM question_conversations
                WHERE paper_id = :paper_id AND user_id = :user_id
                """
            ),
            params,
        )
        connection.execute(
            text(
                """
                DELETE FROM document_contexts
                WHERE paper_id = :paper_id AND user_id = :user_id
                """
            ),
            params,
        )
        connection.execute(
            text("DELETE FROM papers WHERE id = :paper_id AND user_id = :user_id"),
            params,
        )


def read_document_context(user_id: str, paper_id: str, default: Any) -> Any:
    if not is_database_enabled():
        return read_json(get_document_context_path(user_id, paper_id), default)

    with get_engine().connect() as connection:
        row = connection.execute(
            text(
                """
                SELECT data
                FROM document_contexts
                WHERE user_id = :user_id AND paper_id = :paper_id
                """
            ),
            {"user_id": user_id, "paper_id": paper_id},
        ).first()

    if row is None:
        return default

    return _coerce_json(row.data, default)


def write_document_context(user_id: str, paper_id: str, context: dict) -> None:
    if not is_database_enabled():
        write_json(get_document_context_path(user_id, paper_id), context)
        return

    with get_engine().begin() as connection:
        connection.execute(
            text(
                """
                INSERT INTO document_contexts (user_id, paper_id, data, updated_at)
                VALUES (:user_id, :paper_id, CAST(:data AS jsonb), :updated_at)
                ON CONFLICT (user_id, paper_id) DO UPDATE SET
                    data = EXCLUDED.data,
                    updated_at = EXCLUDED.updated_at
                """
            ),
            {
                "user_id": user_id,
                "paper_id": paper_id,
                "data": _as_json(context),
                "updated_at": context.get("updatedAt") or context.get("createdAt") or "",
            },
        )


def read_annotation_records(user_id: str, paper_id: str) -> list[dict]:
    if not is_database_enabled():
        return read_json(get_annotations_path(user_id, paper_id), [])

    with get_engine().connect() as connection:
        rows = connection.execute(
            text(
                """
                SELECT data
                FROM annotations
                WHERE user_id = :user_id AND paper_id = :paper_id
                ORDER BY created_at ASC
                """
            ),
            {"user_id": user_id, "paper_id": paper_id},
        ).all()

    return [_coerce_json(row.data, {}) for row in rows]


def write_annotation_records(user_id: str, paper_id: str, annotations: list[dict]) -> None:
    if not is_database_enabled():
        write_json(get_annotations_path(user_id, paper_id), annotations)
        return

    with get_engine().begin() as connection:
        connection.execute(
            text("DELETE FROM annotations WHERE user_id = :user_id AND paper_id = :paper_id"),
            {"user_id": user_id, "paper_id": paper_id},
        )

        for annotation in annotations:
            save_annotation_record(
                user_id=user_id,
                paper_id=paper_id,
                annotation=annotation,
                connection=connection,
            )


def save_annotation_record(
    *,
    user_id: str,
    paper_id: str,
    annotation: dict,
    connection: Any | None = None,
) -> None:
    if not is_database_enabled():
        annotations = read_json(get_annotations_path(user_id, paper_id), [])
        annotations = [
            stored
            for stored in annotations
            if stored.get("id") != annotation.get("id")
        ]
        annotations.append(annotation)
        write_json(get_annotations_path(user_id, paper_id), annotations)
        return

    params = {
        "id": annotation["id"],
        "user_id": user_id,
        "paper_id": paper_id,
        "target_id": annotation.get("target", {}).get("id", ""),
        "is_deleted": bool(annotation.get("isDeleted", False)),
        "data": _as_json(annotation),
        "created_at": annotation["createdAt"],
        "updated_at": annotation.get("deletedAt") or annotation["createdAt"],
    }
    statement = text(
        """
        INSERT INTO annotations (
            id, user_id, paper_id, target_id, is_deleted, data, created_at, updated_at
        )
        VALUES (
            :id, :user_id, :paper_id, :target_id, :is_deleted,
            CAST(:data AS jsonb), :created_at, :updated_at
        )
        ON CONFLICT (id) DO UPDATE SET
            target_id = EXCLUDED.target_id,
            is_deleted = EXCLUDED.is_deleted,
            data = EXCLUDED.data,
            updated_at = EXCLUDED.updated_at
        """
    )

    if connection is not None:
        connection.execute(statement, params)
        return

    with get_engine().begin() as active_connection:
        active_connection.execute(statement, params)


def read_question_conversation_records(user_id: str, paper_id: str) -> list[dict]:
    if not is_database_enabled():
        stored_chat = read_json(get_chat_thread_path(user_id, paper_id), None)

        if isinstance(stored_chat, dict) and "conversations" in stored_chat:
            return stored_chat.get("conversations", [])

        if isinstance(stored_chat, dict) and "turns" in stored_chat:
            return [stored_chat]

        return []

    with get_engine().connect() as connection:
        rows = connection.execute(
            text(
                """
                SELECT data
                FROM question_conversations
                WHERE user_id = :user_id AND paper_id = :paper_id
                ORDER BY created_at ASC
                """
            ),
            {"user_id": user_id, "paper_id": paper_id},
        ).all()

    return [_coerce_json(row.data, {}) for row in rows]


def write_question_conversation_records(
    user_id: str,
    paper_id: str,
    conversations: list[dict],
) -> None:
    if not is_database_enabled():
        write_json(
            get_chat_thread_path(user_id, paper_id),
            {"conversations": conversations},
        )
        return

    with get_engine().begin() as connection:
        connection.execute(
            text(
                """
                DELETE FROM question_conversations
                WHERE user_id = :user_id AND paper_id = :paper_id
                """
            ),
            {"user_id": user_id, "paper_id": paper_id},
        )

        for conversation in conversations:
            connection.execute(
                text(
                    """
                    INSERT INTO question_conversations (
                        id, user_id, paper_id, data, created_at, updated_at
                    )
                    VALUES (
                        :id, :user_id, :paper_id, CAST(:data AS jsonb),
                        :created_at, :updated_at
                    )
                    """
                ),
                {
                    "id": conversation["id"],
                    "user_id": user_id,
                    "paper_id": paper_id,
                    "data": _as_json(conversation),
                    "created_at": conversation["createdAt"],
                    "updated_at": conversation["updatedAt"],
                },
            )


def read_guest_session_records() -> list[dict]:
    if not is_database_enabled():
        return read_json(GUEST_SESSIONS_DB_PATH, [])

    with get_engine().connect() as connection:
        rows = connection.execute(
            text(
                """
                SELECT id, token, user_id, paper_ids, created_at, updated_at
                FROM guest_sessions
                ORDER BY created_at ASC
                """
            )
        ).all()

    return [
        {
            "id": row.id,
            "token": row.token,
            "userId": row.user_id,
            "paperIds": _coerce_json(row.paper_ids, []),
            "createdAt": row.created_at,
            "updatedAt": row.updated_at,
        }
        for row in rows
    ]


def write_guest_session_records(sessions: list[dict]) -> None:
    if not is_database_enabled():
        write_json(GUEST_SESSIONS_DB_PATH, sessions)
        return

    with get_engine().begin() as connection:
        connection.execute(text("DELETE FROM guest_sessions"))

        for session in sessions:
            connection.execute(
                text(
                    """
                    INSERT INTO guest_sessions (
                        id, token, user_id, paper_ids, created_at, updated_at
                    )
                    VALUES (
                        :id, :token, :user_id, CAST(:paper_ids AS jsonb),
                        :created_at, :updated_at
                    )
                    """
                ),
                {
                    "id": session["id"],
                    "token": session["token"],
                    "user_id": session["userId"],
                    "paper_ids": _as_json(session.get("paperIds", [])),
                    "created_at": session["createdAt"],
                    "updated_at": session["updatedAt"],
                },
            )


def read_token_usage_records(user_id: str) -> list[dict]:
    if not is_database_enabled():
        return read_json(get_user_token_usage_path(user_id), [])

    with get_engine().connect() as connection:
        rows = connection.execute(
            text(
                """
                SELECT id, user_id, paper_id, feature, model, input_tokens,
                       output_tokens, total_tokens, raw_usage, created_at
                FROM token_usage
                WHERE user_id = :user_id
                ORDER BY created_at ASC
                """
            ),
            {"user_id": user_id},
        ).all()

    return [
        {
            "id": row.id,
            "userId": row.user_id,
            "paperId": row.paper_id,
            "feature": row.feature,
            "model": row.model,
            "inputTokens": int(row.input_tokens),
            "outputTokens": int(row.output_tokens),
            "totalTokens": int(row.total_tokens),
            "rawUsage": _coerce_json(row.raw_usage, {}),
            "createdAt": row.created_at,
        }
        for row in rows
    ]


def save_token_usage_record(record: dict) -> None:
    if not is_database_enabled():
        records = read_json(get_user_token_usage_path(record["userId"]), [])
        records.append(record)
        write_json(get_user_token_usage_path(record["userId"]), records)
        return

    with get_engine().begin() as connection:
        connection.execute(
            text(
                """
                INSERT INTO token_usage (
                    id, user_id, paper_id, feature, model, input_tokens,
                    output_tokens, total_tokens, raw_usage, created_at
                )
                VALUES (
                    :id, :user_id, :paper_id, :feature, :model, :input_tokens,
                    :output_tokens, :total_tokens, CAST(:raw_usage AS jsonb),
                    :created_at
                )
                ON CONFLICT (id) DO UPDATE SET
                    paper_id = EXCLUDED.paper_id,
                    feature = EXCLUDED.feature,
                    model = EXCLUDED.model,
                    input_tokens = EXCLUDED.input_tokens,
                    output_tokens = EXCLUDED.output_tokens,
                    total_tokens = EXCLUDED.total_tokens,
                    raw_usage = EXCLUDED.raw_usage,
                    created_at = EXCLUDED.created_at
                """
            ),
            {
                "id": record["id"],
                "user_id": record["userId"],
                "paper_id": record.get("paperId"),
                "feature": record["feature"],
                "model": record["model"],
                "input_tokens": int(record.get("inputTokens", 0)),
                "output_tokens": int(record.get("outputTokens", 0)),
                "total_tokens": int(record.get("totalTokens", 0)),
                "raw_usage": _as_json(record.get("rawUsage", {})),
                "created_at": record["createdAt"],
            },
        )
