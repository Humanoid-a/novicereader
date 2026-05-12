export type UserKnowledgeProfile = {
  educationLevel:
    | "unspecified"
    | "middle_school"
    | "high_school"
    | "undergraduate"
    | "graduate"
    | "professional";
  assumedFromEmptyOnboarding: boolean;
  backgroundSummary: string;
  knownCourses: string[];
  knownConcepts: string[];
  knownDomains: string[];
  learningGoals: string[];
  weakAreas: string[];
  explanationPreference: string;
  explanationDepth: "gentle" | "standard" | "detailed";
};

export type UserProfile = {
  id: string;
  username: string;
  displayName: string;
  knowledgeProfile: UserKnowledgeProfile;
  createdAt: string;
  updatedAt: string;
};

export type AuthToken = {
  accessToken: string;
  tokenType: "bearer";
  user: UserProfile;
};
