from pydantic import BaseModel
from app.models.annotation import AnnotationTarget, AiExplanationContent
from app.models.context import DocumentContext


class ExplainRequest(BaseModel):
    paperId: str
    userId: str
    target: AnnotationTarget
    prompt: str


class ExplainResponse(BaseModel):
    explanation: AiExplanationContent


class AiChatRequest(BaseModel):
    paperId: str
    userId: str
    message: str
    context: DocumentContext


class AiChatResponse(BaseModel):
    message: str