from pydantic import BaseModel, Field
from typing import List, Literal, Optional


EducationLevel = Literal[
    "unspecified",
    "middle_school",
    "high_school",
    "undergraduate",
    "graduate",
    "professional",
]

ExplanationDepth = Literal["gentle", "standard", "detailed"]


class UserKnowledgeProfile(BaseModel):
    """
    Typed representation of what NoviceReader knows about a user's background.

    The default intentionally represents an empty onboarding form: when a user
    has not told us anything, we assume a curious high-school level reader and
    avoid claiming specific prior knowledge.
    """

    educationLevel: EducationLevel = "high_school"
    assumedFromEmptyOnboarding: bool = True
    backgroundSummary: str = (
        "No onboarding answers yet. Assume a curious high-school student who "
        "may need technical terms, math notation, and research methods "
        "explained from first principles."
    )
    knownCourses: List[str] = Field(default_factory=list)
    knownConcepts: List[str] = Field(default_factory=list)
    knownDomains: List[str] = Field(default_factory=list)
    learningGoals: List[str] = Field(default_factory=list)
    weakAreas: List[str] = Field(default_factory=list)
    explanationPreference: str = "beginner-friendly"
    explanationDepth: ExplanationDepth = "gentle"


class KnowledgeProfileSummary(BaseModel):
    userId: str
    overview: str
    assumedLevel: EducationLevel
    assumptions: List[str] = Field(default_factory=list)
    knownInformation: List[str] = Field(default_factory=list)
    knowledgeGaps: List[str] = Field(default_factory=list)
    explanationGuidance: str


class UserProfile(BaseModel):
    id: str
    displayName: str = "Test User"
    knowledgeProfile: UserKnowledgeProfile = Field(default_factory=UserKnowledgeProfile)
    createdAt: str
    updatedAt: str
