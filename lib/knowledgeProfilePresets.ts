import {
  DEFAULT_KNOWLEDGE_PROFILE,
  DEFAULT_KNOWLEDGE_PROFILE_NAME,
} from "@/lib/knowledgeProfileStore";
import type { UserKnowledgeProfile } from "@/types/user";

export type KnowledgeProfilePreset = {
  id: string;
  name: string;
  description: string;
  defaultName: string;
  knowledgeProfile: UserKnowledgeProfile;
};

function buildPresetKnowledgeProfile({
  backgroundSummary,
  knownDomains = [],
  explanationDepth = "gentle",
}: {
  backgroundSummary: string;
  knownDomains?: string[];
  explanationDepth?: UserKnowledgeProfile["explanationDepth"];
}): UserKnowledgeProfile {
  return {
    ...DEFAULT_KNOWLEDGE_PROFILE,
    assumedFromEmptyOnboarding: false,
    backgroundSummary,
    knownDomains,
    weakAreas: [],
    explanationDepth,
  };
}

export const EMPTY_KNOWLEDGE_PROFILE_PRESET: KnowledgeProfilePreset = {
  id: "empty",
  name: "Empty profile",
  description: "Start blank and describe the reader yourself.",
  defaultName: DEFAULT_KNOWLEDGE_PROFILE_NAME,
  knowledgeProfile: DEFAULT_KNOWLEDGE_PROFILE,
};

export const KNOWLEDGE_PROFILE_PRESETS: KnowledgeProfilePreset[] = [
  {
    id: "high-school-student",
    name: "High school student",
    description: "Good for general papers with patient explanations.",
    defaultName: DEFAULT_KNOWLEDGE_PROFILE_NAME,
    knowledgeProfile: DEFAULT_KNOWLEDGE_PROFILE,
  },
  {
    id: "cs-undergrad",
    name: "CS undergrad",
    description: "Programming and algorithms background.",
    defaultName: "CS undergrad",
    knowledgeProfile: buildPresetKnowledgeProfile({
      backgroundSummary:
        "An undergraduate computer science student comfortable with programming, algorithms, and basic discrete math.",
      knownDomains: ["computer science"],
    }),
  },
  {
    id: "biology-teacher",
    name: "Biology teacher",
    description: "Strong life science background.",
    defaultName: "Biology teacher",
    knowledgeProfile: buildPresetKnowledgeProfile({
      backgroundSummary:
        "A biology teacher who knows core biology concepts and classroom-level experimental design.",
      knownDomains: ["biology"],
    }),
  },
  {
    id: "chemistry-teacher",
    name: "Chemistry teacher",
    description: "Chemistry-first explanations with lab context.",
    defaultName: "Chemistry teacher",
    knowledgeProfile: buildPresetKnowledgeProfile({
      backgroundSummary:
        "A chemistry teacher familiar with general chemistry, reactions, thermodynamics, and lab methods.",
      knownDomains: ["chemistry"],
    }),
  },
  {
    id: "medical-student",
    name: "Medical student",
    description: "Clinical and biology vocabulary.",
    defaultName: "Medical student",
    knowledgeProfile: buildPresetKnowledgeProfile({
      backgroundSummary:
        "A medical student familiar with anatomy, physiology, pathology, and clinical vocabulary.",
      knownDomains: ["medicine"],
    }),
  },
  {
    id: "psychology-student",
    name: "Psychology student",
    description: "Behavioral science and research background.",
    defaultName: "Psychology student",
    knowledgeProfile: buildPresetKnowledgeProfile({
      backgroundSummary:
        "A psychology student familiar with experiments, cognition, behavior, and basic research design.",
      knownDomains: ["psychology"],
    }),
  },
  {
    id: "data-science-beginner",
    name: "Data science beginner",
    description: "Knows coding basics, needs model intuition.",
    defaultName: "Data science beginner",
    knowledgeProfile: buildPresetKnowledgeProfile({
      backgroundSummary:
        "A beginner in data science who knows basic Python and wants intuitive explanations of models and evaluation.",
      knownDomains: ["data analysis"],
    }),
  },
  {
    id: "physics-undergrad",
    name: "Physics undergrad",
    description: "Comfortable with equations and physical intuition.",
    defaultName: "Physics undergrad",
    knowledgeProfile: buildPresetKnowledgeProfile({
      backgroundSummary:
        "An undergraduate physics student comfortable with calculus, equations, and physical modeling.",
      knownDomains: ["physics"],
      explanationDepth: "standard",
    }),
  },
  {
    id: "humanities-researcher",
    name: "Humanities researcher",
    description: "Strong reading skills, less technical notation.",
    defaultName: "Humanities researcher",
    knowledgeProfile: buildPresetKnowledgeProfile({
      backgroundSummary:
        "A humanities researcher with strong reading and argument analysis skills, but less comfort with technical notation.",
      knownDomains: ["humanities"],
    }),
  },
  {
    id: "business-professional",
    name: "Business professional",
    description: "Practical summaries with careful term definitions.",
    defaultName: "Business professional",
    knowledgeProfile: buildPresetKnowledgeProfile({
      backgroundSummary:
        "A business professional who wants practical implications, clear definitions, and concise explanations of technical details.",
      knownDomains: ["business"],
    }),
  },
];
