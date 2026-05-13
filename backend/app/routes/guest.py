from fastapi import APIRouter, File, Header, Query, UploadFile
from fastapi.responses import FileResponse

from app.models.ai import (
    AiChatRequest,
    AiChatResponse,
    AskQuestionRequest,
    AskQuestionResponse,
    ExplainRequest,
    ExplainResponse,
    FollowUpExplanationRequest,
    FollowUpExplanationResponse,
)
from app.models.annotation import AiAnnotation
from app.models.chat import QuestionAnswerTurn, QuestionConversation
from app.models.guest import EndGuestSessionRequest, GuestSessionResponse
from app.models.paper import PaperWithUrls
from app.services.ai_service import (
    call_openai_chat,
    call_openai_for_explanation,
    call_openai_for_follow_up_explanation,
    call_openai_for_question,
)
from app.services.annotation_service import (
    create_annotation,
    delete_annotation,
    delete_annotations_for_target,
    list_annotations,
    upsert_annotation_follow_up_explanation,
)
from app.services.context_service import build_context_for_question, build_context_for_selection
from app.services.guest_service import (
    create_guest_session,
    delete_guest_paper,
    end_guest_session,
    get_guest_paper,
    get_guest_paper_file_path,
    get_guest_user_id,
    list_guest_papers,
    upload_guest_paper,
)
from app.services.question_service import (
    get_question_conversation,
    list_question_conversations,
    list_question_turns,
    save_question_turn,
)


router = APIRouter(prefix="/api/guest", tags=["guest"])


def get_guest_user_id_from_headers(
    x_guest_session_id: str = Header(...),
    x_guest_session_token: str = Header(...),
) -> str:
    return get_guest_user_id(
        session_id=x_guest_session_id,
        session_token=x_guest_session_token,
    )


def _find_annotation_for_request(request: object, user_id: str):
    annotation_id = getattr(request, "annotationId", None)
    paper_id = getattr(request, "paperId", None)

    if not annotation_id or not paper_id:
        return None

    for annotation in list_annotations(user_id=user_id, paper_id=paper_id):
        if annotation.id == annotation_id:
            return annotation

    return None


@router.post("/session", response_model=GuestSessionResponse)
def create_guest_reader_session():
    return create_guest_session()


@router.post("/session/end")
def end_guest_reader_session(request: EndGuestSessionRequest):
    return end_guest_session(
        session_id=request.sessionId,
        session_token=request.sessionToken,
    )


@router.post("/papers", response_model=PaperWithUrls)
async def upload_guest_reader_paper(
    file: UploadFile = File(...),
    x_guest_session_id: str = Header(...),
    x_guest_session_token: str = Header(...),
):
    return await upload_guest_paper(
        session_id=x_guest_session_id,
        session_token=x_guest_session_token,
        file=file,
    )


@router.get("/papers", response_model=list[PaperWithUrls])
def read_guest_reader_papers(
    x_guest_session_id: str = Header(...),
    x_guest_session_token: str = Header(...),
):
    return list_guest_papers(
        session_id=x_guest_session_id,
        session_token=x_guest_session_token,
    )


@router.get("/papers/{paper_id}", response_model=PaperWithUrls)
def read_guest_reader_paper(
    paper_id: str,
    x_guest_session_id: str = Header(...),
    x_guest_session_token: str = Header(...),
):
    return get_guest_paper(
        session_id=x_guest_session_id,
        session_token=x_guest_session_token,
        paper_id=paper_id,
    )


@router.post("/papers/{paper_id}/delete")
def delete_guest_reader_paper(
    paper_id: str,
    x_guest_session_id: str = Header(...),
    x_guest_session_token: str = Header(...),
):
    return delete_guest_paper(
        session_id=x_guest_session_id,
        session_token=x_guest_session_token,
        paper_id=paper_id,
    )


@router.get("/papers/{paper_id}/file")
def read_guest_reader_paper_file(
    paper_id: str,
    session_id: str = Query(...),
    session_token: str = Query(...),
):
    paper, file_path = get_guest_paper_file_path(
        session_id=session_id,
        session_token=session_token,
        paper_id=paper_id,
    )

    return FileResponse(
        path=file_path,
        media_type="application/pdf",
        filename=paper["originalFilename"],
    )


@router.get("/papers/{paper_id}/annotations", response_model=list[AiAnnotation])
def read_guest_reader_annotations(
    paper_id: str,
    x_guest_session_id: str = Header(...),
    x_guest_session_token: str = Header(...),
):
    guest_user_id = get_guest_user_id_from_headers(
        x_guest_session_id=x_guest_session_id,
        x_guest_session_token=x_guest_session_token,
    )

    return list_annotations(guest_user_id, paper_id)


@router.post("/papers/{paper_id}/annotations", response_model=AiAnnotation)
def create_guest_reader_annotation(
    paper_id: str,
    annotation: AiAnnotation,
    x_guest_session_id: str = Header(...),
    x_guest_session_token: str = Header(...),
):
    guest_user_id = get_guest_user_id_from_headers(
        x_guest_session_id=x_guest_session_id,
        x_guest_session_token=x_guest_session_token,
    )
    scoped_annotation = annotation.model_copy(update={"userId": guest_user_id})

    return create_annotation(guest_user_id, paper_id, scoped_annotation)


@router.delete("/papers/{paper_id}/annotations/targets/{target_id}")
def delete_guest_reader_annotation_target(
    paper_id: str,
    target_id: str,
    x_guest_session_id: str = Header(...),
    x_guest_session_token: str = Header(...),
):
    guest_user_id = get_guest_user_id_from_headers(
        x_guest_session_id=x_guest_session_id,
        x_guest_session_token=x_guest_session_token,
    )

    return delete_annotations_for_target(guest_user_id, paper_id, target_id)


@router.delete("/papers/{paper_id}/annotations/{annotation_id}")
def delete_guest_reader_annotation(
    paper_id: str,
    annotation_id: str,
    x_guest_session_id: str = Header(...),
    x_guest_session_token: str = Header(...),
):
    guest_user_id = get_guest_user_id_from_headers(
        x_guest_session_id=x_guest_session_id,
        x_guest_session_token=x_guest_session_token,
    )

    return delete_annotation(guest_user_id, paper_id, annotation_id)


@router.post("/explain", response_model=ExplainResponse)
def explain_guest_reader_selection(
    request: ExplainRequest,
    x_guest_session_id: str = Header(...),
    x_guest_session_token: str = Header(...),
):
    guest_user_id = get_guest_user_id_from_headers(
        x_guest_session_id=x_guest_session_id,
        x_guest_session_token=x_guest_session_token,
    )
    context = build_context_for_selection(
        user_id=guest_user_id,
        paper_id=request.paperId,
        target=request.target,
    )
    explanation = call_openai_for_explanation(
        target=request.target,
        prompt=request.prompt,
        context=context,
    )

    return ExplainResponse(explanation=explanation)


@router.post("/explain/follow-up", response_model=FollowUpExplanationResponse)
def explain_guest_reader_follow_up(
    request: FollowUpExplanationRequest,
    x_guest_session_id: str = Header(...),
    x_guest_session_token: str = Header(...),
):
    guest_user_id = get_guest_user_id_from_headers(
        x_guest_session_id=x_guest_session_id,
        x_guest_session_token=x_guest_session_token,
    )
    context = build_context_for_selection(
        user_id=guest_user_id,
        paper_id=request.paperId,
        target=request.target,
    )
    annotation = _find_annotation_for_request(request, guest_user_id)
    explanation = call_openai_for_follow_up_explanation(
        target=request.target,
        follow_up_point=request.followUpPoint,
        annotation_prompt=request.annotationPrompt,
        annotation_explanation=(
            annotation.explanation
            if annotation is not None
            else request.annotationExplanation
        ),
        context=context,
    )
    follow_up = upsert_annotation_follow_up_explanation(
        user_id=guest_user_id,
        paper_id=request.paperId,
        annotation_id=request.annotationId,
        prompt=request.followUpPoint,
        response=explanation.mainExplanation,
    )

    return FollowUpExplanationResponse(explanation=explanation, followUp=follow_up)


@router.post("/ask", response_model=AskQuestionResponse)
def ask_guest_reader_question(
    request: AskQuestionRequest,
    x_guest_session_id: str = Header(...),
    x_guest_session_token: str = Header(...),
):
    guest_user_id = get_guest_user_id_from_headers(
        x_guest_session_id=x_guest_session_id,
        x_guest_session_token=x_guest_session_token,
    )

    if request.target is not None:
        context = build_context_for_selection(
            user_id=guest_user_id,
            paper_id=request.paperId,
            target=request.target,
        )
    else:
        context = build_context_for_question(
            user_id=guest_user_id,
            paper_id=request.paperId,
        )

    previous_conversation = get_question_conversation(
        user_id=guest_user_id,
        paper_id=request.paperId,
        conversation_id=request.conversationId,
    )
    annotation = _find_annotation_for_request(request, guest_user_id)
    annotation_explanation = (
        annotation.explanation
        if annotation is not None and annotation.explanation is not None
        else request.annotationExplanation
    )
    answer = call_openai_for_question(
        message=request.message,
        context=context,
        target=request.target,
        annotation_explanation=annotation_explanation,
        previous_turns=previous_conversation.turns if previous_conversation else [],
    )
    turn, conversation = save_question_turn(
        user_id=guest_user_id,
        paper_id=request.paperId,
        user_message=request.message,
        ai_response=answer,
        conversation_id=request.conversationId,
        target=request.target,
        annotation_id=request.annotationId,
        annotation_explanation=annotation_explanation,
    )

    return AskQuestionResponse(answer=answer, turn=turn, conversation=conversation)


@router.get("/papers/{paper_id}/questions", response_model=list[QuestionAnswerTurn])
def read_guest_reader_questions(
    paper_id: str,
    x_guest_session_id: str = Header(...),
    x_guest_session_token: str = Header(...),
):
    guest_user_id = get_guest_user_id_from_headers(
        x_guest_session_id=x_guest_session_id,
        x_guest_session_token=x_guest_session_token,
    )

    return list_question_turns(user_id=guest_user_id, paper_id=paper_id)


@router.get("/papers/{paper_id}/conversations", response_model=list[QuestionConversation])
def read_guest_reader_conversations(
    paper_id: str,
    x_guest_session_id: str = Header(...),
    x_guest_session_token: str = Header(...),
):
    guest_user_id = get_guest_user_id_from_headers(
        x_guest_session_id=x_guest_session_id,
        x_guest_session_token=x_guest_session_token,
    )

    return list_question_conversations(user_id=guest_user_id, paper_id=paper_id)


@router.post("/chat", response_model=AiChatResponse)
def chat_with_guest_reader_document(
    request: AiChatRequest,
    x_guest_session_id: str = Header(...),
    x_guest_session_token: str = Header(...),
):
    get_guest_user_id_from_headers(
        x_guest_session_id=x_guest_session_id,
        x_guest_session_token=x_guest_session_token,
    )
    message = call_openai_chat(
        message=request.message,
        context=request.context,
    )

    return AiChatResponse(message=message)
