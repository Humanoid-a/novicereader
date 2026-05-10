from fastapi import UploadFile, HTTPException
from datetime import datetime, timezone
import uuid

from app.models.paper import PaperWithUrls
from app.storage.paths import (
    PAPERS_DB_PATH,
    get_user_paper_dir,
    get_annotations_path,
    get_chat_thread_path,
    get_document_context_path,
)
from app.storage.json_store import read_json, write_json
from app.services.user_service import ensure_user_profile


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def paper_with_urls(paper: dict) -> dict:
    return {
        **paper,
        "fileUrl": (
            f"http://localhost:8000/api/papers/{paper['id']}/file"
            f"?user_id={paper['userId']}"
        ),
    }


def read_papers() -> list[dict]:
    return read_json(PAPERS_DB_PATH, [])


def write_papers(papers: list[dict]) -> None:
    write_json(PAPERS_DB_PATH, papers)


def find_paper_or_404(user_id: str, paper_id: str) -> dict:
    papers = read_papers()

    for paper in papers:
        if paper["id"] == paper_id and paper["userId"] == user_id:
            return paper

    raise HTTPException(status_code=404, detail="Paper not found")


async def upload_paper_for_user(user_id: str, file: UploadFile) -> PaperWithUrls:
    if file.content_type != "application/pdf":
        raise HTTPException(status_code=400, detail="Only PDF files are allowed")

    ensure_user_profile(user_id)

    paper_id = str(uuid.uuid4())
    stored_filename = "original.pdf"

    paper_dir = get_user_paper_dir(user_id, paper_id)
    paper_dir.mkdir(parents=True, exist_ok=True)

    stored_file_path = paper_dir / stored_filename

    size_bytes = 0

    with stored_file_path.open("wb") as buffer:
        while True:
            chunk = await file.read(1024 * 1024)

            if not chunk:
                break

            size_bytes += len(chunk)
            buffer.write(chunk)

    timestamp = now_iso()

    paper = {
        "id": paper_id,
        "userId": user_id,
        "originalFilename": file.filename or "uploaded.pdf",
        "storedFilename": stored_filename,
        "contentType": file.content_type,
        "sizeBytes": size_bytes,
        "createdAt": timestamp,
        "updatedAt": timestamp,
    }

    papers = read_papers()
    papers.append(paper)
    write_papers(papers)

    write_json(get_annotations_path(user_id, paper_id), [])
    write_json(get_chat_thread_path(user_id, paper_id), [])
    write_json(
        get_document_context_path(user_id, paper_id),
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

    return PaperWithUrls(**paper_with_urls(paper))


def list_user_papers(user_id: str) -> list[PaperWithUrls]:
    return [
        PaperWithUrls(**paper_with_urls(paper))
        for paper in read_papers()
        if paper["userId"] == user_id
    ]


def get_user_paper(user_id: str, paper_id: str) -> PaperWithUrls:
    paper = find_paper_or_404(user_id, paper_id)
    return PaperWithUrls(**paper_with_urls(paper))
