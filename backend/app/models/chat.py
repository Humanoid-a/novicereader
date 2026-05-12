from pydantic import BaseModel, Field, field_validator
from typing import List, Literal, Optional
from app.models.annotation import AnnotationTarget


class DocumentChatMessage(BaseModel):
    id: str
    paperId: str
    userId: str
    role: Literal["user", "assistant", "system"]
    content: str
    createdAt: str

    # Optional link to a selected annotation target.
    target: Optional[AnnotationTarget] = None


class DocumentChatThread(BaseModel):
    id: str
    paperId: str
    userId: str
    title: str = "Document chat"
    messages: List[DocumentChatMessage] = Field(default_factory=list)
    createdAt: str
    updatedAt: str


class QuestionLinkedSelection(BaseModel):
    annotationId: Optional[str] = None
    annotationTargetId: str
    target: AnnotationTarget
    annotationExplanation: Optional[str] = None

    @field_validator("annotationExplanation", mode="before")
    @classmethod
    def coerce_annotation_explanation(cls, value: object) -> str | None:
        if value is None or isinstance(value, str):
            return value

        return str(value)


class QuestionAnswerTurn(BaseModel):
    id: str
    conversationId: str
    paperId: str
    userId: str
    userMessage: str
    aiResponse: str
    linkedSelection: Optional[QuestionLinkedSelection] = None
    createdAt: str


class QuestionConversation(BaseModel):
    id: str
    paperId: str
    userId: str
    title: str = "Paper questions"
    turns: List[QuestionAnswerTurn] = Field(default_factory=list)
    createdAt: str
    updatedAt: str
