from fastapi import HTTPException
from datetime import datetime, timezone
import uuid

from app.models.annotation import AiAnnotation, FollowUpExplanationItem
from app.storage.data_store import (
    read_annotation_records,
    save_annotation_record,
    write_annotation_records,
)
from app.services.paper_service import find_paper_or_404
from app.services.question_service import has_questions_linked_to_target


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def list_annotations(user_id: str, paper_id: str) -> list[AiAnnotation]:
    find_paper_or_404(user_id, paper_id)

    return [
        AiAnnotation(**item)
        for item in read_annotation_records(user_id, paper_id)
        if not item.get("isDeleted", False)
    ]


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

    save_annotation_record(
        user_id=user_id,
        paper_id=paper_id,
        annotation=annotation.model_dump(),
    )

    return annotation


def upsert_annotation_follow_up_explanation(
    user_id: str,
    paper_id: str,
    annotation_id: str,
    prompt: str,
    response: str,
) -> FollowUpExplanationItem:
    find_paper_or_404(user_id, paper_id)

    annotations = read_annotation_records(user_id, paper_id)
    timestamp = now_iso()

    for annotation in annotations:
        if annotation.get("id") != annotation_id:
            continue

        explanation = annotation.setdefault(
            "explanation",
            {
                "mainExplanation": annotation.get("response", ""),
                "knowledgePoints": [],
                "followUpConversation": [],
                "relatedConcepts": [],
                "followUpExplanations": [],
            },
        )
        follow_ups = explanation.setdefault("followUpExplanations", [])

        for follow_up in follow_ups:
            if follow_up.get("prompt") == prompt:
                follow_up["response"] = response
                follow_up["updatedAt"] = timestamp
                write_annotation_records(user_id, paper_id, annotations)
                return FollowUpExplanationItem(**follow_up)

        follow_up = FollowUpExplanationItem(
            id=str(uuid.uuid4()),
            prompt=prompt,
            response=response,
            createdAt=timestamp,
            updatedAt=timestamp,
        )
        follow_ups.append(follow_up.model_dump())
        write_annotation_records(user_id, paper_id, annotations)

        return follow_up

    raise HTTPException(status_code=404, detail="Annotation not found")


def delete_annotation(user_id: str, paper_id: str, annotation_id: str):
    find_paper_or_404(user_id, paper_id)

    annotations = read_annotation_records(user_id, paper_id)

    original_count = len(annotations)

    annotations = [
        annotation
        for annotation in annotations
        if annotation["id"] != annotation_id
    ]

    if len(annotations) == original_count:
        raise HTTPException(status_code=404, detail="Annotation not found")

    write_annotation_records(user_id, paper_id, annotations)

    return {
        "success": True,
        "deletedAnnotationId": annotation_id,
    }


def delete_annotations_for_target(user_id: str, paper_id: str, target_id: str):
    find_paper_or_404(user_id, paper_id)

    annotations = read_annotation_records(user_id, paper_id)

    deleted_annotation_ids = [
        annotation["id"]
        for annotation in annotations
        if annotation.get("target", {}).get("id") == target_id
    ]

    if not deleted_annotation_ids:
        raise HTTPException(status_code=404, detail="Annotation target not found")

    if has_questions_linked_to_target(user_id, paper_id, target_id):
        timestamp = now_iso()
        remaining_annotations = []

        for annotation in annotations:
            if annotation.get("target", {}).get("id") == target_id:
                annotation["isDeleted"] = True
                annotation["deletedAt"] = timestamp

            remaining_annotations.append(annotation)

        write_annotation_records(user_id, paper_id, remaining_annotations)
    else:
        remaining_annotations = [
            annotation
            for annotation in annotations
            if annotation.get("target", {}).get("id") != target_id
        ]

        write_annotation_records(user_id, paper_id, remaining_annotations)

    return {
        "success": True,
        "deletedTargetId": target_id,
        "deletedAnnotationIds": deleted_annotation_ids,
    }
