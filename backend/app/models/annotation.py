from pydantic import BaseModel, Field, model_validator
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
    annotationName: str = ""
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
            if saved_item and (saved_item.response or "").strip():
                follow_up_lines.append(
                    f"  Saved follow-up explanation: {(saved_item.response or '').strip()}"
                )

        for item in self.followUpExplanations:
            prompt_text = item.prompt.strip()
            if not prompt_text:
                continue

            prompt_key = prompt_text.casefold()
            if prompt_key in printed_prompts:
                continue

            follow_up_lines.append(f"- Follow-up question: {prompt_text}")
            if (item.response or "").strip():
                follow_up_lines.append(
                    f"  Saved follow-up explanation: {(item.response or '').strip()}"
                )

        if follow_up_lines:
            sections.append(
                "Follow-up questions and saved explanations:\n"
                + "\n".join(follow_up_lines)
            )

        return "\n\n".join(sections)


class AiAnnotationVersion(BaseModel):
    id: str
    prompt: str
    response: str
    explanation: AiExplanationContent
    responseKind: Optional[Literal["explanation", "summary"]] = None
    targetIds: List[str] = Field(default_factory=list)
    createdAt: str


class AiAnnotation(BaseModel):
    id: str
    paperId: str
    userId: str

    # Compatibility field for older reader/storage code. New annotations should
    # use targets as the canonical selected-content list.
    target: Optional[AnnotationTarget] = None
    targets: List[AnnotationTarget] = Field(default_factory=list)
    prompt: str

    # Simple compatibility field.
    response: str

    # Structured explanation for future UI sections.
    explanation: AiExplanationContent
    summary: Optional[AiExplanationContent] = None
    responseKind: Optional[Literal["explanation", "summary"]] = None
    versions: List[AiAnnotationVersion] = Field(default_factory=list)

    createdAt: str
    isDeleted: bool = False
    deletedAt: Optional[str] = None

    @model_validator(mode="after")
    def normalize_targets_and_versions(self):
        if self.target is None and self.targets:
            self.target = self.targets[0]

        if not self.targets and self.target is not None:
            self.targets = [self.target]

        if not self.versions:
            self.versions = [
                AiAnnotationVersion(
                    id=self.id,
                    prompt=self.prompt,
                    response=self.response,
                    explanation=self.explanation,
                    responseKind=self.responseKind,
                    targetIds=[target.id for target in self.targets],
                    createdAt=self.createdAt,
                )
            ]

        return self

    def __str__(self) -> str:
        sections = [
            f"Annotation id: {self.id}",
            "Annotation target ids: " + ", ".join(target.id for target in self.targets),
            "Annotation target types: " + ", ".join(target.type for target in self.targets),
        ]

        for index, target in enumerate(self.targets, start=1):
            if target.type == "text":
                sections.append(f"Selected item {index} text:\n{target.text}")
            else:
                sections.append(f"Selected item {index} region page: {target.pageNumber}")

        if self.summary is not None:
            sections.append("Summary part:\n" + str(self.summary))

        if self.explanation is not None:
            sections.append("Explanation part:\n" + str(self.explanation))

        return "\n\n".join(sections)
