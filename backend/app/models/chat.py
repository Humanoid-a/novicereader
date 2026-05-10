from pydantic import BaseModel, Field
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