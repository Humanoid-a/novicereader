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


def get_annotation_targets(annotation: dict) -> list[dict]:
    targets = annotation.get("targets")

    if isinstance(targets, list) and targets:
        return [target for target in targets if isinstance(target, dict)]

    target = annotation.get("target")
    return [target] if isinstance(target, dict) else []


def annotation_has_target(annotation: dict, target_id: str) -> bool:
    return any(target.get("id") == target_id for target in get_annotation_targets(annotation))


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
    response_kind: str | None = None,
) -> FollowUpExplanationItem:
    find_paper_or_404(user_id, paper_id)

    annotations = read_annotation_records(user_id, paper_id)
    timestamp = now_iso()

    for annotation in annotations:
        if annotation.get("id") != annotation_id:
            continue

        default_content = {
            "mainExplanation": annotation.get("response", ""),
            "knowledgePoints": [],
            "followUpConversation": [],
            "relatedConcepts": [],
            "followUpExplanations": [],
        }
        explanation_key = "summary" if response_kind == "summary" else "explanation"
        explanation = annotation.setdefault(explanation_key, default_content)
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
    annotation_to_delete = next(
        (
            annotation
            for annotation in annotations
            if annotation.get("id") == annotation_id
        ),
        None,
    )

    if annotation_to_delete is None:
        raise HTTPException(status_code=404, detail="Annotation not found")

    linked_to_questions = any(
        has_questions_linked_to_target(user_id, paper_id, target.get("id", ""))
        for target in get_annotation_targets(annotation_to_delete)
    )

    if linked_to_questions:
        timestamp = now_iso()

        annotations = [
            {
                **annotation,
                "isDeleted": True,
                "deletedAt": timestamp,
            }
            if annotation.get("id") == annotation_id
            else annotation
            for annotation in annotations
        ]
    else:
        annotations = [
            annotation
            for annotation in annotations
            if annotation["id"] != annotation_id
        ]

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
        if annotation_has_target(annotation, target_id)
    ]

    if not deleted_annotation_ids:
        raise HTTPException(status_code=404, detail="Annotation target not found")

    if has_questions_linked_to_target(user_id, paper_id, target_id):
        timestamp = now_iso()
        remaining_annotations = []

        for annotation in annotations:
            if annotation_has_target(annotation, target_id):
                annotation["isDeleted"] = True
                annotation["deletedAt"] = timestamp

            remaining_annotations.append(annotation)

        write_annotation_records(user_id, paper_id, remaining_annotations)
    else:
        remaining_annotations = [
            annotation
            for annotation in annotations
            if not annotation_has_target(annotation, target_id)
        ]

        write_annotation_records(user_id, paper_id, remaining_annotations)

    return {
        "success": True,
        "deletedTargetId": target_id,
        "deletedAnnotationIds": deleted_annotation_ids,
    }
