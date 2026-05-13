from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import quote
import secrets
import uuid

from fastapi import HTTPException, UploadFile

from app.config import settings
from app.models.guest import GuestSession, GuestSessionResponse
from app.models.paper import PaperWithUrls
from app.services.paper_service import (
    delete_user_paper,
    get_user_paper,
    list_user_papers,
    upload_paper_for_user,
)
from app.services.user_service import create_user_profile, ensure_user_profile
from app.storage.json_store import read_json, write_json
from app.storage.paths import (
    GUEST_SESSIONS_DB_PATH,
    get_guest_session_dir,
    get_user_paper_dir,
)


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def read_guest_sessions() -> list[GuestSession]:
    sessions = read_json(GUEST_SESSIONS_DB_PATH, [])

    if not isinstance(sessions, list):
        return []

    return [GuestSession(**session) for session in sessions]


def write_guest_sessions(sessions: list[GuestSession]) -> None:
    write_json(
        GUEST_SESSIONS_DB_PATH,
        [session.model_dump() for session in sessions],
    )


def derive_guest_user_id(session_id: str) -> str:
    return f"guest-{session_id.replace('-', '')[:24]}"


def get_session_user_id(session: GuestSession) -> str:
    return session.userId or derive_guest_user_id(session.id)


def ensure_guest_user(session: GuestSession) -> str:
    guest_user_id = get_session_user_id(session)

    try:
        ensure_user_profile(guest_user_id)
    except HTTPException as error:
        if error.status_code != 404:
            raise

        create_user_profile(guest_user_id, display_name="Guest")

    if session.userId != guest_user_id:
        session.userId = guest_user_id
        update_guest_session(session)

    return guest_user_id


def create_guest_session() -> GuestSessionResponse:
    timestamp = now_iso()
    session_id = str(uuid.uuid4())
    guest_user_id = derive_guest_user_id(session_id)
    session = GuestSession(
        id=session_id,
        token=secrets.token_urlsafe(32),
        userId=guest_user_id,
        createdAt=timestamp,
        updatedAt=timestamp,
    )
    create_user_profile(guest_user_id, display_name="Guest")
    sessions = read_guest_sessions()
    sessions.append(session)
    write_guest_sessions(sessions)
    get_guest_session_dir(session.id).mkdir(parents=True, exist_ok=True)

    return GuestSessionResponse(
        sessionId=session.id,
        sessionToken=session.token,
    )


def update_guest_session(updated_session: GuestSession) -> None:
    sessions = read_guest_sessions()

    for index, session in enumerate(sessions):
        if session.id == updated_session.id:
            updated_session.updatedAt = now_iso()
            sessions[index] = updated_session
            write_guest_sessions(sessions)
            return

    raise HTTPException(status_code=404, detail="Guest session not found")


def get_guest_session(session_id: str, session_token: str) -> GuestSession:
    for session in read_guest_sessions():
        if session.id != session_id:
            continue

        if not secrets.compare_digest(session.token, session_token):
            raise HTTPException(status_code=403, detail="Invalid guest session")

        update_guest_session(session)
        return session

    raise HTTPException(status_code=404, detail="Guest session not found")


def get_guest_user_id(session_id: str, session_token: str) -> str:
    return ensure_guest_user(get_guest_session(session_id, session_token))


def guest_paper_with_urls(
    paper: PaperWithUrls | dict,
    session_id: str,
    session_token: str,
) -> PaperWithUrls:
    paper_data = paper.model_dump() if isinstance(paper, PaperWithUrls) else paper
    public_backend_origin = settings.public_backend_origin.rstrip("/")
    file_url = (
        f"{public_backend_origin}/api/guest/papers/{paper_data['id']}/file"
        f"?session_id={quote(session_id)}"
        f"&session_token={quote(session_token)}"
    )

    return PaperWithUrls(
        **{
            **paper_data,
            "fileUrl": file_url,
        }
    )


async def upload_guest_paper(
    *,
    session_id: str,
    session_token: str,
    file: UploadFile,
) -> PaperWithUrls:
    session = get_guest_session(session_id, session_token)
    guest_user_id = ensure_guest_user(session)
    paper = await upload_paper_for_user(guest_user_id, file)

    if paper.id not in session.paperIds:
        session.paperIds.append(paper.id)

    update_guest_session(session)

    return guest_paper_with_urls(paper, session_id, session_token)


def list_guest_papers(
    *,
    session_id: str,
    session_token: str,
) -> list[PaperWithUrls]:
    session = get_guest_session(session_id, session_token)
    guest_user_id = ensure_guest_user(session)

    return [
        guest_paper_with_urls(paper, session_id, session_token)
        for paper in list_user_papers(guest_user_id)
    ]


def get_guest_paper(
    *,
    session_id: str,
    session_token: str,
    paper_id: str,
) -> PaperWithUrls:
    session = get_guest_session(session_id, session_token)
    guest_user_id = ensure_guest_user(session)
    paper = get_user_paper(guest_user_id, paper_id)

    return guest_paper_with_urls(paper, session_id, session_token)


def get_guest_paper_file_path(
    *,
    session_id: str,
    session_token: str,
    paper_id: str,
) -> tuple[dict, Path]:
    session = get_guest_session(session_id, session_token)
    guest_user_id = ensure_guest_user(session)
    paper = get_user_paper(guest_user_id, paper_id)
    paper_data = paper.model_dump()
    file_path = get_user_paper_dir(guest_user_id, paper_id) / paper.storedFilename

    if not file_path.exists():
        raise HTTPException(status_code=404, detail="Guest PDF file not found")

    return paper_data, file_path


def delete_guest_paper(
    *,
    session_id: str,
    session_token: str,
    paper_id: str,
) -> dict:
    session = get_guest_session(session_id, session_token)
    guest_user_id = ensure_guest_user(session)
    result = delete_user_paper(guest_user_id, paper_id)
    session.paperIds = [
        current_paper_id
        for current_paper_id in session.paperIds
        if current_paper_id != paper_id
    ]
    update_guest_session(session)

    return result


def end_guest_session(
    *,
    session_id: str,
    session_token: str,
) -> dict:
    session = get_guest_session(session_id, session_token)
    update_guest_session(session)

    return {
        "success": True,
        "endedSessionId": session_id,
    }
