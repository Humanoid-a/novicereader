from fastapi import APIRouter, Query
from app.models.annotation import AiAnnotation
from app.services.annotation_service import (
    list_annotations,
    create_annotation,
    delete_annotation,
)

router = APIRouter(
    prefix="/api/papers/{paper_id}/annotations",
    tags=["annotations"],
)


@router.get("", response_model=list[AiAnnotation])
def get_annotations(
    paper_id: str,
    user_id: str = Query(...),
):
    return list_annotations(user_id, paper_id)


@router.post("", response_model=AiAnnotation)
def post_annotation(
    paper_id: str,
    annotation: AiAnnotation,
    user_id: str = Query(...),
):
    return create_annotation(user_id, paper_id, annotation)


@router.delete("/{annotation_id}")
def remove_annotation(
    paper_id: str,
    annotation_id: str,
    user_id: str = Query(...),
):
    return delete_annotation(user_id, paper_id, annotation_id)