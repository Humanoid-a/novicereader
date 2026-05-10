from pydantic import BaseModel, Field
from typing import Literal, Optional, List, Union


class NormalizedPdfRect(BaseModel):
    pageNumber: int
    x: float
    y: float
    width: float
    height: float


class TextAnnotationChunk(BaseModel):
    id: str
    pageNumber: int
    text: str
    rect: NormalizedPdfRect


class TextAnnotationTarget(BaseModel):
    type: Literal["text"]
    id: str

    # Full selected text, used for AI.
    text: str

    # Structured highlight chunks, used for rendering clickable PDF highlights.
    chunks: List[TextAnnotationChunk] = Field(default_factory=list)

    createdAt: str


class RegionRect(BaseModel):
    x: float
    y: float
    width: float
    height: float


class RegionAnnotationTarget(BaseModel):
    type: Literal["region"]
    id: str
    pageNumber: int
    rect: RegionRect

    # Temporary. Later store images in object storage instead of JSON.
    imageDataUrl: Optional[str] = None

    createdAt: str


AnnotationTarget = Union[TextAnnotationTarget, RegionAnnotationTarget]


class KnowledgePoint(BaseModel):
    id: str
    title: str
    explanation: str


class ConversationMessage(BaseModel):
    id: str
    role: Literal["user", "assistant"]
    content: str
    createdAt: str


class AiExplanationContent(BaseModel):
    mainExplanation: str
    knowledgePoints: List[KnowledgePoint] = Field(default_factory=list)
    followUpConversation: List[ConversationMessage] = Field(default_factory=list)
    relatedConcepts: List[str] = Field(default_factory=list)


class AiAnnotation(BaseModel):
    id: str
    paperId: str
    userId: str
    target: AnnotationTarget
    prompt: str

    # Simple compatibility field.
    response: str

    # Structured explanation for future UI sections.
    explanation: AiExplanationContent

    createdAt: str