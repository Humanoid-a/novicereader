from fastapi import APIRouter
from app.models.ai import ExplainRequest, ExplainResponse, AiChatRequest, AiChatResponse
from app.services.context_service import build_context_for_selection
from app.services.ai_service import (
    call_openai_for_explanation,
    call_openai_chat,
)

router = APIRouter(prefix="/api", tags=["ai"])


@router.post("/explain", response_model=ExplainResponse)
def explain_selection(request: ExplainRequest):
    context = build_context_for_selection(
        user_id=request.userId,
        paper_id=request.paperId,
        target=request.target,
    )

    explanation = call_openai_for_explanation(
        target=request.target,
        prompt=request.prompt,
        context=context,
    )

    return ExplainResponse(explanation=explanation)


@router.post("/chat", response_model=AiChatResponse)
def chat_with_document(request: AiChatRequest):
    message = call_openai_chat(
        message=request.message,
        context=request.context,
    )

    return AiChatResponse(message=message)