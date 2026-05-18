from fastapi import APIRouter, BackgroundTasks, Depends, UploadFile, File

from app.models.paper import PaperWithUrls
from app.models.paper_analysis import PaperAnalysisProfile
from app.models.user import UserProfile
from app.services.auth_dependency import get_current_user, get_current_user_for_file_request
from app.services.paper_service import (
    upload_paper_for_user,
    list_user_papers,
    get_user_paper,
    find_paper_or_404,
    delete_user_paper,
)
from app.storage.pdf_storage import get_pdf_response
from app.services.paper_analysis_service import get_paper_analysis_profile

router = APIRouter(prefix="/api/papers", tags=["papers"])


@router.post("", response_model=PaperWithUrls)
async def upload_paper(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    current_user: UserProfile = Depends(get_current_user),
):
    return await upload_paper_for_user(
        current_user.id,
        file,
        background_tasks=background_tasks,
    )


@router.get("", response_model=list[PaperWithUrls])
def list_papers(current_user: UserProfile = Depends(get_current_user)):
    return list_user_papers(current_user.id)


@router.get("/{paper_id}", response_model=PaperWithUrls)
def get_paper(
    paper_id: str,
    current_user: UserProfile = Depends(get_current_user),
):
    return get_user_paper(current_user.id, paper_id)


@router.get("/{paper_id}/analysis-profile", response_model=PaperAnalysisProfile)
def get_paper_analysis(
    paper_id: str,
    current_user: UserProfile = Depends(get_current_user),
):
    return get_paper_analysis_profile(user_id=current_user.id, paper_id=paper_id)


@router.delete("/{paper_id}")
def delete_paper(
    paper_id: str,
    current_user: UserProfile = Depends(get_current_user),
):
    return delete_user_paper(current_user.id, paper_id)


@router.post("/{paper_id}/delete")
def delete_paper_with_post(
    paper_id: str,
    current_user: UserProfile = Depends(get_current_user),
):
    return delete_user_paper(current_user.id, paper_id)


@router.get("/{paper_id}/file")
def get_paper_file(
    paper_id: str,
    current_user: UserProfile = Depends(get_current_user_for_file_request),
):
    paper = find_paper_or_404(current_user.id, paper_id)

    return get_pdf_response(paper)
