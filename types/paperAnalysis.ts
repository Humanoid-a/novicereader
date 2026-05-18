export type PaperAnalysisStatus = "ready" | "placeholder" | "failed";

export type PaperSectionSummary = {
  id: string;
  sectionTitle: string;
  sectionOrder: number;
  pageRange?: string | null;
  contentSummary: string;
  mainIdea: string;
  readerTakeaway: string;
  keyTerms: string[];
};

export type PaperAcademicContext = {
  overview: string;
  appPurposeContext: string;
  readerKnowledgeContext: string;
  prerequisiteIdeas: string[];
  relatedResearchAreas: string[];
  relatedWorksOrMethods: string[];
  whyThisPaperMatters: string;
  limitationsOrUncertainties: string[];
  suggestedBackgroundReadingQuestions: string[];
};

export type PaperFigureAnalysis = {
  id: string;
  figureLabel: string;
  figureOrder: number;
  pageNumber?: number | null;
  figureType?: string | null;
  whatItShows: string;
  significanceInText: string;
  contributionToMainIdea: string;
  howToReadIt: string;
  possibleConfusions: string[];
};

export type PaperAnalysisProfile = {
  id: string;
  paperId: string;
  userId: string;
  status: PaperAnalysisStatus;
  sectionSummaries: PaperSectionSummary[];
  academicContext: PaperAcademicContext;
  figureAnalyses: PaperFigureAnalysis[];
  generationNotes: string[];
  createdAt: string;
  updatedAt: string;
};
