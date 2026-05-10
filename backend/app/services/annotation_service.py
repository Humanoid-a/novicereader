from fastapi import HTTPException
from app.models.annotation import AiAnnotation
from app.storage.paths import get_annotations_path
from app.storage.json_store import read_json, write_json
from app.services.paper_service import find_paper_or_404


def list_annotations(user_id: str, paper_id: str) -> list[AiAnnotation]:
    find_paper_or_404(user_id, paper_id)

    path = get_annotations_path(user_id, paper_id)
    return [AiAnnotation(**item) for item in read_json(path, [])]


def create_annotation(
    user_id: str,
    paper_id: str,
    annotation: AiAnnotation,
) -> AiAnnotation:
    find_paper_or_404(user_id, paper_id)

    if annotation.paperId != paper_id:
        raise HTTPException(status_code=400, detail="Annotation paperId mismatch")

    if annotation.userId != user_id:
        raise HTTPException(status_code=400, detail="Annotation userId mismatch")

    path = get_annotations_path(user_id, paper_id)
    annotations = read_json(path, [])

    annotations.append(annotation.model_dump())
    write_json(path, annotations)

    return annotation


def delete_annotation(user_id: str, paper_id: str, annotation_id: str):
    find_paper_or_404(user_id, paper_id)

    path = get_annotations_path(user_id, paper_id)
    annotations = read_json(path, [])

    original_count = len(annotations)

    annotations = [
        annotation
        for annotation in annotations
        if annotation["id"] != annotation_id
    ]

    if len(annotations) == original_count:
        raise HTTPException(status_code=404, detail="Annotation not found")

    write_json(path, annotations)

    return {
        "success": True,
        "deletedAnnotationId": annotation_id,
    }