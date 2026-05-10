from fastapi import APIRouter, UploadFile, File, Query, HTTPException
from fastapi.responses import FileResponse

from app.models.paper import PaperWithUrls
from app.services.paper_service import (
    upload_paper_for_user,
    list_user_papers,
    get_user_paper,
    find_paper_or_404,
)
from app.storage.paths import get_user_paper_dir

router = APIRouter(prefix="/api/papers", tags=["papers"])


@router.post("", response_model=PaperWithUrls)
async def upload_paper(
    user_id: str = Query(...),
    file: UploadFile = File(...),
):
    return await upload_paper_for_user(user_id, file)


@router.get("", response_model=list[PaperWithUrls])
def list_papers(user_id: str = Query(...)):
    return list_user_papers(user_id)


@router.get("/{paper_id}", response_model=PaperWithUrls)
def get_paper(
    paper_id: str,
    user_id: str = Query(...),
):
    return get_user_paper(user_id, paper_id)


@router.get("/{paper_id}/file")
def get_paper_file(
    paper_id: str,
    user_id: str = Query(...),
):
    paper = find_paper_or_404(user_id, paper_id)

    file_path = get_user_paper_dir(user_id, paper_id) / paper["storedFilename"]

    if not file_path.exists():
        raise HTTPException(status_code=404, detail="PDF file not found")

    return FileResponse(
        path=file_path,
        media_type="application/pdf",
        filename=paper["originalFilename"],
    )