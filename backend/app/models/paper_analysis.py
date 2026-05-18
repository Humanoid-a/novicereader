from pydantic import BaseModel, Field
from typing import Literal, Optional


PaperAnalysisStatus = Literal["ready", "placeholder", "failed"]


class PaperSectionSummary(BaseModel):
    id: str
    sectionTitle: str
    sectionOrder: int
    pageRange: Optional[str] = None
    contentSummary: str
    mainIdea: str
    readerTakeaway: str
    keyTerms: list[str] = Field(default_factory=list)


class PaperAcademicContext(BaseModel):
    overview: str
    appPurposeContext: str
    readerKnowledgeContext: str
    prerequisiteIdeas: list[str] = Field(default_factory=list)
    relatedResearchAreas: list[str] = Field(default_factory=list)
    relatedWorksOrMethods: list[str] = Field(default_factory=list)
    whyThisPaperMatters: str
    limitationsOrUncertainties: list[str] = Field(default_factory=list)
    suggestedBackgroundReadingQuestions: list[str] = Field(default_factory=list)


class PaperFigureAnalysis(BaseModel):
    id: str
    figureLabel: str
    figureOrder: int
    pageNumber: Optional[int] = None
    figureType: Optional[str] = None
    whatItShows: str
    significanceInText: str
    contributionToMainIdea: str
    howToReadIt: str
    possibleConfusions: list[str] = Field(default_factory=list)


class PaperAnalysisProfile(BaseModel):
    id: str
    paperId: str
    userId: str
    status: PaperAnalysisStatus
    sectionSummaries: list[PaperSectionSummary] = Field(default_factory=list)
    academicContext: PaperAcademicContext
    figureAnalyses: list[PaperFigureAnalysis] = Field(default_factory=list)
    generationNotes: list[str] = Field(default_factory=list)
    createdAt: str
    updatedAt: str
