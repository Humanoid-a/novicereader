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


class FollowUpExplanationItem(BaseModel):
    id: str
    prompt: str
    response: Optional[str] = None
    createdAt: str
    updatedAt: str


class AiExplanationContent(BaseModel):
    mainExplanation: str
    knowledgePoints: List[KnowledgePoint] = Field(default_factory=list)
    followUpConversation: List[ConversationMessage] = Field(default_factory=list)
    relatedConcepts: List[str] = Field(default_factory=list)
    followUpExplanations: List[FollowUpExplanationItem] = Field(default_factory=list)

    def __str__(self) -> str:
        sections: list[str] = []
        main_explanation = self.mainExplanation.strip()

        if main_explanation:
            sections.append(main_explanation)

        saved_follow_ups = {
            item.prompt.strip().casefold(): item
            for item in self.followUpExplanations
            if item.prompt.strip()
        }
        printed_prompts: set[str] = set()
        follow_up_lines: list[str] = []

        for concept in self.relatedConcepts:
            prompt_text = str(concept).strip()
            if not prompt_text:
                continue

            prompt_key = prompt_text.casefold()
            printed_prompts.add(prompt_key)
            follow_up_lines.append(f"- Follow-up question: {prompt_text}")

            saved_item = saved_follow_ups.get(prompt_key)
            if saved_item and saved_item.response.strip():
                follow_up_lines.append(
                    f"  Saved follow-up explanation: {saved_item.response.strip()}"
                )

        for item in self.followUpExplanations:
            prompt_text = item.prompt.strip()
            if not prompt_text:
                continue

            prompt_key = prompt_text.casefold()
            if prompt_key in printed_prompts:
                continue

            follow_up_lines.append(f"- Follow-up question: {prompt_text}")
            if item.response.strip():
                follow_up_lines.append(
                    f"  Saved follow-up explanation: {item.response.strip()}"
                )

        if follow_up_lines:
            sections.append(
                "Follow-up questions and saved explanations:\n"
                + "\n".join(follow_up_lines)
            )

        return "\n\n".join(sections)


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
    isDeleted: bool = False
    deletedAt: Optional[str] = None

    def __str__(self) -> str:
        sections = [
            f"Annotation id: {self.id}",
            f"Annotation target id: {self.target.id}",
            f"Annotation type: {self.target.type}",
        ]

        if self.target.type == "text":
            sections.append(f"Selected text:\n{self.target.text}")
        else:
            sections.append(f"Selected region page: {self.target.pageNumber}")

        if self.explanation is not None:
            sections.append("Annotation explanation and follow-ups:\n" + str(self.explanation))

        return "\n\n".join(sections)
