from pydantic import BaseModel
from typing import Literal
from app.models.annotation import (
    AnnotationTarget,
    AiExplanationContent,
    FollowUpExplanationItem,
)
from app.models.chat import QuestionAnswerTurn, QuestionConversation
from app.models.context import DocumentContext
from app.models.user import UserKnowledgeProfile


class ExplainRequest(BaseModel):
    paperId: str
    userId: str | None = None
    target: AnnotationTarget | None = None
    targets: list[AnnotationTarget] | None = None
    prompt: str
    knowledgeProfile: UserKnowledgeProfile | None = None


class ExplainResponse(BaseModel):
    explanation: AiExplanationContent


class SummarizeRequest(ExplainRequest):
    pass


class SummarizeResponse(BaseModel):
    explanation: AiExplanationContent


class FollowUpExplanationRequest(BaseModel):
    paperId: str
    userId: str | None = None
    annotationId: str
    target: AnnotationTarget | None = None
    targets: list[AnnotationTarget] | None = None
    annotationPrompt: str
    annotationExplanation: str
    followUpPoint: str
    responseKind: Literal["explanation", "summary"] | None = None
    knowledgeProfile: UserKnowledgeProfile | None = None


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
    targets: list[AnnotationTarget] | None = None
    annotationExplanation: str | None = None
    responseKind: Literal["explanation", "summary"] | None = None
    knowledgeProfile: UserKnowledgeProfile | None = None


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
