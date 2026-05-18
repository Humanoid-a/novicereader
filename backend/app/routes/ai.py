from fastapi import APIRouter, Depends
from app.models.ai import (
    ExplainRequest,
    ExplainResponse,
    FollowUpExplanationRequest,
    FollowUpExplanationResponse,
    AskQuestionRequest,
    AskQuestionResponse,
    AiChatRequest,
    AiChatResponse,
    SummarizeRequest,
    SummarizeResponse,
)
from app.models.chat import QuestionAnswerTurn, QuestionConversation
from app.models.user import UserProfile
from app.services.auth_dependency import get_current_user
from app.services.context_service import build_context_for_question, build_context_for_selection
from app.services.ai_service import (
    call_openai_for_explanation,
    call_openai_for_follow_up_explanation,
    call_openai_for_question,
    call_openai_for_summary,
    call_openai_chat,
    format_annotation_context_for_prompt,
)
from app.services.annotation_service import upsert_annotation_follow_up_explanation
from app.services.question_service import (
    get_question_conversation,
    list_question_conversations,
    list_question_turns,
    save_question_turn,
)

router = APIRouter(prefix="/api", tags=["ai"])


def _find_annotation_for_request(request: object, user_id: str):
    annotation_id = getattr(request, "annotationId", None)
    paper_id = getattr(request, "paperId", None)

    if not annotation_id or not paper_id:
        return None

    from app.services.annotation_service import list_annotations

    for annotation in list_annotations(user_id=user_id, paper_id=paper_id):
        if annotation.id == annotation_id:
            return annotation

    return None


def _get_annotation_response_content(annotation, response_kind: str | None):
    if annotation is None:
        return None

    if response_kind == "summary" and annotation.summary is not None:
        return annotation.summary

    return annotation.explanation


@router.post("/explain", response_model=ExplainResponse)
def explain_selection(
    request: ExplainRequest,
    current_user: UserProfile = Depends(get_current_user),
):
    request_targets = request.targets or ([request.target] if request.target is not None else [])
    context = build_context_for_selection(
        user_id=current_user.id,
        paper_id=request.paperId,
        targets=request_targets,
    )

    explanation = call_openai_for_explanation(
        targets=request_targets,
        prompt=request.prompt,
        context=context,
        knowledge_profile=request.knowledgeProfile,
    )

    return ExplainResponse(explanation=explanation)


@router.post("/summarize", response_model=SummarizeResponse)
def summarize_selection(
    request: SummarizeRequest,
    current_user: UserProfile = Depends(get_current_user),
):
    request_targets = request.targets or ([request.target] if request.target is not None else [])
    context = build_context_for_selection(
        user_id=current_user.id,
        paper_id=request.paperId,
        targets=request_targets,
    )

    explanation = call_openai_for_summary(
        targets=request_targets,
        prompt=request.prompt,
        context=context,
        knowledge_profile=request.knowledgeProfile,
    )

    return SummarizeResponse(explanation=explanation)


@router.post("/explain/follow-up", response_model=FollowUpExplanationResponse)
def explain_follow_up(
    request: FollowUpExplanationRequest,
    current_user: UserProfile = Depends(get_current_user),
):
    request_targets = request.targets or ([request.target] if request.target is not None else [])
    context = build_context_for_selection(
        user_id=current_user.id,
        paper_id=request.paperId,
        targets=request_targets,
    )
    annotation = _find_annotation_for_request(request, current_user.id)
    annotation_content = _get_annotation_response_content(
        annotation,
        request.responseKind,
    )

    explanation = call_openai_for_follow_up_explanation(
        target=request.target,
        targets=request_targets,
        follow_up_point=request.followUpPoint,
        annotation_prompt=request.annotationPrompt,
        annotation_explanation=(
            annotation_content
            if annotation_content is not None
            else request.annotationExplanation
        ),
        context=context,
        knowledge_profile=request.knowledgeProfile,
    )

    follow_up = upsert_annotation_follow_up_explanation(
        user_id=current_user.id,
        paper_id=request.paperId,
        annotation_id=request.annotationId,
        prompt=request.followUpPoint,
        response=explanation.mainExplanation,
        response_kind=request.responseKind,
    )

    return FollowUpExplanationResponse(explanation=explanation, followUp=follow_up)


@router.post("/ask", response_model=AskQuestionResponse)
def ask_question(
    request: AskQuestionRequest,
    current_user: UserProfile = Depends(get_current_user),
):
    request_targets = request.targets or ([request.target] if request.target is not None else [])
    if request_targets:
        context = build_context_for_selection(
            user_id=current_user.id,
            paper_id=request.paperId,
            targets=request_targets,
        )
    else:
        context = build_context_for_question(
            user_id=current_user.id,
            paper_id=request.paperId,
        )

    previous_conversation = get_question_conversation(
        user_id=current_user.id,
        paper_id=request.paperId,
        conversation_id=request.conversationId,
    )
    annotation = _find_annotation_for_request(request, current_user.id)
    annotation_explanation = format_annotation_context_for_prompt(
        annotation,
        request.annotationExplanation,
    )

    answer = call_openai_for_question(
        message=request.message,
        context=context,
        target=request.target,
        annotation_explanation=annotation_explanation,
        previous_turns=previous_conversation.turns if previous_conversation else [],
        knowledge_profile=request.knowledgeProfile,
    )

    turn, conversation = save_question_turn(
        user_id=current_user.id,
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
def read_paper_questions(
    paper_id: str,
    current_user: UserProfile = Depends(get_current_user),
):
    return list_question_turns(user_id=current_user.id, paper_id=paper_id)


@router.get("/papers/{paper_id}/conversations", response_model=list[QuestionConversation])
def read_paper_conversations(
    paper_id: str,
    current_user: UserProfile = Depends(get_current_user),
):
    return list_question_conversations(user_id=current_user.id, paper_id=paper_id)


@router.post("/chat", response_model=AiChatResponse)
def chat_with_document(
    request: AiChatRequest,
    current_user: UserProfile = Depends(get_current_user),
):
    message = call_openai_chat(
        message=request.message,
        context=request.context,
    )

    return AiChatResponse(message=message)
