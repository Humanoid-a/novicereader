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
    backgroundSummary: str = ""
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


class UserKnowledgeProfileRecord(BaseModel):
    id: str
    name: str
    knowledgeProfile: UserKnowledgeProfile = Field(default_factory=UserKnowledgeProfile)
    createdAt: str
    updatedAt: str


class UserKnowledgeProfileListItem(BaseModel):
    id: str
    name: str
    isSelected: bool = False
    updatedAt: str


class SaveKnowledgeProfileRequest(BaseModel):
    id: Optional[str] = None
    name: str
    knowledgeProfile: UserKnowledgeProfile
    makeActive: bool = True


class UserProfile(BaseModel):
    id: str
    username: str
    displayName: str = "NoviceReader User"
    knowledgeProfile: UserKnowledgeProfile = Field(default_factory=UserKnowledgeProfile)
    selectedKnowledgeProfileId: Optional[str] = None
    createdAt: str
    updatedAt: str


class StoredUserProfile(UserProfile):
    passwordHash: str
    disabled: bool = False


class RegisterUserRequest(BaseModel):
    username: str
    password: str
    registrationCode: str
    displayName: Optional[str] = None
    knowledgeProfile: Optional[UserKnowledgeProfile] = None


class LoginUserRequest(BaseModel):
    username: str
    password: str


class AuthToken(BaseModel):
    accessToken: str
    tokenType: str = "bearer"
    user: UserProfile
