from fastapi import BackgroundTasks, UploadFile, HTTPException
from datetime import datetime, timezone
from pathlib import Path
import tempfile
import uuid

from app.config import settings
from app.models.paper import PaperWithUrls
from app.storage.data_store import (
    delete_paper_record,
    get_paper_record,
    get_user_paper_size_bytes,
    list_paper_records,
    save_paper_record,
    write_annotation_records,
    write_document_context,
    write_question_conversation_records,
)
from app.storage.pdf_storage import delete_pdf_for_paper, save_pdf_from_path
from app.services.user_service import ensure_user_profile

USER_STORAGE_LIMIT_BYTES = 200 * 1024 * 1024


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def paper_with_urls(paper: dict) -> dict:
    public_backend_origin = settings.public_backend_origin.rstrip("/")

    return {
        **paper,
        "fileUrl": (
            f"{public_backend_origin}/api/papers/{paper['id']}/file"
        ),
    }


def find_paper_or_404(user_id: str, paper_id: str) -> dict:
    paper = get_paper_record(user_id, paper_id)

    if paper is not None:
        return paper

    raise HTTPException(status_code=404, detail="Paper not found")


def get_user_stored_size_bytes(user_id: str) -> int:
    return get_user_paper_size_bytes(user_id)


def raise_user_storage_limit_error() -> None:
    raise HTTPException(
        status_code=413,
        detail=(
            "This user has reached the 200 MB storage limit. "
            "Space needs to be cleared before uploading another document."
        ),
    )


def generate_paper_analysis_profile_for_upload(user_id: str, paper_id: str) -> None:
    paper = get_paper_record(user_id, paper_id)

    if paper is None:
        return

    try:
        from app.services.paper_analysis_service import (
            create_paper_analysis_profile_for_paper,
        )

        profile = create_paper_analysis_profile_for_paper(
            user_id=user_id,
            paper=paper,
        )
        paper["analysisProfileId"] = profile.id
        paper["updatedAt"] = now_iso()
        save_paper_record(paper)
    except Exception:
        # Upload already succeeded; paper analysis can be retried later.
        return


async def upload_paper_for_user(
    user_id: str,
    file: UploadFile,
    background_tasks: BackgroundTasks | None = None,
) -> PaperWithUrls:
    if file.content_type != "application/pdf":
        raise HTTPException(status_code=400, detail="Only PDF files are allowed")

    ensure_user_profile(user_id)
    current_stored_size_bytes = get_user_stored_size_bytes(user_id)

    if current_stored_size_bytes >= USER_STORAGE_LIMIT_BYTES:
        raise_user_storage_limit_error()

    paper_id = str(uuid.uuid4())
    stored_filename = "original.pdf"

    size_bytes = 0
    temp_path: Path | None = None

    try:
        with tempfile.NamedTemporaryFile(delete=False) as buffer:
            temp_path = Path(buffer.name)

            while True:
                chunk = await file.read(1024 * 1024)

                if not chunk:
                    break

                size_bytes += len(chunk)
                if current_stored_size_bytes + size_bytes > USER_STORAGE_LIMIT_BYTES:
                    raise_user_storage_limit_error()

                buffer.write(chunk)

        timestamp = now_iso()
        storage_key = save_pdf_from_path(
            user_id=user_id,
            paper_id=paper_id,
            stored_filename=stored_filename,
            content_type=file.content_type,
            source_path=temp_path,
        )
    finally:
        if temp_path is not None:
            temp_path.unlink(missing_ok=True)

    paper = {
        "id": paper_id,
        "userId": user_id,
        "originalFilename": file.filename or "uploaded.pdf",
        "storedFilename": stored_filename,
        "storageKey": storage_key,
        "analysisProfileId": None,
        "contentType": file.content_type,
        "sizeBytes": size_bytes,
        "createdAt": timestamp,
        "updatedAt": timestamp,
    }

    save_paper_record(paper)

    write_annotation_records(user_id, paper_id, [])
    write_question_conversation_records(user_id, paper_id, [])
    write_document_context(
        user_id,
        paper_id,
        {
            "paperId": paper_id,
            "userId": user_id,
            "strategy": "selected_plus_metadata",
            "tokenBudgetHint": 4000,
            "blocks": [
                {
                    "id": "paper_metadata",
                    "type": "paper_metadata",
                    "title": "Paper metadata",
                    "content": f"Original filename: {paper['originalFilename']}",
                }
            ],
        },
    )

    if background_tasks is not None:
        background_tasks.add_task(
            generate_paper_analysis_profile_for_upload,
            user_id,
            paper_id,
        )

    return PaperWithUrls(**paper_with_urls(paper))


def list_user_papers(user_id: str) -> list[PaperWithUrls]:
    return [
        PaperWithUrls(**paper_with_urls(paper))
        for paper in list_paper_records(user_id)
    ]


def get_user_paper(user_id: str, paper_id: str) -> PaperWithUrls:
    paper = find_paper_or_404(user_id, paper_id)
    return PaperWithUrls(**paper_with_urls(paper))


def delete_user_paper(user_id: str, paper_id: str) -> dict:
    paper = find_paper_or_404(user_id, paper_id)
    delete_pdf_for_paper(paper)
    delete_paper_record(user_id, paper_id)

    return {
        "success": True,
        "deletedPaperId": paper_id,
    }
