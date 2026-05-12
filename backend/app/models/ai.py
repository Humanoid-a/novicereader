from pydantic import BaseModel
from app.models.annotation import (
    AnnotationTarget,
    AiExplanationContent,
    FollowUpExplanationItem,
)
from app.models.chat import QuestionAnswerTurn, QuestionConversation
from app.models.context import DocumentContext


class ExplainRequest(BaseModel):
    paperId: str
    userId: str | None = None
    target: AnnotationTarget
    prompt: str


class ExplainResponse(BaseModel):
    explanation: AiExplanationContent


class FollowUpExplanationRequest(BaseModel):
    paperId: str
    userId: str | None = None
    annotationId: str
    target: AnnotationTarget
    annotationPrompt: str
    annotationExplanation: str
    followUpPoint: str


class FollowUpExplanationResponse(BaseModel):
    explanation: AiExplanationContent
    followUp: FollowUpExplanationItem


class AskQuestionRequest(BaseModel):
    paperId: str
    userId: str | None = None
    message: str
    conversationId: str | None = None
    annotationId: str | None = None
    target: AnnotationTarget | None = None
    annotationExplanation: str | None = None


class AskQuestionResponse(BaseModel):
    answer: str
    turn: QuestionAnswerTurn
    conversation: QuestionConversation


class AiChatRequest(BaseModel):
    paperId: str
    userId: str | None = None
    message: str
    context: DocumentContext


class AiChatResponse(BaseModel):
    message: str
