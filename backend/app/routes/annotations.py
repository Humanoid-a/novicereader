from fastapi import APIRouter, Depends
from app.models.annotation import AiAnnotation
from app.models.user import UserProfile
from app.services.auth_dependency import get_current_user
from app.services.annotation_service import (
    list_annotations,
    create_annotation,
    delete_annotation,
    delete_annotations_for_target,
)

router = APIRouter(
    prefix="/api/papers/{paper_id}/annotations",
    tags=["annotations"],
)


@router.get("", response_model=list[AiAnnotation])
def get_annotations(
    paper_id: str,
    current_user: UserProfile = Depends(get_current_user),
):
    return list_annotations(current_user.id, paper_id)


@router.post("", response_model=AiAnnotation)
def post_annotation(
    paper_id: str,
    annotation: AiAnnotation,
    current_user: UserProfile = Depends(get_current_user),
):
    scoped_annotation = annotation.model_copy(update={"userId": current_user.id})

    return create_annotation(current_user.id, paper_id, scoped_annotation)


@router.delete("/targets/{target_id}")
def remove_annotation_target(
    paper_id: str,
    target_id: str,
    current_user: UserProfile = Depends(get_current_user),
):
    return delete_annotations_for_target(current_user.id, paper_id, target_id)


@router.delete("/{annotation_id}")
def remove_annotation(
    paper_id: str,
    annotation_id: str,
    current_user: UserProfile = Depends(get_current_user),
):
    return delete_annotation(current_user.id, paper_id, annotation_id)
