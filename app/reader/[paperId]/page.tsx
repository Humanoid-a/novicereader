"use client";

import { AppMenu } from "@/components/AppMenu";
import { KnowledgeProfilePresetPicker } from "@/components/KnowledgeProfilePresetPicker";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type MouseEvent,
} from "react";
import { createId } from "@/lib/id";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import PdfViewer from "@/components/PdfViewer";
import ReaderGuide from "@/components/ReaderGuide";
import RichAiText, { RichAiInlineText } from "@/components/RichAiText";
import {
  askAiQuestion,
  createPaperAnnotation,
  deletePaperAnnotation,
  explainFollowUpConcept,
  explainSelection,
  getStoredAuthToken,
  getPaper,
  listPaperAnnotations,
  listPaperConversations,
  summarizeSelection,
} from "@/lib/api";
import {
  askGuestAiQuestion,
  createGuestPaperAnnotation,
  deleteGuestAnnotation,
  explainGuestFollowUpConcept,
  explainGuestSelection,
  getGuestPaper,
  getGuestUserProfile,
  isGuestSessionActive,
  listGuestAnnotations,
  listGuestConversations,
  summarizeGuestSelection,
} from "@/lib/guestSession";
import {
  deleteKnowledgeProfileForAccount,
  loadKnowledgeProfileRecordsForAccount,
  saveKnowledgeProfileForAccount,
  selectKnowledgeProfileForAccount,
} from "@/lib/knowledgeProfileSync";
import {
  DEFAULT_KNOWLEDGE_DESCRIPTION,
  DEFAULT_KNOWLEDGE_PROFILE,
  DEFAULT_KNOWLEDGE_PROFILE_NAME,
  getAccountKnowledgeProfileRecords,
  getLocalKnowledgeProfileRecord,
  getUniqueKnowledgeProfileName,
  type LocalKnowledgeProfileRecord,
} from "@/lib/knowledgeProfileStore";
import {
  askLocalAiQuestion,
  createLocalPaperAnnotation,
  deleteLocalAnnotation,
  explainLocalFollowUpConcept,
  explainLocalSelection,
  getLocalPaper,
  isLocalPaperId,
  listLocalAnnotations,
  listLocalConversations,
  summarizeLocalSelection,
} from "@/lib/localLibrary";
import type { PaperWithUrls } from "@/types/paper";
import type {
  AiAnnotation,
  AiAnnotationResponseKind,
  AiExplanationContent,
  AnnotationTarget,
  RegionAnnotationTarget,
  SelectionTool,
  TextAnnotationTarget,
} from "@/types/annotation";
import type { QuestionAnswerTurn, QuestionConversation } from "@/types/questions";
import type { UserKnowledgeProfile, UserProfile } from "@/types/user";
import type { KnowledgeProfilePreset } from "@/lib/knowledgeProfilePresets";

type ReaderProfileForm = {
  backgroundSummary: string;
  knownDomainsText: string;
  weakAreasText: string;
};

type ReaderProfileDialogMode = "edit" | "new";

type ReaderBookmark = {
  id: string;
  ratio: number;
  createdAt: string;
};

type SelectionSnapshot = {
  targets: AnnotationTarget[];
  currentSelectionId: string | null;
  selectedAnnotationId: string | null;
  bookmarks: ReaderBookmark[];
};

function joinProfileList(values: string[]) {
  return values.join("\n");
}

function splitProfileList(value: string) {
  const seen = new Set<string>();
  const items = value
    .split(/[\n,]+/)
    .map((item) => item.trim())
    .filter(Boolean);

  return items.filter((item) => {
    const normalized = item.toLowerCase();

    if (seen.has(normalized)) {
      return false;
    }

    seen.add(normalized);
    return true;
  });
}

function getReaderProfileForm(
  profile = DEFAULT_KNOWLEDGE_PROFILE
): ReaderProfileForm {
  return {
    backgroundSummary: profile.assumedFromEmptyOnboarding
      ? ""
      : profile.backgroundSummary,
    knownDomainsText: joinProfileList(profile.knownDomains),
    weakAreasText: joinProfileList(profile.weakAreas),
  };
}

function buildReaderKnowledgeProfile(
  form: ReaderProfileForm
): UserKnowledgeProfile {
  const backgroundSummary = form.backgroundSummary.trim();
  const knownDomains = splitProfileList(form.knownDomainsText);
  const weakAreas = splitProfileList(form.weakAreasText);
  const hasUserProfile =
    Boolean(backgroundSummary) ||
    knownDomains.length > 0 ||
    weakAreas.length > 0;

  return {
    ...DEFAULT_KNOWLEDGE_PROFILE,
    assumedFromEmptyOnboarding: !hasUserProfile,
    backgroundSummary,
    knownDomains,
    weakAreas,
  };
}

function cleanTextForDisplay(text: string) {
  return text.replace(/\s+/g, " ").trim();
}

function cleanPaperTitleForDisplay(filename: string) {
  return filename.replace(/\.pdf$/i, "");
}

function shortenTextForDisplay(text: string, maxLength = 180) {
  const cleaned = cleanTextForDisplay(text);

  if (cleaned.length <= maxLength) {
    return cleaned;
  }

  const start = cleaned.slice(0, 110);
  const end = cleaned.slice(-50);

  return `${start} ... ${end}`;
}

function isEventTargetInsideElement(
  target: EventTarget | null,
  element: HTMLElement | null
) {
  return (
    typeof Node !== "undefined" &&
    target instanceof Node &&
    Boolean(element?.contains(target))
  );
}

function isEditableShortcutTarget(target: EventTarget | null) {
  return (
    typeof HTMLElement !== "undefined" &&
    target instanceof HTMLElement &&
    Boolean(target.closest("input, textarea, select, [contenteditable]"))
  );
}

function inferResponseKindFromPrompt(prompt: string): AiAnnotationResponseKind {
  const promptText = prompt.trim().toLowerCase();

  if (
    promptText.startsWith("summarize") ||
    promptText.startsWith("summary") ||
    promptText.includes(" summarize ") ||
    promptText.includes(" summary ")
  ) {
    return "summary";
  }

  return "explanation";
}

function inferAnnotationResponseKind(
  annotation: AiAnnotation | null
): AiAnnotationResponseKind {
  if (annotation?.responseKind === "summary") {
    return "summary";
  }

  return inferResponseKindFromPrompt(annotation?.prompt ?? "");
}

function inferAnnotationVersionResponseKind(version: {
  prompt: string;
  responseKind?: AiAnnotationResponseKind;
}) {
  return version.responseKind ?? inferResponseKindFromPrompt(version.prompt);
}

function getAiResponseHeading(kind: AiAnnotationResponseKind) {
  return kind === "summary" ? "Summary" : "Explanation";
}

function sortAnnotationsNewestFirst(annotations: AiAnnotation[]) {
  return [...annotations].sort(
    (first, second) =>
      new Date(second.createdAt).getTime() - new Date(first.createdAt).getTime()
  );
}

function getAnnotationTargets(annotation: AiAnnotation): AnnotationTarget[] {
  return annotation.targets?.length
    ? annotation.targets
    : annotation.target
      ? [annotation.target]
      : [];
}

function getLatestAnnotationVersionForKind(
  annotation: AiAnnotation,
  kind: AiAnnotationResponseKind
) {
  return [...(annotation.versions ?? [])]
    .sort(
      (first, second) =>
        new Date(second.createdAt).getTime() -
        new Date(first.createdAt).getTime()
    )
    .find((version) => inferAnnotationVersionResponseKind(version) === kind);
}

function normalizeFollowUpPrompt(prompt: string) {
  return prompt.trim().toLowerCase();
}

function mergeFollowUpExplanations(
  primary: AiExplanationContent,
  fallback?: AiExplanationContent | null
): AiExplanationContent {
  const mergedFollowUps = new Map<
    string,
    NonNullable<AiExplanationContent["followUpExplanations"]>[number]
  >();

  for (const followUp of fallback?.followUpExplanations ?? []) {
    const key = normalizeFollowUpPrompt(followUp.prompt);

    if (key) {
      mergedFollowUps.set(key, followUp);
    }
  }

  for (const followUp of primary.followUpExplanations ?? []) {
    const key = normalizeFollowUpPrompt(followUp.prompt);

    if (key) {
      mergedFollowUps.set(key, followUp);
    }
  }

  if (mergedFollowUps.size === 0) {
    return primary;
  }

  return {
    ...primary,
    followUpExplanations: Array.from(mergedFollowUps.values()),
  };
}

function getAnnotationResponseContent(
  annotation: AiAnnotation | null,
  kind: AiAnnotationResponseKind
): AiExplanationContent | null {
  if (!annotation) {
    return null;
  }

  if (kind === "summary") {
    const summaryVersion = getLatestAnnotationVersionForKind(
      annotation,
      "summary"
    );

    if (annotation.summary?.mainExplanation?.trim()) {
      return mergeFollowUpExplanations(
        annotation.summary,
        summaryVersion?.explanation
      );
    }

    if (summaryVersion) {
      return mergeFollowUpExplanations(
        summaryVersion.explanation,
        annotation.summary
      );
    }

    return inferAnnotationResponseKind(annotation) === "summary"
      ? annotation.explanation
      : null;
  }

  const explanationVersion = getLatestAnnotationVersionForKind(
    annotation,
    "explanation"
  );

  if (explanationVersion) {
    return mergeFollowUpExplanations(
      explanationVersion.explanation,
      annotation.explanation
    );
  }

  return inferAnnotationResponseKind(annotation) === "summary"
    ? null
    : annotation.explanation;
}

function getAnnotationMainExplanation(
  annotation: AiAnnotation,
  kind: AiAnnotationResponseKind = inferAnnotationResponseKind(annotation)
) {
  return (
    getAnnotationResponseContent(annotation, kind)?.mainExplanation ||
    annotation.response
  );
}

function formatAiResponseContentForConversation(
  kind: AiAnnotationResponseKind,
  content: AiExplanationContent
) {
  const label = kind === "summary" ? "Summary part" : "Explanation part";
  const sections: string[] = [];
  const mainText = content.mainExplanation.trim();

  if (mainText) {
    sections.push(`${label}:\n${mainText}`);
  }

  const savedFollowUpsByPrompt = new Map<
    string,
    NonNullable<AiExplanationContent["followUpExplanations"]>[number]
  >();

  for (const followUp of content.followUpExplanations ?? []) {
    const promptKey = followUp.prompt.trim().toLowerCase();

    if (promptKey) {
      savedFollowUpsByPrompt.set(promptKey, followUp);
    }
  }

  const printedPrompts = new Set<string>();
  const followUpLines: string[] = [];

  for (const concept of content.relatedConcepts ?? []) {
    const promptText = concept.trim();

    if (!promptText) {
      continue;
    }

    const promptKey = promptText.toLowerCase();
    printedPrompts.add(promptKey);
    followUpLines.push(`- Follow-up question: ${promptText}`);

    const savedFollowUp = savedFollowUpsByPrompt.get(promptKey);
    const savedResponse = savedFollowUp?.response?.trim();

    if (savedResponse) {
      followUpLines.push(`  Saved follow-up explanation: ${savedResponse}`);
    }
  }

  for (const followUp of content.followUpExplanations ?? []) {
    const promptText = followUp.prompt.trim();

    if (!promptText) {
      continue;
    }

    const promptKey = promptText.toLowerCase();

    if (printedPrompts.has(promptKey)) {
      continue;
    }

    followUpLines.push(`- Follow-up question: ${promptText}`);

    const savedResponse = followUp.response?.trim();

    if (savedResponse) {
      followUpLines.push(`  Saved follow-up explanation: ${savedResponse}`);
    }
  }

  if (followUpLines.length > 0) {
    sections.push(`${label} follow-ups:\n${followUpLines.join("\n")}`);
  }

  return sections.join("\n\n");
}

function formatAnnotationForConversation(annotation: AiAnnotation) {
  const sections = (["summary", "explanation"] as AiAnnotationResponseKind[])
    .map((kind) => {
      const content = getAnnotationResponseContent(annotation, kind);

      return content?.mainExplanation?.trim()
        ? formatAiResponseContentForConversation(kind, content)
        : "";
    })
    .filter(Boolean);

  return sections.length > 0 ? sections.join("\n\n") : null;
}

function getAnnotationPromptForKind(
  annotation: AiAnnotation,
  kind: AiAnnotationResponseKind
) {
  return (
    getLatestAnnotationVersionForKind(annotation, kind)?.prompt ||
    (inferAnnotationResponseKind(annotation) === kind ? annotation.prompt : "") ||
    annotation.prompt
  );
}

function setAnnotationResponseContent(
  annotation: AiAnnotation,
  kind: AiAnnotationResponseKind,
  content: AiExplanationContent
): AiAnnotation {
  const latestVersionId = getLatestAnnotationVersionForKind(annotation, kind)?.id;
  const versions = latestVersionId
    ? annotation.versions?.map((version) =>
        version.id === latestVersionId
          ? {
              ...version,
              response: content.mainExplanation,
              explanation: content,
            }
          : version
      )
    : annotation.versions;

  if (kind === "summary") {
    return {
      ...annotation,
      summary: content,
      versions,
    };
  }

  return {
    ...annotation,
    explanation: content,
    versions,
  };
}

function getAnnotationResponseSections(annotation: AiAnnotation | null) {
  if (!annotation) {
    return [];
  }

  return (["summary", "explanation"] as AiAnnotationResponseKind[])
    .map((kind) => ({
      kind,
      title: getAiResponseHeading(kind),
      content: getAnnotationResponseContent(annotation, kind),
    }))
    .filter(
      (
        section
      ): section is {
        kind: AiAnnotationResponseKind;
        title: string;
        content: AiExplanationContent;
      } => Boolean(section.content?.mainExplanation?.trim())
    );
}

function normalizeAiDisplayText(text: string | null | undefined) {
  return (text ?? "").trim();
}

function getCollapsedAiResponseSectionsForAnnotation(
  annotation: AiAnnotation | null
): Record<AiAnnotationResponseKind, boolean> {
  void annotation;

  return {
    summary: false,
    explanation: false,
  };
}

function getFollowUpStateKey(kind: AiAnnotationResponseKind, concept: string) {
  return `${kind}:${concept}`;
}

function getPrimaryAnnotationTarget(annotation: AiAnnotation | null) {
  return annotation ? getAnnotationTargets(annotation)[0] ?? null : null;
}

function annotationHasTarget(annotation: AiAnnotation, targetId: string) {
  return getAnnotationTargets(annotation).some((target) => target.id === targetId);
}

function getTargetDisplayName(target: AnnotationTarget | null) {
  if (!target) {
    return "Selected content";
  }

  if (target.type === "region") {
    return `Region on page ${target.pageNumber}`;
  }

  const cleaned = cleanTextForDisplay(target.text);

  return cleaned ? shortenTextForDisplay(cleaned, 54) : "Highlighted text";
}

function getAnnotationDisplayName(annotation: AiAnnotation | null) {
  const activeKind = inferAnnotationResponseKind(annotation);
  const name =
    getAnnotationResponseContent(annotation, activeKind)
      ?.annotationName?.trim() ||
    getAnnotationResponseContent(
      annotation,
      activeKind === "summary" ? "explanation" : "summary"
    )?.annotationName?.trim() ||
    getAnnotationResponseContent(annotation, "summary")?.annotationName?.trim();

  if (name) {
    return name;
  }

  const targets = annotation ? getAnnotationTargets(annotation) : [];

  if (targets.length > 1) {
    return `${targets.length} selected items`;
  }

  return getTargetDisplayName(targets[0] ?? null);
}

function getAnnotationVersionsForTarget(
  annotations: AiAnnotation[],
  target: AnnotationTarget | null
) {
  if (!target) {
    return [];
  }

  return sortAnnotationsNewestFirst(
    annotations.filter((annotation) => annotationHasTarget(annotation, target.id))
  );
}

function getNewestAnnotationForTargetId(
  annotations: AiAnnotation[],
  targetId: string
) {
  return sortAnnotationsNewestFirst(
    annotations.filter((annotation) => annotationHasTarget(annotation, targetId))
  )[0] ?? null;
}

function getNewestAnnotationForTargetSet(
  annotations: AiAnnotation[],
  targets: AnnotationTarget[]
) {
  if (targets.length === 0) {
    return null;
  }

  const selectionSignature = getTargetSignature(targets);

  return (
    sortAnnotationsNewestFirst(annotations).find(
      (annotation) =>
        getTargetSignature(getAnnotationTargets(annotation)) ===
        selectionSignature
    ) ?? null
  );
}

function getNewestAnnotationsByTarget(annotations: AiAnnotation[]) {
  const seenTargetIds = new Set<string>();
  const newestAnnotations: AiAnnotation[] = [];

  for (const annotation of sortAnnotationsNewestFirst(annotations)) {
    const firstUnseenTarget = getAnnotationTargets(annotation).find(
      (target) => !seenTargetIds.has(target.id)
    );

    if (!firstUnseenTarget) {
      continue;
    }

    getAnnotationTargets(annotation).forEach((target) => {
      seenTargetIds.add(target.id);
    });
    newestAnnotations.push(annotation);
  }

  return newestAnnotations;
}

function getTargetSignature(targets: AnnotationTarget[]) {
  return targets.map((target) => target.id).sort().join("|");
}

function getUniqueTargetsById(targets: AnnotationTarget[]) {
  const seenTargetIds = new Set<string>();
  const uniqueTargets: AnnotationTarget[] = [];

  for (const target of targets) {
    if (seenTargetIds.has(target.id)) {
      continue;
    }

    seenTargetIds.add(target.id);
    uniqueTargets.push(target);
  }

  return uniqueTargets;
}

function getAnnotationContainingTargets(
  annotations: AiAnnotation[],
  targets: AnnotationTarget[]
) {
  const targetIds = targets.map((target) => target.id);

  if (targetIds.length === 0) {
    return null;
  }

  return (
    sortAnnotationsNewestFirst(annotations).find((annotation) =>
      targetIds.every((targetId) => annotationHasTarget(annotation, targetId))
    ) ?? null
  );
}

function getFollowUpResponse(
  annotation: AiAnnotation | null,
  concept: string,
  kind: AiAnnotationResponseKind
) {
  const conceptKey = normalizeFollowUpPrompt(concept);
  const followUps =
    getAnnotationResponseContent(annotation, kind)?.followUpExplanations ?? [];
  const savedFollowUp = [...followUps]
    .reverse()
    .find(
      (followUp) =>
        normalizeFollowUpPrompt(followUp.prompt) === conceptKey &&
        Boolean(followUp.response?.trim())
    );

  return savedFollowUp?.response ?? "";
}

function sortConversationsNewestFirst(conversations: QuestionConversation[]) {
  return [...conversations].sort(
    (first, second) =>
      new Date(second.updatedAt).getTime() - new Date(first.updatedAt).getTime()
  );
}

function LoadingDots({
  label = "Generating explanation...",
}: {
  label?: string;
}) {
  return (
    <div className="flex items-center gap-2 text-sm text-slate-500">
      <div className="h-4 w-4 animate-spin rounded-full border-2 border-slate-300 border-t-slate-900" />
      <span>{label}</span>
    </div>
  );
}

function getAiExplanationEmptyMessage(selection: AnnotationTarget | null) {
  if (selection?.type === "text") {
    return "Click Explain selection to explain the highlighted text.";
  }

  if (selection?.type === "region") {
    return "Click Explain selection to explain the selected region.";
  }

  return "Select text or a region, then click Explain selection.";
}

const PDF_ZOOM_MIN = 0.5;
const PDF_ZOOM_MAX = 1.6;
const PDF_ZOOM_STEP = 0.1;
const PDF_BOOKMARK_STORAGE_PREFIX = "novicereader:pdf-bookmarks:v1";
const PDF_BOOKMARK_LOCAL_RAIL_FALLBACK_LEFT_PX = 24;
const PDF_BOOKMARK_LOCAL_RAIL_GLOBAL_GAP_PX = 12;
const PDF_BOOKMARK_LOCAL_RAIL_RIGHT_PADDING_PX = 24;
const GUIDE_DEMO_REGION_IMAGE_SRC = "/guide/demo-region.png";
const GUIDE_DEMO_CREATED_AT = "2026-01-01T00:00:00.000Z";
const GUIDE_DEMO_TEXT =
  "The model repeatedly updates a hidden state so it can spend more reasoning effort before producing the answer.";
const GUIDE_DEMO_EXPLANATION =
  "This means the paper is saying the model can do extra internal work before answering. Instead of only writing a longer response, it repeats an internal update step so the hidden state can gradually become more useful for the final answer.";
const GUIDE_DEMO_REGION_EXPLANATION =
  "This is a demo region annotation. For figures, equations, or tables, NoviceReader can keep the cropped area as the selected context so you can ask for an explanation or ask AI a more specific question about it.";
const GUIDE_DEMO_FOLLOW_UP_POINTS = [
  "What is a hidden state?",
  "Why can more tokens increase reasoning compute?",
  "What is a recurrent step?",
];
const GUIDE_DEMO_REGION_FOLLOW_UP_POINTS = [
  "How should I read this selected region?",
  "What details matter in a figure or equation?",
];
const GUIDE_DEMO_TEXT_TARGET: TextAnnotationTarget = {
  type: "text",
  id: "guide-demo-text-target",
  text: GUIDE_DEMO_TEXT,
  chunks: [
    {
      id: "guide-demo-text-chunk",
      pageNumber: 1,
      text: GUIDE_DEMO_TEXT,
      rect: {
        pageNumber: 1,
        x: 0.16,
        y: 0.18,
        width: 0.58,
        height: 0.035,
      },
    },
  ],
  createdAt: GUIDE_DEMO_CREATED_AT,
};
const GUIDE_DEMO_REGION_TARGET: RegionAnnotationTarget = {
  type: "region",
  id: "guide-demo-region-target",
  pageNumber: 1,
  rect: {
    x: 0.18,
    y: 0.28,
    width: 0.42,
    height: 0.18,
  },
  imageDataUrl: GUIDE_DEMO_REGION_IMAGE_SRC,
  createdAt: GUIDE_DEMO_CREATED_AT,
};

function clampPdfZoom(zoom: number) {
  return Math.min(Math.max(zoom, PDF_ZOOM_MIN), PDF_ZOOM_MAX);
}

function clampBookmarkRatio(ratio: number) {
  return Math.min(Math.max(ratio, 0), 1);
}

function clampPdfBookmarkLocalRailLeft(
  left: number,
  scrollContainer: HTMLElement,
  globalRail: HTMLElement | null
) {
  const scrollContainerRect = scrollContainer.getBoundingClientRect();
  const globalRailRect = globalRail?.getBoundingClientRect();
  const globalRailContentLeft = globalRailRect
    ? scrollContainer.scrollLeft +
      globalRailRect.left +
      globalRailRect.width / 2 -
      scrollContainerRect.left
    : 0;
  const minLeft = Math.max(
    PDF_BOOKMARK_LOCAL_RAIL_FALLBACK_LEFT_PX,
    globalRailContentLeft + PDF_BOOKMARK_LOCAL_RAIL_GLOBAL_GAP_PX
  );
  const maxLeft = Math.max(
    scrollContainer.scrollWidth - PDF_BOOKMARK_LOCAL_RAIL_RIGHT_PADDING_PX,
    minLeft
  );

  return Math.min(Math.max(left, minLeft), maxLeft);
}

function getPdfBookmarkLocalRailLeft(
  scrollContainer: HTMLElement,
  contentElement: HTMLElement | null,
  globalRail: HTMLElement | null
) {
  const pageElement = contentElement?.querySelector<HTMLElement>(
    "[data-page-number]"
  );
  const scrollContainerRect = scrollContainer.getBoundingClientRect();
  const pageRect = pageElement?.getBoundingClientRect();
  const pageEdgeLeft = pageRect
    ? scrollContainer.scrollLeft + pageRect.left - scrollContainerRect.left
    : PDF_BOOKMARK_LOCAL_RAIL_FALLBACK_LEFT_PX;

  return clampPdfBookmarkLocalRailLeft(
    pageEdgeLeft,
    scrollContainer,
    globalRail
  );
}

function easeOutBookmarkScroll(progress: number) {
  return 1 - Math.pow(1 - progress, 3);
}

function getFastBookmarkScrollDuration(distance: number) {
  return Math.min(Math.max(distance / 10, 70), 150);
}

function getPdfBookmarkStorageKey({
  paper,
  isGuest,
  isLocal,
}: {
  paper: PaperWithUrls;
  isGuest: boolean;
  isLocal: boolean;
}) {
  const scope = isGuest ? "guest" : isLocal ? "local" : paper.userId;

  return `${PDF_BOOKMARK_STORAGE_PREFIX}:${scope}:${paper.id}`;
}

function parseStoredPdfBookmarks(rawBookmarks: string | null) {
  if (!rawBookmarks) {
    return [];
  }

  try {
    const parsed = JSON.parse(rawBookmarks);

    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed
      .map((bookmark): ReaderBookmark | null => {
        if (
          !bookmark ||
          typeof bookmark.id !== "string" ||
          typeof bookmark.ratio !== "number" ||
          typeof bookmark.createdAt !== "string" ||
          !Number.isFinite(bookmark.ratio)
        ) {
          return null;
        }

        return {
          id: bookmark.id,
          ratio: clampBookmarkRatio(bookmark.ratio),
          createdAt: bookmark.createdAt,
        };
      })
      .filter((bookmark): bookmark is ReaderBookmark => bookmark !== null);
  } catch {
    return [];
  }
}

function copyPdfBookmarks(bookmarks: ReaderBookmark[]) {
  return bookmarks.map((bookmark) => ({ ...bookmark }));
}

function getPdfBookmarkSignature(bookmarks: ReaderBookmark[]) {
  return bookmarks
    .map((bookmark) => `${bookmark.id}:${bookmark.ratio}:${bookmark.createdAt}`)
    .join("|");
}

function isGuideDemoAnnotation(annotation: AiAnnotation | null) {
  return Boolean(annotation?.id.startsWith("guide-demo-annotation"));
}

function buildGuideDemoAnnotation(
  paper: PaperWithUrls,
  target: AnnotationTarget,
  kind: "text" | "region"
): AiAnnotation {
  const isTextDemo = kind === "text";
  const mainExplanation = isTextDemo
    ? GUIDE_DEMO_EXPLANATION
    : GUIDE_DEMO_REGION_EXPLANATION;

  return {
    id: `guide-demo-annotation-${kind}`,
    paperId: paper.id,
    userId: paper.userId,
    target,
    prompt: "Demo guide annotation",
    response: mainExplanation,
    explanation: {
      mainExplanation,
      annotationName: isTextDemo
        ? "Hidden state reasoning"
        : "Demo region annotation",
      knowledgePoints: [],
      followUpConversation: [],
      relatedConcepts: isTextDemo
        ? GUIDE_DEMO_FOLLOW_UP_POINTS
        : GUIDE_DEMO_REGION_FOLLOW_UP_POINTS,
      followUpExplanations: [],
    },
    createdAt: GUIDE_DEMO_CREATED_AT,
  };
}

export default function ReaderPage() {
  const params = useParams<{ paperId: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const paperId = params.paperId;
  const requestedPaperSource = searchParams.get("source");
  const pdfScrollContainerRef = useRef<HTMLElement | null>(null);
  const pdfBookmarkGlobalRailRef = useRef<HTMLDivElement | null>(null);
  const pdfBookmarkContentRef = useRef<HTMLDivElement | null>(null);
  const pdfZoomCommitTimeoutRef = useRef<number | null>(null);
  const pdfGestureStartZoomRef = useRef(1);
  const pdfVisualZoomRef = useRef(1);
  const historyHoverScrollPositionRef = useRef<{
    left: number;
    top: number;
    visualZoom: number;
  } | null>(null);
  const bookmarkHoverScrollPositionRef = useRef<{
    left: number;
    top: number;
    visualZoom: number;
  } | null>(null);
  const pdfBookmarkScrollAnimationRef = useRef<number | null>(null);
  const pdfCursorBookmarkPositionRef = useRef<{
    ratio: number;
  } | null>(null);
  const pdfBookmarkPlacementPointerYRef = useRef<number | null>(null);
  const selectionPreviewCloseTimeoutRef = useRef<number | null>(null);
  const multiselectToastTimeoutRef = useRef<number | null>(null);
  const isShiftMultiselectKeyDownRef = useRef(false);
  const previewedSelectionTargetIdRef = useRef<string | null>(null);
  const targetRevealNonceRef = useRef(0);
  const readerGuideTimersRef = useRef<number[]>([]);
  const readerProfileMenuRef = useRef<HTMLDivElement | null>(null);
  const readerGuideSnapshotRef = useRef<{
    selectionTool: SelectionTool;
    rightPanelView: "annotations" | "history";
    currentSelection: AnnotationTarget | null;
    selectedTargets: AnnotationTarget[];
    selectedAnnotation: AiAnnotation | null;
    selectionExpanded: boolean;
    selectionHistory: SelectionSnapshot[];
    selectionFuture: SelectionSnapshot[];
    overlappingTargetIds: string[];
    prompt: string;
    promptFocused: boolean;
    aiResponse: string;
    aiResponseKind: AiAnnotationResponseKind;
    collapsedAiResponseSections: Record<AiAnnotationResponseKind, boolean>;
    activeFollowUpConcept: string;
    expandedFollowUpConcepts: Record<string, boolean>;
    followUpErrors: Record<string, string>;
    relatedConversationsExpanded: boolean;
    activeConversation: QuestionConversation | null;
    questionTurns: QuestionAnswerTurn[];
  } | null>(null);

  const [paper, setPaper] = useState<PaperWithUrls | null>(null);
  const [isGuestMode, setIsGuestMode] = useState(false);
  const [isLocalPaper, setIsLocalPaper] = useState(false);
  const [readerProfileRecords, setReaderProfileRecords] = useState<
    LocalKnowledgeProfileRecord[]
  >([]);
  const [selectedReaderProfileId, setSelectedReaderProfileId] =
    useState<string>("");
  const [selectedReaderKnowledgeProfile, setSelectedReaderKnowledgeProfile] =
    useState<UserKnowledgeProfile>(DEFAULT_KNOWLEDGE_PROFILE);
  const [isReaderProfileMenuOpen, setIsReaderProfileMenuOpen] = useState(false);
  const [isReaderProfilePresetPickerOpen, setIsReaderProfilePresetPickerOpen] =
    useState(false);
  const [readerProfilePresetSearch, setReaderProfilePresetSearch] =
    useState("");
  const [readerProfileDialogMode, setReaderProfileDialogMode] =
    useState<ReaderProfileDialogMode | null>(null);
  const [readerProfileDialogProfileId, setReaderProfileDialogProfileId] =
    useState<string | null>(null);
  const [readerProfileDialogName, setReaderProfileDialogName] =
    useState(DEFAULT_KNOWLEDGE_PROFILE_NAME);
  const [readerProfileDialogForm, setReaderProfileDialogForm] =
    useState<ReaderProfileForm>(() =>
      getReaderProfileForm(DEFAULT_KNOWLEDGE_PROFILE)
    );
  const [readerProfileDialogError, setReaderProfileDialogError] = useState("");
  const [isSavingReaderProfile, setIsSavingReaderProfile] = useState(false);
  const [isDeletingReaderProfile, setIsDeletingReaderProfile] = useState(false);
  const [annotations, setAnnotations] = useState<AiAnnotation[]>([]);
  const [pdfCurrentPage, setPdfCurrentPage] = useState(1);
  const [pdfNumPages, setPdfNumPages] = useState(0);
  const [pdfZoom, setPdfZoom] = useState(1);
  const [pdfVisualZoom, setPdfVisualZoom] = useState(1);
  const [pdfBookmarks, setPdfBookmarks] = useState<ReaderBookmark[]>([]);
  const [previewedPdfBookmarkId, setPreviewedPdfBookmarkId] =
    useState<string | null>(null);
  const [isPdfBookmarkPlacementActive, setIsPdfBookmarkPlacementActive] =
    useState(false);
  const [pdfBookmarkPlacementLineTop, setPdfBookmarkPlacementLineTop] =
    useState<number | null>(null);
  const [pdfBookmarkDocumentHeight, setPdfBookmarkDocumentHeight] =
    useState(0);
  const [pdfBookmarkLocalRailLeft, setPdfBookmarkLocalRailLeft] = useState(
    PDF_BOOKMARK_LOCAL_RAIL_FALLBACK_LEFT_PX
  );
  const [loadedPdfBookmarkStorageKey, setLoadedPdfBookmarkStorageKey] =
    useState("");
  const [targetToReveal, setTargetToReveal] = useState<{
    targetId: string;
    nonce: number;
    behavior?: ScrollBehavior;
    animation?: "fast";
    trackVisualPosition?: boolean;
  } | null>(null);

  const [selectionTool, setSelectionTool] = useState<SelectionTool>("highlight");
  const [rightPanelView, setRightPanelView] = useState<
    "annotations" | "history"
  >("annotations");
  const [currentSelection, setCurrentSelection] =
    useState<AnnotationTarget | null>(null);
  const [selectedTargets, setSelectedTargets] = useState<AnnotationTarget[]>([]);
  const [previewedSelectionTargetId, setPreviewedSelectionTargetId] =
    useState<string | null>(null);
  const [isMultiselectToastVisible, setIsMultiselectToastVisible] =
    useState(false);
  const [selectionHistory, setSelectionHistory] = useState<SelectionSnapshot[]>([]);
  const [selectionFuture, setSelectionFuture] = useState<SelectionSnapshot[]>([]);
 const [selectedAnnotation, setSelectedAnnotation] =
  useState<AiAnnotation | null>(null);

const [annotationToDelete, setAnnotationToDelete] =
  useState<AiAnnotation | null>(null);

const [isDeletingAnnotation, setIsDeletingAnnotation] = useState(false);   
  const [selectionExpanded, setSelectionExpanded] = useState(false);
  const [overlappingTargetIds, setOverlappingTargetIds] = useState<string[]>(
    []
  );

  const [prompt, setPrompt] = useState("");
  const [promptFocused, setPromptFocused] = useState(false);
  const [aiResponse, setAiResponse] = useState("");
  const [aiResponseKind, setAiResponseKind] =
    useState<AiAnnotationResponseKind>("explanation");
  const [collapsedAiResponseSections, setCollapsedAiResponseSections] =
    useState<Record<AiAnnotationResponseKind, boolean>>({
      explanation: false,
      summary: false,
    });

  const [isLoading, setIsLoading] = useState(true);
  const [isExplaining, setIsExplaining] = useState(false);
  const [isSummarizing, setIsSummarizing] = useState(false);
  const [isSavingAnnotation, setIsSavingAnnotation] = useState(false);
  const [isAskingQuestion, setIsAskingQuestion] = useState(false);
  const [questionTurns, setQuestionTurns] = useState<QuestionAnswerTurn[]>([]);
  const [activeConversation, setActiveConversation] =
    useState<QuestionConversation | null>(null);
  const [allConversations, setAllConversations] = useState<
    QuestionConversation[]
  >([]);
  const [collapsedConversationIds, setCollapsedConversationIds] = useState<
    Record<string, boolean>
  >({});
  const [historyAnnotationsExpanded, setHistoryAnnotationsExpanded] =
    useState(true);
  const [historyQuestionsExpanded, setHistoryQuestionsExpanded] =
    useState(true);
  const [relatedConversationsExpanded, setRelatedConversationsExpanded] =
    useState(false);
  const [activeFollowUpConcept, setActiveFollowUpConcept] = useState("");
  const [followUpErrors, setFollowUpErrors] = useState<Record<string, string>>(
    {}
  );
  const [expandedFollowUpConcepts, setExpandedFollowUpConcepts] = useState<
    Record<string, boolean>
  >({});
  const [error, setError] = useState("");
  const [isReaderGuideOpen, setIsReaderGuideOpen] = useState(false);
  const [guideDemoAnnotation, setGuideDemoAnnotation] =
    useState<AiAnnotation | null>(null);
  const [isGuideToolSwitchAnimating, setIsGuideToolSwitchAnimating] =
    useState(false);

useEffect(() => {
  document.title = paper
    ? cleanPaperTitleForDisplay(paper.originalFilename)
    : "Novice Reader";

  return () => {
    document.title = "Novice Reader";
  };
}, [paper]);

useEffect(() => {
  pdfVisualZoomRef.current = pdfVisualZoom;
}, [pdfVisualZoom]);

useEffect(() => {
  return () => {
    if (selectionPreviewCloseTimeoutRef.current !== null) {
      window.clearTimeout(selectionPreviewCloseTimeoutRef.current);
    }

    if (multiselectToastTimeoutRef.current !== null) {
      window.clearTimeout(multiselectToastTimeoutRef.current);
    }
  };
}, []);

useEffect(() => {
  function showShiftMultiselectToast(event: KeyboardEvent) {
    if (
      event.key !== "Shift" ||
      event.repeat ||
      isShiftMultiselectKeyDownRef.current ||
      isEditableShortcutTarget(event.target)
    ) {
      return;
    }

    isShiftMultiselectKeyDownRef.current = true;

    if (multiselectToastTimeoutRef.current !== null) {
      window.clearTimeout(multiselectToastTimeoutRef.current);
    }

    setIsMultiselectToastVisible(true);

    multiselectToastTimeoutRef.current = window.setTimeout(() => {
      multiselectToastTimeoutRef.current = null;
      setIsMultiselectToastVisible(false);
    }, 850);
  }

  function resetShiftMultiselectKey() {
    isShiftMultiselectKeyDownRef.current = false;
  }

  function handleShiftMultiselectKeyUp(event: KeyboardEvent) {
    if (event.key === "Shift") {
      resetShiftMultiselectKey();
    }
  }

  window.addEventListener("keydown", showShiftMultiselectToast);
  window.addEventListener("keyup", handleShiftMultiselectKeyUp);
  window.addEventListener("blur", resetShiftMultiselectKey);

  return () => {
    window.removeEventListener("keydown", showShiftMultiselectToast);
    window.removeEventListener("keyup", handleShiftMultiselectKeyUp);
    window.removeEventListener("blur", resetShiftMultiselectKey);
  };
}, []);

useEffect(() => {
  if (!paperId) {
    return;
  }

  const hasStoredAuthToken = Boolean(getStoredAuthToken());
  const hasGuestSession = isGuestSessionActive();
  const shouldLoadGuestPaper = requestedPaperSource === "guest";

  if (!hasStoredAuthToken && !hasGuestSession && !shouldLoadGuestPaper) {
    router.replace("/login");
    return;
  }

  async function loadPaperWorkspace() {
    try {
      setIsLoading(true);

      if (shouldLoadGuestPaper || (hasGuestSession && !hasStoredAuthToken)) {
        const loadedPaper = await getGuestPaper(paperId);
        const loadedAnnotations = await listGuestAnnotations(paperId);
        const loadedConversations = await listGuestConversations(paperId);

        setIsGuestMode(true);
        setIsLocalPaper(false);
        setPaper(loadedPaper);
        setAnnotations(loadedAnnotations);
        setAllConversations(loadedConversations);
        return;
      }

      if (isLocalPaperId(paperId)) {
        const loadedPaper = await getLocalPaper(paperId);
        const loadedAnnotations = await listLocalAnnotations(paperId);
        const loadedConversations = await listLocalConversations(paperId);

        setIsGuestMode(false);
        setIsLocalPaper(true);
        setPaper(loadedPaper);
        setAnnotations(loadedAnnotations);
        setAllConversations(loadedConversations);
        return;
      }

      setIsGuestMode(false);
      setIsLocalPaper(false);
      const loadedPaper = await getPaper(paperId);
      const loadedAnnotations = await listPaperAnnotations(paperId);
      const loadedConversations = await listPaperConversations(paperId);

      setPaper(loadedPaper);
      setAnnotations(loadedAnnotations);
      setAllConversations(loadedConversations);
    } catch (error) {
      console.error(error);
      setError("Failed to load this paper.");
    } finally {
      setIsLoading(false);
    }
  }

  loadPaperWorkspace();
}, [paperId, requestedPaperSource, router]);

useEffect(() => {
  if ((!isGuestMode && !isLocalPaper) || !paper) {
    return;
  }

  function warnBeforeLeaving(event: BeforeUnloadEvent) {
    event.preventDefault();
    event.returnValue = "";
  }

  window.addEventListener("beforeunload", warnBeforeLeaving);

  return () => {
    window.removeEventListener("beforeunload", warnBeforeLeaving);
  };
}, [isGuestMode, isLocalPaper, paper]);

useEffect(() => {
  let isActive = true;

  const frameId = window.requestAnimationFrame(() => {
    if (!isActive) {
      return;
    }

    if (!paper) {
      setPdfBookmarks([]);
      setLoadedPdfBookmarkStorageKey("");
      return;
    }

    const storageKey = getPdfBookmarkStorageKey({
      paper,
      isGuest: isGuestMode,
      isLocal: isLocalPaper,
    });

    try {
      setPdfBookmarks(
        parseStoredPdfBookmarks(window.localStorage.getItem(storageKey))
      );
    } catch {
      setPdfBookmarks([]);
    }

    setLoadedPdfBookmarkStorageKey(storageKey);
    bookmarkHoverScrollPositionRef.current = null;
    pdfCursorBookmarkPositionRef.current = null;
  });

  return () => {
    isActive = false;
    window.cancelAnimationFrame(frameId);
  };
}, [isGuestMode, isLocalPaper, paper]);

useEffect(() => {
  if (!loadedPdfBookmarkStorageKey) {
    return;
  }

  try {
    window.localStorage.setItem(
      loadedPdfBookmarkStorageKey,
      JSON.stringify(pdfBookmarks)
    );
  } catch (error) {
    console.error("Failed to save PDF bookmarks", error);
  }
}, [loadedPdfBookmarkStorageKey, pdfBookmarks]);

useEffect(() => {
  const scrollContainer = pdfScrollContainerRef.current;

  if (!scrollContainer) {
    setPdfBookmarkDocumentHeight(0);
    setPdfBookmarkLocalRailLeft(PDF_BOOKMARK_LOCAL_RAIL_FALLBACK_LEFT_PX);
    return;
  }

  const activeScrollContainer = scrollContainer;
  let animationFrame: number | null = null;
  const timeoutIds: number[] = [];

  function updateBookmarkDocumentHeight() {
    animationFrame = null;
    const nextHeight = Math.max(activeScrollContainer.scrollHeight, 0);
    const nextLocalRailLeft = getPdfBookmarkLocalRailLeft(
      activeScrollContainer,
      pdfBookmarkContentRef.current,
      pdfBookmarkGlobalRailRef.current
    );

    setPdfBookmarkDocumentHeight((currentHeight) =>
      Math.abs(currentHeight - nextHeight) < 1 ? currentHeight : nextHeight
    );
    setPdfBookmarkLocalRailLeft((currentLeft) =>
      Math.abs(currentLeft - nextLocalRailLeft) < 1
        ? currentLeft
        : nextLocalRailLeft
    );
  }

  function scheduleBookmarkDocumentHeightUpdate() {
    if (animationFrame !== null) {
      return;
    }

    animationFrame = window.requestAnimationFrame(updateBookmarkDocumentHeight);
  }

  scheduleBookmarkDocumentHeightUpdate();
  timeoutIds.push(
    window.setTimeout(scheduleBookmarkDocumentHeightUpdate, 120),
    window.setTimeout(scheduleBookmarkDocumentHeightUpdate, 500)
  );

  const resizeObserver =
    typeof ResizeObserver !== "undefined"
      ? new ResizeObserver(scheduleBookmarkDocumentHeightUpdate)
      : null;

  resizeObserver?.observe(activeScrollContainer);

  if (pdfBookmarkContentRef.current) {
    resizeObserver?.observe(pdfBookmarkContentRef.current);
  }

  window.addEventListener("resize", scheduleBookmarkDocumentHeightUpdate);

  return () => {
    if (animationFrame !== null) {
      window.cancelAnimationFrame(animationFrame);
    }

    timeoutIds.forEach((timeoutId) => window.clearTimeout(timeoutId));
    resizeObserver?.disconnect();
    window.removeEventListener("resize", scheduleBookmarkDocumentHeightUpdate);
  };
}, [paper?.id, pdfNumPages, pdfVisualZoom, pdfZoom]);

useEffect(() => {
  if (!paper) {
    return;
  }

  let isMounted = true;
  const activePaper = paper;
  const profileUserId = isGuestMode ? getGuestUserProfile().id : activePaper.userId;

  async function loadReaderProfiles() {
    const profileOwner = isGuestMode
      ? getGuestUserProfile()
      : {
          id: activePaper.userId,
          username:
            activePaper.userId === "local-user" ? "local" : activePaper.userId,
          displayName: "Local reader",
        };
    const profileRecords = await loadKnowledgeProfileRecordsForAccount({
      user: profileOwner,
      isGuest: isGuestMode,
    });
    const selectedProfileRecord = getLocalKnowledgeProfileRecord({
      userId: profileUserId,
      isGuest: isGuestMode,
    });

    if (!isMounted) {
      return;
    }

    setReaderProfileRecords(profileRecords);
    setSelectedReaderProfileId(selectedProfileRecord?.id ?? "");
    setSelectedReaderKnowledgeProfile(
      selectedProfileRecord?.knowledgeProfile ?? DEFAULT_KNOWLEDGE_PROFILE
    );
  }

  loadReaderProfiles().catch((error) => {
    console.error(error);
  });

  return () => {
    isMounted = false;
  };
}, [paper, isGuestMode]);

useEffect(() => {
  if (!isReaderProfileMenuOpen) {
    return;
  }

  function closeReaderProfileMenuForOutsidePointer(event: PointerEvent) {
    if (isEventTargetInsideElement(event.target, readerProfileMenuRef.current)) {
      return;
    }

    setIsReaderProfileMenuOpen(false);
  }

  function closeReaderProfileMenuForEscape(event: KeyboardEvent) {
    if (event.key === "Escape") {
      setIsReaderProfileMenuOpen(false);
    }
  }

  window.addEventListener("pointerdown", closeReaderProfileMenuForOutsidePointer);
  window.addEventListener("keydown", closeReaderProfileMenuForEscape);

  return () => {
    window.removeEventListener(
      "pointerdown",
      closeReaderProfileMenuForOutsidePointer
    );
    window.removeEventListener("keydown", closeReaderProfileMenuForEscape);
  };
}, [isReaderProfileMenuOpen]);

function clearPendingPdfZoomCommit() {
  if (pdfZoomCommitTimeoutRef.current === null) {
    return;
  }

  window.clearTimeout(pdfZoomCommitTimeoutRef.current);
  pdfZoomCommitTimeoutRef.current = null;
}

useEffect(() => {
  const scrollContainer = pdfScrollContainerRef.current;

  if (!scrollContainer) {
    return;
  }

  const activeScrollContainer = scrollContainer;

  function schedulePdfZoomCommit(nextZoom: number) {
    clearPendingPdfZoomCommit();

    pdfZoomCommitTimeoutRef.current = window.setTimeout(() => {
      setPdfZoom(nextZoom);
      pdfZoomCommitTimeoutRef.current = null;
    }, 180);
  }

  function setFastPdfZoom(nextZoom: number) {
    setPdfVisualZoom((currentZoom) => {
      const clampedNextZoom = clampPdfZoom(nextZoom);

      if (Math.abs(clampedNextZoom - currentZoom) < 0.001) {
        return currentZoom;
      }

      const zoomRatio = clampedNextZoom / currentZoom;
      const scrollContainerRect = activeScrollContainer.getBoundingClientRect();
      const pointerX = scrollContainerRect.width / 2;
      const pointerY = scrollContainerRect.height / 2;
      const contentX = activeScrollContainer.scrollLeft + pointerX;
      const contentY = activeScrollContainer.scrollTop + pointerY;

      window.requestAnimationFrame(() => {
        activeScrollContainer.scrollLeft = contentX * zoomRatio - pointerX;
        activeScrollContainer.scrollTop = contentY * zoomRatio - pointerY;
      });

      schedulePdfZoomCommit(clampedNextZoom);

      return clampedNextZoom;
    });
  }

  function handlePdfWheelZoom(event: globalThis.WheelEvent) {
    if (!event.ctrlKey && !event.metaKey) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();

    const scrollContainerRect = activeScrollContainer.getBoundingClientRect();
    const pointerX = event.clientX - scrollContainerRect.left;
    const pointerY = event.clientY - scrollContainerRect.top;
    const contentX = activeScrollContainer.scrollLeft + pointerX;
    const contentY = activeScrollContainer.scrollTop + pointerY;
    const boundedDeltaY = Math.max(Math.min(event.deltaY, 80), -80);

    setPdfVisualZoom((currentZoom) => {
      const nextZoom = clampPdfZoom(
        currentZoom * Math.exp(-boundedDeltaY * 0.003)
      );

      if (Math.abs(nextZoom - currentZoom) < 0.001) {
        return currentZoom;
      }

      const zoomRatio = nextZoom / currentZoom;

      window.requestAnimationFrame(() => {
        activeScrollContainer.scrollLeft = contentX * zoomRatio - pointerX;
        activeScrollContainer.scrollTop = contentY * zoomRatio - pointerY;
      });

      schedulePdfZoomCommit(nextZoom);

      return nextZoom;
    });
  }

  function handlePdfGestureStart(event: Event) {
    event.preventDefault();
    event.stopPropagation();
    pdfGestureStartZoomRef.current = pdfVisualZoomRef.current;
  }

  function handlePdfGestureChange(event: Event) {
    event.preventDefault();
    event.stopPropagation();

    const gestureScale = (event as Event & { scale?: number }).scale;

    if (typeof gestureScale !== "number") {
      return;
    }

    setFastPdfZoom(pdfGestureStartZoomRef.current * gestureScale);
  }

  activeScrollContainer.addEventListener("wheel", handlePdfWheelZoom, {
    capture: true,
    passive: false,
  });
  activeScrollContainer.addEventListener(
    "gesturestart",
    handlePdfGestureStart,
    {
      capture: true,
      passive: false,
    }
  );
  activeScrollContainer.addEventListener(
    "gesturechange",
    handlePdfGestureChange,
    {
      capture: true,
      passive: false,
    }
  );

  return () => {
    clearPendingPdfZoomCommit();
    activeScrollContainer.removeEventListener("wheel", handlePdfWheelZoom, true);
    activeScrollContainer.removeEventListener(
      "gesturestart",
      handlePdfGestureStart,
      true
    );
    activeScrollContainer.removeEventListener(
      "gesturechange",
      handlePdfGestureChange,
      true
    );
  };
}, [isLoading, paper?.fileUrl]);


const clearReaderGuideTimers = useCallback(() => {
  for (const timerId of readerGuideTimersRef.current) {
    window.clearTimeout(timerId);
  }

  readerGuideTimersRef.current = [];
}, []);

const queueReaderGuideTimer = useCallback(
  (callback: () => void, delayMs: number) => {
    const timerId = window.setTimeout(() => {
      readerGuideTimersRef.current = readerGuideTimersRef.current.filter(
        (queuedTimerId) => queuedTimerId !== timerId
      );
      callback();
    }, delayMs);

    readerGuideTimersRef.current.push(timerId);
  },
  []
);

useEffect(() => {
  return () => {
    clearReaderGuideTimers();
  };
}, [clearReaderGuideTimers]);

const revealGuideDemoTarget = useCallback((targetId: string) => {
  targetRevealNonceRef.current += 1;
  setTargetToReveal({
    targetId,
    nonce: targetRevealNonceRef.current,
    behavior: "smooth",
  });
}, []);

const closeReaderGuide = useCallback(() => {
  clearReaderGuideTimers();

  const snapshot = readerGuideSnapshotRef.current;

  if (snapshot) {
    setSelectionTool(snapshot.selectionTool);
    setRightPanelView(snapshot.rightPanelView);
    setCurrentSelection(snapshot.currentSelection);
    setSelectedTargets(snapshot.selectedTargets);
    setSelectedAnnotation(snapshot.selectedAnnotation);
    setSelectionExpanded(snapshot.selectionExpanded);
    setSelectionHistory(snapshot.selectionHistory);
    setSelectionFuture(snapshot.selectionFuture);
    setOverlappingTargetIds(snapshot.overlappingTargetIds);
    setPrompt(snapshot.prompt);
    setPromptFocused(snapshot.promptFocused);
    setAiResponse(snapshot.aiResponse);
    setAiResponseKind(snapshot.aiResponseKind);
    setCollapsedAiResponseSections(snapshot.collapsedAiResponseSections);
    setActiveFollowUpConcept(snapshot.activeFollowUpConcept);
    setExpandedFollowUpConcepts(snapshot.expandedFollowUpConcepts);
    setFollowUpErrors(snapshot.followUpErrors);
    setRelatedConversationsExpanded(snapshot.relatedConversationsExpanded);
    setActiveConversation(snapshot.activeConversation);
    setQuestionTurns(snapshot.questionTurns);
  }

  readerGuideSnapshotRef.current = null;
  setGuideDemoAnnotation(null);
  setIsGuideToolSwitchAnimating(false);
  previewedSelectionTargetIdRef.current = null;
  setPreviewedSelectionTargetId(null);
  if (multiselectToastTimeoutRef.current !== null) {
    window.clearTimeout(multiselectToastTimeoutRef.current);
    multiselectToastTimeoutRef.current = null;
  }
  setIsMultiselectToastVisible(false);
  setAnnotationToDelete(null);
  setTargetToReveal(null);
  setIsReaderGuideOpen(false);
}, [clearReaderGuideTimers]);

const handleReaderGuideStepChange = useCallback(
  (stepIndex: number) => {
    if (!paper) {
      return;
    }

    clearReaderGuideTimers();
    setRightPanelView("annotations");
    setAnnotationToDelete(null);
    setSelectionExpanded(false);
    setOverlappingTargetIds([]);
    setActiveFollowUpConcept("");
    setExpandedFollowUpConcepts({});
    setFollowUpErrors({});
    setRelatedConversationsExpanded(false);
    setActiveConversation(null);
    setQuestionTurns([]);
    setPrompt("");
    setPromptFocused(false);
    setIsGuideToolSwitchAnimating(false);
    setSelectionHistory([]);
    setSelectionFuture([]);
    previewedSelectionTargetIdRef.current = null;
    setPreviewedSelectionTargetId(null);
    setIsMultiselectToastVisible(false);

    const setGuideSelection = (
      targets: AnnotationTarget[],
      focusedTarget: AnnotationTarget | null,
      annotation: AiAnnotation | null = null
    ) => {
      const resolvedKind = inferAnnotationResponseKind(annotation);

      setGuideDemoAnnotation(annotation);
      setCurrentSelection(focusedTarget);
      setSelectedTargets(targets);
      setSelectedAnnotation(annotation);
      setAiResponseKind(resolvedKind);
      setCollapsedAiResponseSections(
        getCollapsedAiResponseSectionsForAnnotation(annotation)
      );
      setAiResponse(
        annotation ? getAnnotationMainExplanation(annotation, resolvedKind) : ""
      );
    };

    if (stepIndex === 0) {
      setSelectionTool("highlight");
      setGuideSelection([GUIDE_DEMO_TEXT_TARGET], GUIDE_DEMO_TEXT_TARGET);
      return;
    }

    if (stepIndex === 1) {
      setSelectionTool("highlight");
      setGuideSelection([GUIDE_DEMO_TEXT_TARGET], GUIDE_DEMO_TEXT_TARGET);
      setIsGuideToolSwitchAnimating(true);

      queueReaderGuideTimer(() => {
        setSelectionTool("region");
      }, 360);

      queueReaderGuideTimer(() => {
        setGuideSelection([GUIDE_DEMO_REGION_TARGET], GUIDE_DEMO_REGION_TARGET);
        revealGuideDemoTarget(GUIDE_DEMO_REGION_TARGET.id);
      }, 720);

      queueReaderGuideTimer(() => {
        setIsGuideToolSwitchAnimating(false);
      }, 1100);
      return;
    }

    if (stepIndex === 2) {
      setSelectionTool("highlight");
      setGuideSelection([GUIDE_DEMO_TEXT_TARGET], GUIDE_DEMO_TEXT_TARGET);
      return;
    }

    if (stepIndex === 3) {
      const demoAnnotation = buildGuideDemoAnnotation(
        paper,
        GUIDE_DEMO_REGION_TARGET,
        "region"
      );

      setSelectionTool("region");
      setGuideSelection(
        getAnnotationTargets(demoAnnotation),
        demoAnnotation.target,
        demoAnnotation
      );
      revealGuideDemoTarget(demoAnnotation.target.id);
      return;
    }

    if (stepIndex === 4) {
      const multiTargets = [GUIDE_DEMO_REGION_TARGET, GUIDE_DEMO_TEXT_TARGET];

      setSelectionTool("region");
      setGuideSelection(multiTargets, GUIDE_DEMO_TEXT_TARGET);
      setOverlappingTargetIds(multiTargets.map((target) => target.id));
      if (multiselectToastTimeoutRef.current !== null) {
        window.clearTimeout(multiselectToastTimeoutRef.current);
      }

      setIsMultiselectToastVisible(true);
      multiselectToastTimeoutRef.current = window.setTimeout(() => {
        multiselectToastTimeoutRef.current = null;
        setIsMultiselectToastVisible(false);
      }, 850);
      revealGuideDemoTarget(GUIDE_DEMO_REGION_TARGET.id);
      return;
    }

    if (stepIndex === 5) {
      const multiTargets = [GUIDE_DEMO_REGION_TARGET, GUIDE_DEMO_TEXT_TARGET];

      setSelectionTool("region");
      setGuideSelection(multiTargets, GUIDE_DEMO_TEXT_TARGET);
      setOverlappingTargetIds([GUIDE_DEMO_TEXT_TARGET.id]);
      previewedSelectionTargetIdRef.current = GUIDE_DEMO_TEXT_TARGET.id;
      setPreviewedSelectionTargetId(GUIDE_DEMO_TEXT_TARGET.id);
      return;
    }

    if (stepIndex === 6) {
      setSelectionTool("region");
      setGuideSelection([GUIDE_DEMO_REGION_TARGET], GUIDE_DEMO_REGION_TARGET);
      setOverlappingTargetIds([GUIDE_DEMO_REGION_TARGET.id]);
      setSelectionHistory([
        {
          targets: [GUIDE_DEMO_REGION_TARGET, GUIDE_DEMO_TEXT_TARGET],
          currentSelectionId: GUIDE_DEMO_TEXT_TARGET.id,
          selectedAnnotationId: null,
          bookmarks: copyPdfBookmarks(pdfBookmarks),
        },
      ]);
      return;
    }

    const demoAnnotation = buildGuideDemoAnnotation(
      paper,
      GUIDE_DEMO_REGION_TARGET,
      "region"
    );
    setSelectionTool("region");
    setGuideSelection(
      getAnnotationTargets(demoAnnotation),
      demoAnnotation.target,
      demoAnnotation
    );
    revealGuideDemoTarget(demoAnnotation.target.id);

    if (stepIndex === 7) {
      setPrompt("Why is this part important?");
      setPromptFocused(true);
    }
  },
  [
    clearReaderGuideTimers,
    paper,
    pdfBookmarks,
    queueReaderGuideTimer,
    revealGuideDemoTarget,
  ]
);

function createSelectionSnapshot(
  targets: AnnotationTarget[] = selectedTargets,
  focusedTarget: AnnotationTarget | null = currentSelection,
  annotation: AiAnnotation | null = selectedAnnotation,
  bookmarks: ReaderBookmark[] = pdfBookmarks
): SelectionSnapshot {
  return {
    targets,
    currentSelectionId: focusedTarget?.id ?? null,
    selectedAnnotationId: annotation?.id ?? null,
    bookmarks: copyPdfBookmarks(bookmarks),
  };
}

function getSelectionSnapshotSignature(snapshot: SelectionSnapshot) {
  return [
    getTargetSignature(snapshot.targets),
    snapshot.currentSelectionId ?? "",
    snapshot.selectedAnnotationId ?? "",
    getPdfBookmarkSignature(snapshot.bookmarks ?? []),
  ].join("::");
}

function rememberSelectionDisplayChange(
  nextTargets: AnnotationTarget[],
  focusedTarget?: AnnotationTarget | null,
  annotation?: AiAnnotation | null
) {
  const nextSnapshot = createSelectionSnapshot(
    nextTargets,
    focusedTarget ?? nextTargets[0] ?? null,
    annotation ?? null
  );
  const currentSnapshot = createSelectionSnapshot();

  if (
    getSelectionSnapshotSignature(currentSnapshot) ===
    getSelectionSnapshotSignature(nextSnapshot)
  ) {
    return;
  }

  setSelectionFuture([]);

  setSelectionHistory((current) => {
    const latestHistoryEntry = current[current.length - 1];

    if (
      latestHistoryEntry &&
      getSelectionSnapshotSignature(latestHistoryEntry) ===
        getSelectionSnapshotSignature(currentSnapshot)
    ) {
      return current;
    }

    return [...current, currentSnapshot];
  });
}

function rememberBookmarkDisplayChange(nextBookmarks: ReaderBookmark[]) {
  const currentSnapshot = createSelectionSnapshot();
  const nextSnapshot = createSelectionSnapshot(
    selectedTargets,
    currentSelection,
    selectedAnnotation,
    nextBookmarks
  );

  if (
    getSelectionSnapshotSignature(currentSnapshot) ===
    getSelectionSnapshotSignature(nextSnapshot)
  ) {
    return;
  }

  setSelectionFuture([]);

  setSelectionHistory((current) => {
    const latestHistoryEntry = current[current.length - 1];

    if (
      latestHistoryEntry &&
      getSelectionSnapshotSignature(latestHistoryEntry) ===
        getSelectionSnapshotSignature(currentSnapshot)
    ) {
      return current;
    }

    return [...current, currentSnapshot];
  });
}

function restoreHistoryAnnotationPreview() {
  const scrollContainer = pdfScrollContainerRef.current;
  const previousScrollPosition = historyHoverScrollPositionRef.current;

  setTargetToReveal(null);

  if (scrollContainer && previousScrollPosition !== null) {
    const zoomRatio =
      previousScrollPosition.visualZoom > 0
        ? pdfVisualZoomRef.current / previousScrollPosition.visualZoom
        : 1;

    scrollContainer.scrollTo({
      left: previousScrollPosition.left * zoomRatio,
      top: previousScrollPosition.top * zoomRatio,
      behavior: "auto",
    });
  }

  historyHoverScrollPositionRef.current = null;
}

function clearSelectionPreviewCloseTimer() {
  if (selectionPreviewCloseTimeoutRef.current === null) {
    return;
  }

  window.clearTimeout(selectionPreviewCloseTimeoutRef.current);
  selectionPreviewCloseTimeoutRef.current = null;
}

function closeSelectionPreviewNow() {
  clearSelectionPreviewCloseTimer();

  if (previewedSelectionTargetIdRef.current === null) {
    return;
  }

  previewedSelectionTargetIdRef.current = null;
  setPreviewedSelectionTargetId(null);
  restoreHistoryAnnotationPreview();
}

function setSelectionDisplayWithHistory(
  nextTargets: AnnotationTarget[],
  focusedTarget?: AnnotationTarget | null,
  annotation?: AiAnnotation | null
) {
  closeSelectionPreviewNow();

  const nextFocusedTarget =
    (focusedTarget
      ? nextTargets.find((target) => target.id === focusedTarget.id)
      : null) ??
    nextTargets[0] ??
    null;
  const resolvedAnnotation =
    annotation === undefined
      ? getNewestAnnotationForTargetSet(annotations, nextTargets)
      : annotation;
  const resolvedKind = inferAnnotationResponseKind(resolvedAnnotation);

  rememberSelectionDisplayChange(
    nextTargets,
    nextFocusedTarget,
    resolvedAnnotation
  );
  setSelectedTargets(nextTargets);
  setCurrentSelection(nextFocusedTarget);
  setSelectedAnnotation(resolvedAnnotation);
  setAiResponseKind(resolvedKind);
  setCollapsedAiResponseSections(
    getCollapsedAiResponseSectionsForAnnotation(resolvedAnnotation)
  );
  setSelectionExpanded(false);
  setOverlappingTargetIds([]);
  setActiveFollowUpConcept("");
  setExpandedFollowUpConcepts({});
  setFollowUpErrors({});
  setAiResponse(
    resolvedAnnotation
      ? getAnnotationMainExplanation(resolvedAnnotation, resolvedKind)
      : ""
  );
  setActiveConversation(null);
  setQuestionTurns([]);
}

function restoreSelectionSnapshot(snapshot: SelectionSnapshot) {
  closeSelectionPreviewNow();

  const focusedTarget =
    snapshot.targets.find(
      (target) => target.id === snapshot.currentSelectionId
    ) ??
    snapshot.targets[0] ??
    null;
  const exactAnnotation = snapshot.selectedAnnotationId
    ? annotations.find((annotation) => annotation.id === snapshot.selectedAnnotationId) ?? null
    : null;
  const exactSelectionAnnotation = getNewestAnnotationForTargetSet(
    annotations,
    snapshot.targets
  );
  const fallbackAnnotation =
    !exactAnnotation && !exactSelectionAnnotation && snapshot.selectedAnnotationId && focusedTarget
      ? getNewestAnnotationForTargetId(annotations, focusedTarget.id)
      : null;
  const restoredAnnotation =
    exactAnnotation ?? exactSelectionAnnotation ?? fallbackAnnotation;
  const restoredKind = inferAnnotationResponseKind(restoredAnnotation);

  setSelectedTargets(snapshot.targets);
  setCurrentSelection(focusedTarget);
  setSelectedAnnotation(restoredAnnotation);
  setPdfBookmarks(copyPdfBookmarks(snapshot.bookmarks ?? pdfBookmarks));
  setPreviewedPdfBookmarkId(null);
  bookmarkHoverScrollPositionRef.current = null;
  setAiResponseKind(restoredKind);
  setCollapsedAiResponseSections(
    getCollapsedAiResponseSectionsForAnnotation(restoredAnnotation)
  );
  setSelectionExpanded(false);
  setOverlappingTargetIds(focusedTarget ? [focusedTarget.id] : []);
  setActiveFollowUpConcept("");
  setExpandedFollowUpConcepts({});
  setFollowUpErrors({});
  setAiResponse(
    restoredAnnotation
      ? getAnnotationMainExplanation(restoredAnnotation, restoredKind)
      : ""
  );
  setActiveConversation(null);
  setQuestionTurns([]);
}

function revertSelectionChange() {
  const previousSnapshot = selectionHistory[selectionHistory.length - 1];

  if (!previousSnapshot) {
    return;
  }

  const currentSnapshot = createSelectionSnapshot();

  restoreSelectionSnapshot(previousSnapshot);
  setSelectionHistory((current) => current.slice(0, -1));
  setSelectionFuture((current) => [...current, currentSnapshot]);
}

function restoreForwardSelectionChange() {
  const nextSnapshot = selectionFuture[selectionFuture.length - 1];

  if (!nextSnapshot) {
    return;
  }

  const currentSnapshot = createSelectionSnapshot();

  restoreSelectionSnapshot(nextSnapshot);
  setSelectionFuture((current) => current.slice(0, -1));
  setSelectionHistory((current) => [...current, currentSnapshot]);
}

useEffect(() => {
  function handleSelectionHistoryShortcut(event: KeyboardEvent) {
    const key = event.key.toLowerCase();
    const canUndo = key === "z" && selectionHistory.length > 0;
    const canRedo = key === "y" && selectionFuture.length > 0;

    if (
      event.defaultPrevented ||
      event.altKey ||
      event.shiftKey ||
      !(event.metaKey || event.ctrlKey) ||
      isEditableShortcutTarget(event.target) ||
      (!canUndo && !canRedo)
    ) {
      return;
    }

    event.preventDefault();

    if (canUndo) {
      revertSelectionChange();
      return;
    }

    restoreForwardSelectionChange();
  }

  window.addEventListener("keydown", handleSelectionHistoryShortcut);

  return () => {
    window.removeEventListener("keydown", handleSelectionHistoryShortcut);
  };
}, [selectionHistory, selectionFuture, annotations]);

function selectTargetFromSelectionBox(target: AnnotationTarget) {
  closeSelectionPreviewNow();
  const matchingAnnotation =
    getNewestAnnotationForTargetSet(annotations, selectedTargets) ??
    (selectedAnnotation &&
    getTargetSignature(getAnnotationTargets(selectedAnnotation)) ===
      getTargetSignature(selectedTargets)
      ? selectedAnnotation
      : null);
  const responseKind = inferAnnotationResponseKind(matchingAnnotation);

  rememberSelectionDisplayChange(selectedTargets, target, matchingAnnotation);
  setCurrentSelection(target);
  setSelectedAnnotation(matchingAnnotation);
  setAiResponseKind(responseKind);
  setAiResponse(
    matchingAnnotation
      ? getAnnotationMainExplanation(matchingAnnotation, responseKind)
      : ""
  );
  setOverlappingTargetIds([target.id]);
}

function removeTargetFromSelectionBox(targetId: string) {
  const nextTargets = selectedTargets.filter((target) => target.id !== targetId);
  const nextFocusedTarget =
    currentSelection && nextTargets.some((target) => target.id === currentSelection.id)
      ? currentSelection
      : nextTargets[0] ?? null;

  setSelectionDisplayWithHistory(
    nextTargets,
    nextFocusedTarget
  );
}

function startReaderGuide() {
  readerGuideSnapshotRef.current = {
    selectionTool,
    rightPanelView,
    currentSelection,
    selectedTargets,
    selectedAnnotation,
    selectionExpanded,
    selectionHistory,
    selectionFuture,
    overlappingTargetIds,
    prompt,
    promptFocused,
    aiResponse,
    aiResponseKind,
    collapsedAiResponseSections,
    activeFollowUpConcept,
    expandedFollowUpConcepts,
    followUpErrors,
    relatedConversationsExpanded,
    activeConversation,
    questionTurns,
  };
  setRightPanelView("annotations");
  setIsReaderGuideOpen(true);
}

function requestDeleteSelectedAnnotation() {
  if (!selectedAnnotation) {
    return;
  }

  if (isGuideDemoAnnotation(selectedAnnotation)) {
    closeReaderGuide();
    return;
  }

  setAnnotationToDelete(selectedAnnotation);
}

function clearSelection() {
  setSelectionDisplayWithHistory([]);
  setAnnotationToDelete(null);
  setRelatedConversationsExpanded(false);
}

function setCommittedPdfZoom(nextZoom: number) {
  const clampedNextZoom = clampPdfZoom(nextZoom);

  clearPendingPdfZoomCommit();
  setPdfZoom(clampedNextZoom);
  setPdfVisualZoom(clampedNextZoom);
}

function zoomPdfIn() {
  setCommittedPdfZoom(pdfVisualZoom + PDF_ZOOM_STEP);
}

function zoomPdfOut() {
  setCommittedPdfZoom(pdfVisualZoom - PDF_ZOOM_STEP);
}

function resetPdfZoom() {
  setCommittedPdfZoom(1);
}

function getPdfBookmarkRatioFromPointer(event: MouseEvent<HTMLElement>) {
  const scrollContainer = pdfScrollContainerRef.current;

  if (!scrollContainer || scrollContainer.scrollHeight <= 0) {
    return null;
  }

  const scrollContainerRect = scrollContainer.getBoundingClientRect();
  const pointerY = Math.min(
    Math.max(event.clientY - scrollContainerRect.top, 0),
    scrollContainer.clientHeight
  );
  const contentY = scrollContainer.scrollTop + pointerY;

  return clampBookmarkRatio(contentY / scrollContainer.scrollHeight);
}

function getPdfBookmarkPointerY(event: MouseEvent<HTMLElement>) {
  const scrollContainer = pdfScrollContainerRef.current;

  if (!scrollContainer) {
    return null;
  }

  const scrollContainerRect = scrollContainer.getBoundingClientRect();

  return Math.min(
    Math.max(event.clientY - scrollContainerRect.top, 0),
    scrollContainer.clientHeight
  );
}

function rememberPdfCursorBookmarkPosition(event: MouseEvent<HTMLElement>) {
  const ratio = getPdfBookmarkRatioFromPointer(event);

  if (ratio === null) {
    return;
  }

  pdfBookmarkPlacementPointerYRef.current = getPdfBookmarkPointerY(event);
  pdfCursorBookmarkPositionRef.current = {
    ratio,
  };

  if (isPdfBookmarkPlacementActive) {
    setPdfBookmarkPlacementLineTop(getPdfBookmarkLineTop(ratio));
  }
}

function getCurrentPdfBookmarkRatio() {
  const scrollContainer = pdfScrollContainerRef.current;
  const cursorPosition = pdfCursorBookmarkPositionRef.current;

  if (cursorPosition) {
    return cursorPosition.ratio;
  }

  if (!scrollContainer || scrollContainer.scrollHeight <= 0) {
    return 0;
  }

  const contentY = scrollContainer.scrollTop + scrollContainer.clientHeight * 0.45;

  return clampBookmarkRatio(contentY / scrollContainer.scrollHeight);
}

function getPdfBookmarkLineTop(bookmarkRatio: number) {
  const scrollContainer = pdfScrollContainerRef.current;

  if (!scrollContainer) {
    return 0;
  }

  return clampBookmarkRatio(bookmarkRatio) * scrollContainer.scrollHeight;
}

function getPdfBookmarkScrollTop(bookmarkRatio: number) {
  const scrollContainer = pdfScrollContainerRef.current;

  if (!scrollContainer) {
    return 0;
  }

  const maxTop = Math.max(
    scrollContainer.scrollHeight - scrollContainer.clientHeight,
    0
  );
  const targetContentY = clampBookmarkRatio(bookmarkRatio) * scrollContainer.scrollHeight;

  return Math.min(
    Math.max(targetContentY - scrollContainer.clientHeight * 0.25, 0),
    maxTop
  );
}

function cancelPdfBookmarkScrollAnimation() {
  if (pdfBookmarkScrollAnimationRef.current === null) {
    return;
  }

  window.cancelAnimationFrame(pdfBookmarkScrollAnimationRef.current);
  pdfBookmarkScrollAnimationRef.current = null;
}

function scrollToPdfBookmark(bookmark: ReaderBookmark) {
  const scrollContainer = pdfScrollContainerRef.current;

  if (!scrollContainer) {
    return;
  }

  const activeScrollContainer = scrollContainer;

  cancelPdfBookmarkScrollAnimation();

  const startTop = activeScrollContainer.scrollTop;
  const nextTop = getPdfBookmarkScrollTop(bookmark.ratio);
  const deltaTop = nextTop - startTop;
  const distance = Math.abs(deltaTop);

  if (distance < 1) {
    return;
  }

  const duration = getFastBookmarkScrollDuration(distance);
  const startTime = window.performance.now();

  function animateBookmarkScroll(now: number) {
    const progress = Math.min(Math.max((now - startTime) / duration, 0), 1);
    const easedProgress = easeOutBookmarkScroll(progress);

    activeScrollContainer.scrollTop = startTop + deltaTop * easedProgress;

    if (progress < 1) {
      pdfBookmarkScrollAnimationRef.current = window.requestAnimationFrame(
        animateBookmarkScroll
      );
    } else {
      pdfBookmarkScrollAnimationRef.current = null;
    }
  }

  pdfBookmarkScrollAnimationRef.current = window.requestAnimationFrame(
    animateBookmarkScroll
  );
}

function addPdfBookmarkAtRatio(ratio: number) {
  const timestamp = new Date().toISOString();
  const nextBookmarks = [
    ...pdfBookmarks,
    {
      id: createId(),
      ratio: clampBookmarkRatio(ratio),
      createdAt: timestamp,
    },
  ].sort((first, second) => first.ratio - second.ratio);

  rememberBookmarkDisplayChange(nextBookmarks);
  setPdfBookmarks(nextBookmarks);
}

function startPdfBookmarkPlacement() {
  const ratio = getCurrentPdfBookmarkRatio();

  setIsPdfBookmarkPlacementActive(true);
  setPdfBookmarkPlacementLineTop(getPdfBookmarkLineTop(ratio));
}

function togglePdfBookmarkPlacement() {
  if (isPdfBookmarkPlacementActive) {
    cancelPdfBookmarkPlacement();
    return;
  }

  startPdfBookmarkPlacement();
}

function cancelPdfBookmarkPlacement() {
  setIsPdfBookmarkPlacementActive(false);
  setPdfBookmarkPlacementLineTop(null);
  pdfBookmarkPlacementPointerYRef.current = null;
}

function previewPdfBookmark(bookmark: ReaderBookmark) {
  const scrollContainer = pdfScrollContainerRef.current;

  if (!scrollContainer) {
    return;
  }

  if (bookmarkHoverScrollPositionRef.current === null) {
    bookmarkHoverScrollPositionRef.current = {
      left: scrollContainer.scrollLeft,
      top: scrollContainer.scrollTop,
      visualZoom: pdfVisualZoomRef.current,
    };
  }

  setPreviewedPdfBookmarkId(bookmark.id);
  scrollToPdfBookmark(bookmark);
}

function selectPdfBookmarkIcon(bookmarkId: string) {
  setPreviewedPdfBookmarkId(bookmarkId);
}

function clearSelectedPdfBookmarkIcon(bookmarkId: string) {
  setPreviewedPdfBookmarkId((currentId) =>
    currentId === bookmarkId ? null : currentId
  );
}

function restorePdfBookmarkPreview() {
  const scrollContainer = pdfScrollContainerRef.current;
  const previousScrollPosition = bookmarkHoverScrollPositionRef.current;

  if (scrollContainer && previousScrollPosition !== null) {
    cancelPdfBookmarkScrollAnimation();

    const zoomRatio =
      previousScrollPosition.visualZoom > 0
        ? pdfVisualZoomRef.current / previousScrollPosition.visualZoom
        : 1;

    scrollContainer.scrollTo({
      left: previousScrollPosition.left * zoomRatio,
      top: previousScrollPosition.top * zoomRatio,
      behavior: "auto",
    });
  }

  bookmarkHoverScrollPositionRef.current = null;
  setPreviewedPdfBookmarkId(null);
}

function jumpToPdfBookmark(bookmark: ReaderBookmark) {
  bookmarkHoverScrollPositionRef.current = null;
  setPreviewedPdfBookmarkId(null);
  scrollToPdfBookmark(bookmark);
}

function removePdfBookmark(bookmarkId: string) {
  restorePdfBookmarkPreview();
  const nextBookmarks = pdfBookmarks.filter(
    (bookmark) => bookmark.id !== bookmarkId
  );

  rememberBookmarkDisplayChange(nextBookmarks);
  setPdfBookmarks(nextBookmarks);
}

function handlePdfScroll() {
  if (
    bookmarkHoverScrollPositionRef.current === null &&
    pdfBookmarkScrollAnimationRef.current === null
  ) {
    setPreviewedPdfBookmarkId((current) => (current ? null : current));
  }

  const scrollContainer = pdfScrollContainerRef.current;

  if (scrollContainer) {
    setPdfBookmarkLocalRailLeft(
      getPdfBookmarkLocalRailLeft(
        scrollContainer,
        pdfBookmarkContentRef.current,
        pdfBookmarkGlobalRailRef.current
      )
    );
  }

  if (
    isPdfBookmarkPlacementActive &&
    pdfBookmarkPlacementPointerYRef.current !== null
  ) {
    if (scrollContainer) {
      setPdfBookmarkPlacementLineTop(
        scrollContainer.scrollTop + pdfBookmarkPlacementPointerYRef.current
      );
    }
  }
}

function handlePdfBookmarkPlacementMouseDown(event: MouseEvent<HTMLElement>) {
  if (!isPdfBookmarkPlacementActive || event.button !== 0) {
    return;
  }

  const ratio = getPdfBookmarkRatioFromPointer(event);

  if (ratio === null) {
    return;
  }

  event.preventDefault();
  event.stopPropagation();
  addPdfBookmarkAtRatio(ratio);
  cancelPdfBookmarkPlacement();
}

useEffect(() => {
  function handlePdfBookmarkShortcut(event: KeyboardEvent) {
    if (
      event.key === "Delete" &&
      previewedPdfBookmarkId &&
      !isEditableShortcutTarget(event.target)
    ) {
      event.preventDefault();
      removePdfBookmark(previewedPdfBookmarkId);
      return;
    }

    if (
      isPdfBookmarkPlacementActive &&
      event.key === "Escape" &&
      !isEditableShortcutTarget(event.target)
    ) {
      event.preventDefault();
      cancelPdfBookmarkPlacement();
      return;
    }

    if (
      event.defaultPrevented ||
      event.altKey ||
      event.shiftKey ||
      event.key.toLowerCase() !== "b" ||
      !(event.metaKey || event.ctrlKey) ||
      isEditableShortcutTarget(event.target)
    ) {
      return;
    }

    event.preventDefault();
    togglePdfBookmarkPlacement();
  }

  window.addEventListener("keydown", handlePdfBookmarkShortcut);

  return () => {
    window.removeEventListener("keydown", handlePdfBookmarkShortcut);
  };
});

function handleGuestNavigation(event: MouseEvent<HTMLAnchorElement>) {
  if (!isGuestMode) {
    return;
  }

  const shouldLeave = window.confirm(
    "Guest work is not attached to a registered account. Leave this page?"
  );

  if (!shouldLeave) {
    event.preventDefault();
  }
}

function getReaderProfileUserId() {
  if (!paper) {
    return null;
  }

  return isGuestMode ? getGuestUserProfile().id : paper.userId;
}

function getReaderProfileOwner(
  profileRecord?: LocalKnowledgeProfileRecord | null
): Pick<UserProfile, "id" | "username" | "displayName"> | null {
  if (!paper) {
    return null;
  }

  if (isGuestMode) {
    return getGuestUserProfile();
  }

  if (profileRecord) {
    return {
      id: profileRecord.userId,
      username: profileRecord.username,
      displayName: profileRecord.displayName,
    };
  }

  return {
    id: paper.userId,
    username: paper.userId === "local-user" ? "local" : paper.userId,
    displayName: "Local reader",
  };
}

async function handleReaderProfileChange(profileId: string) {
  if (!paper) {
    return;
  }

  const profileRecord = readerProfileRecords.find(
    (record) => record.id === profileId
  );

  if (!profileRecord) {
    return;
  }

  const profileUserId = isGuestMode ? getGuestUserProfile().id : paper.userId;

  try {
    await selectKnowledgeProfileForAccount({
      user: {
        id: profileUserId,
        username: profileRecord.username,
        displayName: profileRecord.displayName,
      },
      isGuest: isGuestMode,
      profileId,
    });
  } catch (error) {
    console.error(error);
    return;
  }

  setSelectedReaderProfileId(profileRecord.id);
  setSelectedReaderKnowledgeProfile(profileRecord.knowledgeProfile);
  setIsReaderProfileMenuOpen(false);
}

function updateReaderProfileDialogForm<Field extends keyof ReaderProfileForm>(
  field: Field,
  value: ReaderProfileForm[Field]
) {
  setReaderProfileDialogForm((currentForm) => ({
    ...currentForm,
    [field]: value,
  }));
  setReaderProfileDialogError("");
}

function openNewReaderProfileDialog() {
  setReaderProfilePresetSearch("");
  setReaderProfileDialogError("");
  setIsReaderProfilePresetPickerOpen(true);
  setIsReaderProfileMenuOpen(false);
}

function closeReaderProfilePresetPicker() {
  setIsReaderProfilePresetPickerOpen(false);
  setReaderProfilePresetSearch("");
}

function chooseReaderProfilePreset(preset: KnowledgeProfilePreset) {
  const profileUserId = getReaderProfileUserId();

  if (!profileUserId) {
    return;
  }

  setReaderProfileDialogMode("new");
  setReaderProfileDialogProfileId(null);
  setReaderProfileDialogName(
    getUniqueKnowledgeProfileName({
      userId: profileUserId,
      isGuest: isGuestMode,
      baseName: preset.defaultName,
    })
  );
  setReaderProfileDialogForm(getReaderProfileForm(preset.knowledgeProfile));
  setReaderProfileDialogError("");
  setIsReaderProfilePresetPickerOpen(false);
  setReaderProfilePresetSearch("");
  setIsReaderProfileMenuOpen(false);
}

function openEditReaderProfileDialog() {
  const selectedProfileRecord =
    readerProfileRecords.find(
      (profileRecord) => profileRecord.id === selectedReaderProfileId
    ) ?? null;

  setReaderProfileDialogMode("edit");
  setReaderProfileDialogProfileId(selectedProfileRecord?.id ?? null);
  setReaderProfileDialogName(
    selectedProfileRecord?.name ?? DEFAULT_KNOWLEDGE_PROFILE_NAME
  );
  setReaderProfileDialogForm(
    getReaderProfileForm(
      selectedProfileRecord?.knowledgeProfile ?? selectedReaderKnowledgeProfile
    )
  );
  setReaderProfileDialogError("");
  setIsReaderProfileMenuOpen(false);
}

function closeReaderProfileDialog() {
  if (isSavingReaderProfile || isDeletingReaderProfile) {
    return;
  }

  setReaderProfileDialogMode(null);
  setReaderProfileDialogError("");
}

async function handleDeleteReaderProfile() {
  const profileId = readerProfileDialogProfileId ?? selectedReaderProfileId;
  const profileRecord =
    readerProfileRecords.find((record) => record.id === profileId) ?? null;
  const profileOwner = getReaderProfileOwner(profileRecord);

  if (!profileId || !profileOwner) {
    return;
  }

  const shouldDelete = window.confirm("Delete this profile?");

  if (!shouldDelete) {
    return;
  }

  setIsDeletingReaderProfile(true);
  setReaderProfileDialogError("");

  try {
    const result = await deleteKnowledgeProfileForAccount({
      user: profileOwner,
      isGuest: isGuestMode,
      profileId,
    });
    const selectedRecord = result.selectedRecord ?? result.records[0];

    if (!selectedRecord) {
      throw new Error("No profile available after delete.");
    }

    setReaderProfileRecords(result.records);
    setSelectedReaderProfileId(selectedRecord.id);
    setSelectedReaderKnowledgeProfile(selectedRecord.knowledgeProfile);
    setReaderProfileDialogMode(null);
  } catch (error) {
    console.error(error);
    setReaderProfileDialogError(
      error instanceof Error ? error.message : "Failed to delete profile."
    );
  } finally {
    setIsDeletingReaderProfile(false);
  }
}

async function handleReaderProfileDialogSubmit(event: FormEvent<HTMLFormElement>) {
  event.preventDefault();

  if (!paper || isDeletingReaderProfile) {
    return;
  }

  setIsSavingReaderProfile(true);
  setReaderProfileDialogError("");

  try {
    const nextProfile = buildReaderKnowledgeProfile(readerProfileDialogForm);
    let profileOwner: Pick<UserProfile, "id" | "username" | "displayName">;

    if (isGuestMode) {
      profileOwner = getGuestUserProfile();
    } else if (!isLocalPaper && getStoredAuthToken()) {
      profileOwner = {
        id: paper.userId,
        username: paper.userId,
        displayName: paper.userId,
      };
    } else {
      profileOwner = {
        id: paper.userId,
        username: paper.userId === "local-user" ? "local" : paper.userId,
        displayName: "Local reader",
      };
    }

    const savedRecord = await saveKnowledgeProfileForAccount({
      user: profileOwner,
      isGuest: isGuestMode,
      knowledgeProfile: nextProfile,
      profileId: readerProfileDialogProfileId,
      profileName: readerProfileDialogName,
    });
    const updatedRecords = getAccountKnowledgeProfileRecords({
      userId: profileOwner.id,
      isGuest: isGuestMode,
    });

    setReaderProfileRecords(updatedRecords);
    setSelectedReaderProfileId(savedRecord.id);
    setSelectedReaderKnowledgeProfile(savedRecord.knowledgeProfile);
    setReaderProfileDialogMode(null);
  } catch (error) {
    console.error(error);
    setReaderProfileDialogError(
      error instanceof Error ? error.message : "Failed to save profile."
    );
  } finally {
    setIsSavingReaderProfile(false);
  }
}

function previewHistoryAnnotation(targetId: string) {
  const scrollContainer = pdfScrollContainerRef.current;

  if (scrollContainer && historyHoverScrollPositionRef.current === null) {
    historyHoverScrollPositionRef.current = {
      left: scrollContainer.scrollLeft,
      top: scrollContainer.scrollTop,
      visualZoom: pdfVisualZoomRef.current,
    };
  }

  targetRevealNonceRef.current += 1;
  setTargetToReveal({
    targetId,
    nonce: targetRevealNonceRef.current,
    behavior: "auto",
    animation: "fast",
    trackVisualPosition: true,
  });
}

function openSelectionPreview(targetId: string) {
  clearSelectionPreviewCloseTimer();

  if (previewedSelectionTargetIdRef.current === targetId) {
    return;
  }

  previewedSelectionTargetIdRef.current = targetId;
  setPreviewedSelectionTargetId(targetId);
  previewHistoryAnnotation(targetId);
}

function scheduleCloseSelectionPreview() {
  clearSelectionPreviewCloseTimer();

  selectionPreviewCloseTimeoutRef.current = window.setTimeout(() => {
    selectionPreviewCloseTimeoutRef.current = null;

    if (previewedSelectionTargetIdRef.current === null) {
      return;
    }

    previewedSelectionTargetIdRef.current = null;
    setPreviewedSelectionTargetId(null);
    restoreHistoryAnnotationPreview();
  }, 140);
}

function showMultiselectToast() {
  if (multiselectToastTimeoutRef.current !== null) {
    window.clearTimeout(multiselectToastTimeoutRef.current);
  }

  setIsMultiselectToastVisible(true);

  multiselectToastTimeoutRef.current = window.setTimeout(() => {
    multiselectToastTimeoutRef.current = null;
    setIsMultiselectToastVisible(false);
  }, 850);
}

async function confirmDeleteAnnotation() {
  if (!paper || !annotationToDelete) {
    return;
  }

  const deletedAnnotationId = annotationToDelete.id;
  const deletedTargetIds = getAnnotationTargets(annotationToDelete).map(
    (target) => target.id
  );
  const replacementAnnotation =
    sortAnnotationsNewestFirst(
      annotations.filter(
        (annotation) =>
          annotation.id !== deletedAnnotationId &&
          getAnnotationTargets(annotation).some((target) =>
            deletedTargetIds.includes(target.id)
          )
      )
    )[0] ?? null;

  try {
    setIsDeletingAnnotation(true);

    if (isGuestMode) {
      await deleteGuestAnnotation({
        paperId: paper.id,
        annotationId: deletedAnnotationId,
      });
    } else if (isLocalPaper) {
      await deleteLocalAnnotation({
        paperId: paper.id,
        annotationId: deletedAnnotationId,
      });
    } else {
      await deletePaperAnnotation({
        paperId: paper.id,
        annotationId: deletedAnnotationId,
      });
    }

    setAnnotations((current) =>
      current.filter((annotation) => annotation.id !== deletedAnnotationId)
    );

    if (replacementAnnotation) {
      const replacementTargets = getAnnotationTargets(replacementAnnotation);
      const replacementKind = inferAnnotationResponseKind(replacementAnnotation);

      setSelectedAnnotation(replacementAnnotation);
      setSelectedTargets(replacementTargets);
      setCurrentSelection(getPrimaryAnnotationTarget(replacementAnnotation));
      setAiResponseKind(replacementKind);
      setCollapsedAiResponseSections(
        getCollapsedAiResponseSectionsForAnnotation(replacementAnnotation)
      );
      setAiResponse(
        getAnnotationMainExplanation(replacementAnnotation, replacementKind)
      );
      setOverlappingTargetIds(replacementTargets.map((target) => target.id));
      setSelectionExpanded(false);
      setActiveFollowUpConcept("");
      setExpandedFollowUpConcepts({});
      setFollowUpErrors({});
      setQuestionTurns([]);
    } else {
      setSelectedAnnotation(null);
      setSelectedTargets([]);
      setCurrentSelection(null);
      setAiResponseKind("explanation");
      setAiResponse("");
      setOverlappingTargetIds([]);
      setActiveFollowUpConcept("");
      setExpandedFollowUpConcepts({});
      setFollowUpErrors({});
      setQuestionTurns([]);
    }

    setAnnotationToDelete(null);
  } catch (error) {
    console.error(error);
    setAiResponse("Failed to delete annotation. Please try again.");
  } finally {
    setIsDeletingAnnotation(false);
  }
}

function cancelDeleteAnnotation() {
  if (isDeletingAnnotation) {
    return;
  }

  setAnnotationToDelete(null);
}

function handleAnnotationClick(
  annotation: AiAnnotation,
  preferredTarget?: AnnotationTarget | null
) {
  closeSelectionPreviewNow();

  const annotationTargets = getAnnotationTargets(annotation);
  const focusedTarget =
    preferredTarget && annotationTargets.some((target) => target.id === preferredTarget.id)
      ? annotationTargets.find((target) => target.id === preferredTarget.id)!
      : annotationTargets[0] ?? null;

  rememberSelectionDisplayChange(annotationTargets, focusedTarget, annotation);
  const responseKind = inferAnnotationResponseKind(annotation);
  setRightPanelView("annotations");
  setCurrentSelection(focusedTarget);
  setSelectedTargets(annotationTargets);
  setSelectedAnnotation(annotation);
  setAiResponseKind(responseKind);
  setCollapsedAiResponseSections(
    getCollapsedAiResponseSectionsForAnnotation(annotation)
  );
  setSelectionExpanded(false);
  setOverlappingTargetIds(focusedTarget ? [focusedTarget.id] : []);
  setAiResponse(getAnnotationMainExplanation(annotation, responseKind));
  setActiveFollowUpConcept("");
  setExpandedFollowUpConcepts({});
  setFollowUpErrors({});
  setRelatedConversationsExpanded(false);
  setActiveConversation(null);
  setQuestionTurns([]);
}

function handleConversationHistoryClick(conversation: QuestionConversation) {
  setRightPanelView("annotations");
  setActiveConversation(conversation);
  setQuestionTurns(conversation.turns);
  setCollapsedConversationIds((current) => ({
    ...current,
    [conversation.id]: false,
  }));
  setActiveFollowUpConcept("");
  setExpandedFollowUpConcepts({});
  setFollowUpErrors({});

  const linkedSelection =
    conversation.turns.find((turn) => turn.linkedSelection)?.linkedSelection ??
    null;

  if (!linkedSelection) {
    rememberSelectionDisplayChange([], null, null);
    setCurrentSelection(null);
    setSelectedTargets([]);
    setSelectedAnnotation(null);
    setAiResponseKind("explanation");
    setAiResponse("");
    setOverlappingTargetIds([]);
    return;
  }

  const linkedAnnotation =
    (linkedSelection.annotationId
      ? annotations.find(
          (annotation) => annotation.id === linkedSelection.annotationId
        )
      : null) ??
    getNewestAnnotationForTargetId(
      annotations,
      linkedSelection.annotationTargetId
    );
  const linkedKind = inferAnnotationResponseKind(linkedAnnotation);

  rememberSelectionDisplayChange(
    linkedAnnotation ? getAnnotationTargets(linkedAnnotation) : [linkedSelection.target],
    linkedSelection.target,
    linkedAnnotation
  );
  setCurrentSelection(linkedSelection.target);
  setSelectedTargets(
    linkedAnnotation ? getAnnotationTargets(linkedAnnotation) : [linkedSelection.target]
  );
  setSelectedAnnotation(linkedAnnotation);
  setAiResponseKind(linkedKind);
  setCollapsedAiResponseSections(
    getCollapsedAiResponseSectionsForAnnotation(linkedAnnotation)
  );
  setSelectionExpanded(false);
  setOverlappingTargetIds([linkedSelection.annotationTargetId]);
  setAiResponse(
    linkedAnnotation
      ? getAnnotationMainExplanation(linkedAnnotation, linkedKind)
      : linkedSelection.annotationExplanation || ""
  );
}

function closeActiveConversation() {
  setActiveConversation(null);
  setQuestionTurns([]);
}

function toggleAiResponseSection(kind: AiAnnotationResponseKind) {
  setAiResponseKind(kind);
  const content = getAnnotationResponseContent(selectedAnnotation, kind);

  if (content) {
    setAiResponse(content.mainExplanation);
  }

  setCollapsedAiResponseSections((current) => ({
    ...current,
    [kind]: !current[kind],
  }));
}

function toggleConversationCollapsed(conversationId: string) {
  setCollapsedConversationIds((current) => ({
    ...current,
    [conversationId]: !current[conversationId],
  }));
}

function focusOrAppendSelectionTarget(target: AnnotationTarget) {
  const existingTarget = selectedTargets.find(
    (selectedTarget) => selectedTarget.id === target.id
  );

  if (existingTarget) {
    const matchingAnnotation =
      getNewestAnnotationForTargetSet(annotations, selectedTargets) ??
      (selectedAnnotation &&
      getTargetSignature(getAnnotationTargets(selectedAnnotation)) ===
        getTargetSignature(selectedTargets)
        ? selectedAnnotation
        : null);
    const responseKind = inferAnnotationResponseKind(matchingAnnotation);

    closeSelectionPreviewNow();
    rememberSelectionDisplayChange(selectedTargets, existingTarget, matchingAnnotation);
    setRightPanelView("annotations");
    setCurrentSelection(existingTarget);
    setSelectedAnnotation(matchingAnnotation);
    setAiResponseKind(responseKind);
    setAiResponse(
      matchingAnnotation
        ? getAnnotationMainExplanation(matchingAnnotation, responseKind)
        : ""
    );
    setOverlappingTargetIds([existingTarget.id]);
    return;
  }

  showMultiselectToast();
  setSelectionDisplayWithHistory([...selectedTargets, target], target);
}

function handleAnnotationContextMenu(
  hitAnnotations: AiAnnotation[],
  append: boolean
) {
  const sortedHitAnnotations = sortAnnotationsNewestFirst(hitAnnotations);
  const clickedTargets = getUniqueTargetsById(
    sortedHitAnnotations
      .map((annotation) => annotation.target)
      .filter((target): target is AnnotationTarget => Boolean(target))
  );
  const clickedTarget = clickedTargets[0] ?? null;

  if (!clickedTarget) {
    return;
  }

  setRightPanelView("annotations");
  setOverlappingTargetIds(clickedTargets.map((target) => target.id));

  if (clickedTargets.length > 1) {
    const sharedAnnotation =
      selectedAnnotation &&
      clickedTargets.every((target) =>
        annotationHasTarget(selectedAnnotation, target.id)
      )
        ? selectedAnnotation
        : getAnnotationContainingTargets(sortedHitAnnotations, clickedTargets);

    if (sharedAnnotation) {
      handleAnnotationClick(sharedAnnotation, clickedTarget);
      setOverlappingTargetIds(clickedTargets.map((target) => target.id));
      return;
    }

    const nextTargets = append
      ? getUniqueTargetsById([...selectedTargets, ...clickedTargets])
      : clickedTargets;

    showMultiselectToast();
    setSelectionDisplayWithHistory(nextTargets, clickedTarget);
    setOverlappingTargetIds(clickedTargets.map((target) => target.id));
    return;
  }

  if (append) {
    focusOrAppendSelectionTarget(clickedTarget);
    return;
  }

  if (currentSelection?.id === clickedTarget.id && selectedAnnotation) {
    return;
  }

  if (selectedAnnotation && annotationHasTarget(selectedAnnotation, clickedTarget.id)) {
    const selectedAnnotationTargets = getAnnotationTargets(selectedAnnotation);
    const focusedTarget =
      selectedAnnotationTargets.find((target) => target.id === clickedTarget.id) ??
      clickedTarget;

    rememberSelectionDisplayChange(
      selectedAnnotationTargets,
      focusedTarget,
      selectedAnnotation
    );
    setCurrentSelection(focusedTarget);
    setSelectedTargets(selectedAnnotationTargets);
    setSelectedAnnotation(selectedAnnotation);
    const responseKind = inferAnnotationResponseKind(selectedAnnotation);
    setAiResponseKind(responseKind);
    setAiResponse(getAnnotationMainExplanation(selectedAnnotation, responseKind));
    return;
  }

  if (sortedHitAnnotations[0]) {
    handleAnnotationClick(sortedHitAnnotations[0], clickedTarget);
  }
}

function handleSelectionContextMenu(targets: AnnotationTarget[], append: boolean) {
  const clickedTargets = getUniqueTargetsById(targets);
  const target = clickedTargets[0] ?? null;

  if (!target) {
    return;
  }

  setRightPanelView("annotations");
  setOverlappingTargetIds(clickedTargets.map((clickedTarget) => clickedTarget.id));

  if (clickedTargets.length > 1) {
    const sharedAnnotation =
      selectedAnnotation &&
      clickedTargets.every((clickedTarget) =>
        annotationHasTarget(selectedAnnotation, clickedTarget.id)
      )
        ? selectedAnnotation
        : getAnnotationContainingTargets(annotations, clickedTargets);

    if (sharedAnnotation) {
      handleAnnotationClick(sharedAnnotation, target);
      setOverlappingTargetIds(
        clickedTargets.map((clickedTarget) => clickedTarget.id)
      );
      return;
    }

    const nextTargets = append
      ? getUniqueTargetsById([...selectedTargets, ...clickedTargets])
      : clickedTargets;

    showMultiselectToast();
    setSelectionDisplayWithHistory(nextTargets, target);
    setOverlappingTargetIds(
      clickedTargets.map((clickedTarget) => clickedTarget.id)
    );
    return;
  }

  if (append) {
    focusOrAppendSelectionTarget(target);
    return;
  }

  const nextTargets = selectedTargets.length > 0 ? selectedTargets : [target];
  const exactSelectionAnnotation = getNewestAnnotationForTargetSet(
    annotations,
    nextTargets
  );
  const annotationForCurrentSelection =
    exactSelectionAnnotation ??
    (selectedAnnotation &&
    getTargetSignature(getAnnotationTargets(selectedAnnotation)) ===
      getTargetSignature(nextTargets) &&
    annotationHasTarget(selectedAnnotation, target.id)
      ? selectedAnnotation
      : null);

  if (currentSelection?.id === target.id) {
    if (annotationForCurrentSelection) {
      const responseKind = inferAnnotationResponseKind(annotationForCurrentSelection);

      setSelectedAnnotation(annotationForCurrentSelection);
      setAiResponseKind(responseKind);
      setAiResponse(
        getAnnotationMainExplanation(annotationForCurrentSelection, responseKind)
      );
    }
    return;
  }

  rememberSelectionDisplayChange(
    nextTargets,
    target,
    annotationForCurrentSelection
  );
  setCurrentSelection(target);
  setSelectedAnnotation(annotationForCurrentSelection);

  if (annotationForCurrentSelection) {
    const responseKind = inferAnnotationResponseKind(annotationForCurrentSelection);

    setAiResponseKind(responseKind);
    setAiResponse(
      getAnnotationMainExplanation(annotationForCurrentSelection, responseKind)
    );
  } else {
    setAiResponseKind("explanation");
    setAiResponse("");
  }
}

function handleTextSelected(target: TextAnnotationTarget, append: boolean) {
  if (append) {
    showMultiselectToast();
  }

  setSelectionDisplayWithHistory(
    append
      ? [
          ...selectedTargets.filter(
            (selectedTarget) => selectedTarget.id !== target.id
          ),
          target,
        ]
      : [target],
    target
  );
}

function handleRegionSelected(region: RegionAnnotationTarget, append: boolean) {
  if (append) {
    showMultiselectToast();
  }

  setSelectionDisplayWithHistory(
    append
      ? [
          ...selectedTargets.filter((target) => target.id !== region.id),
          region,
        ]
      : [region],
    region
  );
}

async function handleSelectionAiRequest(kind: "explain" | "summarize") {
  const activeTargets = selectedTargets.length > 0
    ? selectedTargets
    : currentSelection
      ? [currentSelection]
      : [];

  if (activeTargets.length === 0 || !paper) {
    setAiResponse("Select text or a region from the PDF first.");
    return;
  }

  const isSummary = kind === "summarize";
  const requestPrompt =
    prompt.trim() ||
    (isSummary
      ? "Summarize this selection for me."
      : "Explain this selection for a beginner.");
  const responseKind: AiAnnotationResponseKind = isSummary
    ? "summary"
    : "explanation";
  const selectionSignature = getTargetSignature(activeTargets);
  const matchingAnnotation =
    selectedAnnotation &&
    getTargetSignature(getAnnotationTargets(selectedAnnotation)) ===
      selectionSignature
      ? selectedAnnotation
      : sortAnnotationsNewestFirst(annotations).find(
          (annotation) =>
            getTargetSignature(getAnnotationTargets(annotation)) ===
              selectionSignature
        ) ?? null;
  const hasExistingAnnotationContent =
    getAnnotationResponseSections(matchingAnnotation).length > 0;

  try {
    if (isSummary) {
      setIsSummarizing(true);
    } else {
      setIsExplaining(true);
    }

    setActiveFollowUpConcept("");
    setAiResponseKind(responseKind);
    if (matchingAnnotation) {
      setSelectedAnnotation(matchingAnnotation);
      setSelectedTargets(getAnnotationTargets(matchingAnnotation));
      setCurrentSelection(getPrimaryAnnotationTarget(matchingAnnotation));
      setCollapsedAiResponseSections(
        getCollapsedAiResponseSectionsForAnnotation(matchingAnnotation)
      );
    } else {
      setCollapsedAiResponseSections((current) => ({
        ...current,
        [responseKind]: false,
      }));
    }
    if (!hasExistingAnnotationContent) {
      setAiResponse("");
    }

    const result = isGuestMode
      ? isSummary
        ? await summarizeGuestSelection({
            paperId: paper.id,
            targets: activeTargets,
            prompt: requestPrompt,
            knowledgeProfile: selectedReaderKnowledgeProfile,
          })
        : await explainGuestSelection({
            paperId: paper.id,
            targets: activeTargets,
            prompt: requestPrompt,
            knowledgeProfile: selectedReaderKnowledgeProfile,
          })
      : isLocalPaper
        ? isSummary
          ? await summarizeLocalSelection({
              targets: activeTargets,
              prompt: requestPrompt,
            })
          : await explainLocalSelection({
              targets: activeTargets,
              prompt: requestPrompt,
            })
        : isSummary
          ? await summarizeSelection({
              paperId: paper.id,
              targets: activeTargets,
              prompt: requestPrompt,
              knowledgeProfile: selectedReaderKnowledgeProfile,
            })
          : await explainSelection({
              paperId: paper.id,
              targets: activeTargets,
              prompt: requestPrompt,
              knowledgeProfile: selectedReaderKnowledgeProfile,
            });

    setAiResponse(result.explanation.mainExplanation);

    const timestamp = new Date().toISOString();
    const version = {
      id: createId(),
      prompt: requestPrompt,
      response: result.explanation.mainExplanation,
      explanation: result.explanation,
      responseKind,
      targetIds: activeTargets.map((target) => target.id),
      createdAt: timestamp,
    };
    const preservedExplanation = matchingAnnotation
      ? getAnnotationResponseContent(matchingAnnotation, "explanation")
      : null;
    const preservedSummary = matchingAnnotation
      ? getAnnotationResponseContent(matchingAnnotation, "summary")
      : null;
    const annotationBase: AiAnnotation = matchingAnnotation
      ? {
          ...matchingAnnotation,
          target: activeTargets[0],
          targets: activeTargets,
          prompt: requestPrompt,
          response: result.explanation.mainExplanation,
          explanation:
            responseKind === "explanation"
              ? result.explanation
              : preservedExplanation ??
                matchingAnnotation.explanation ??
                result.explanation,
          summary:
            responseKind === "summary"
              ? result.explanation
              : preservedSummary ?? matchingAnnotation.summary ?? null,
          responseKind,
          versions: [...(matchingAnnotation.versions ?? []), version],
        }
      : {
          id: createId(),
          paperId: paper.id,
          userId: paper.userId,
          target: activeTargets[0],
          targets: activeTargets,
          prompt: requestPrompt,
          response: result.explanation.mainExplanation,
          explanation: result.explanation,
          summary: responseKind === "summary" ? result.explanation : null,
          responseKind,
          versions: [version],
          createdAt: timestamp,
        };
    const annotation = setAnnotationResponseContent(
      annotationBase,
      responseKind,
      result.explanation
    );

    try {
      setIsSavingAnnotation(true);

      const savedAnnotation = isGuestMode
        ? await createGuestPaperAnnotation(paper.id, annotation)
        : isLocalPaper
          ? await createLocalPaperAnnotation(paper.id, annotation)
          : await createPaperAnnotation(paper.id, annotation);

      setAnnotations((current) => {
        const exists = current.some((stored) => stored.id === savedAnnotation.id);

        return exists
          ? current.map((stored) =>
              stored.id === savedAnnotation.id ? savedAnnotation : stored
            )
          : [savedAnnotation, ...current];
      });
      setSelectedAnnotation(savedAnnotation);
      setSelectedTargets(getAnnotationTargets(savedAnnotation));
      setCurrentSelection(getPrimaryAnnotationTarget(savedAnnotation));
      setAiResponse(
        getAnnotationResponseContent(savedAnnotation, responseKind)
          ?.mainExplanation ?? result.explanation.mainExplanation
      );
      setCollapsedAiResponseSections(
        getCollapsedAiResponseSectionsForAnnotation(savedAnnotation)
      );
    } catch (error) {
      console.error(error);
      setAiResponse(
        result.explanation.mainExplanation +
          `\n\nWarning: ${isSummary ? "summary" : "explanation"} worked, but saving failed.`
      );
    } finally {
      setIsSavingAnnotation(false);
    }
  } catch (error) {
    console.error(error);
    setAiResponse(
      `Failed to get ${isSummary ? "summary" : "explanation"}. Make sure the backend is running and try again.`
    );
  } finally {
    if (isSummary) {
      setIsSummarizing(false);
    } else {
      setIsExplaining(false);
    }
  }
}

async function handleExplainSelection() {
  await handleSelectionAiRequest("explain");
}

async function handleSummarizeSelection() {
  await handleSelectionAiRequest("summarize");
}

async function handleExplainRelatedConcept(
  concept: string,
  kind: AiAnnotationResponseKind
) {
  if (!paper || !selectedAnnotation) {
    return;
  }

  const followUpKey = getFollowUpStateKey(kind, concept);
  const activeResponseContent = getAnnotationResponseContent(
    selectedAnnotation,
    kind
  );
  setAiResponseKind(kind);

  if (activeResponseContent) {
    setAiResponse(activeResponseContent.mainExplanation);
  }

  if (getFollowUpResponse(selectedAnnotation, concept, kind)) {
    setExpandedFollowUpConcepts((current) => ({
      ...current,
      [followUpKey]: !current[followUpKey],
    }));
    return;
  }

  const previousExplanation =
    activeResponseContent?.mainExplanation ??
    getAnnotationMainExplanation(selectedAnnotation, kind);

  try {
    setActiveFollowUpConcept(followUpKey);

    setFollowUpErrors((current) => {
      const next = { ...current };
      delete next[followUpKey];
      return next;
    });

    const result = isGuestMode
      ? await explainGuestFollowUpConcept({
          paperId: paper.id,
          annotationId: selectedAnnotation.id,
          targets: getAnnotationTargets(selectedAnnotation),
          annotationPrompt: getAnnotationPromptForKind(
            selectedAnnotation,
            kind
          ),
          annotationExplanation: previousExplanation,
          followUpPoint: concept,
          responseKind: kind,
          knowledgeProfile: selectedReaderKnowledgeProfile,
        })
      : isLocalPaper
        ? await explainLocalFollowUpConcept({
            paperId: paper.id,
            annotationId: selectedAnnotation.id,
            followUpPoint: concept,
            responseKind: kind,
          })
        : await explainFollowUpConcept({
            paperId: paper.id,
            annotationId: selectedAnnotation.id,
            targets: getAnnotationTargets(selectedAnnotation),
            annotationPrompt: getAnnotationPromptForKind(
              selectedAnnotation,
              kind
            ),
            annotationExplanation: previousExplanation,
            followUpPoint: concept,
            responseKind: kind,
            knowledgeProfile: selectedReaderKnowledgeProfile,
          });

    const currentContent =
      getAnnotationResponseContent(selectedAnnotation, kind) ??
      selectedAnnotation.explanation;
    const returnedFollowUp = {
      ...result.followUp,
      response:
        result.followUp.response?.trim() ||
        result.explanation.mainExplanation,
    };
    const returnedFollowUpPromptKey = normalizeFollowUpPrompt(
      returnedFollowUp.prompt
    );
    const updatedAnnotation = setAnnotationResponseContent(
      selectedAnnotation,
      kind,
      {
        ...currentContent,
        followUpExplanations: [
          ...(currentContent.followUpExplanations ?? []).filter(
            (followUp) =>
              followUp.id !== returnedFollowUp.id &&
              normalizeFollowUpPrompt(followUp.prompt) !==
                returnedFollowUpPromptKey
          ),
          returnedFollowUp,
        ],
      }
    );

    setSelectedAnnotation(updatedAnnotation);
    setAnnotations((current) =>
      current.map((annotation) =>
        annotation.id === updatedAnnotation.id ? updatedAnnotation : annotation
      )
    );
    setExpandedFollowUpConcepts((current) => ({
      ...current,
      [followUpKey]: true,
    }));
  } catch (error) {
    console.error(error);
    setFollowUpErrors((current) => ({
      ...current,
      [followUpKey]: "Failed to explain this follow-up point. Please try again.",
    }));
    setExpandedFollowUpConcepts((current) => ({
      ...current,
      [followUpKey]: true,
    }));
  } finally {
    setActiveFollowUpConcept("");
  }
}

async function handleAskAi() {
  if (!paper) {
    return;
  }

  const question = prompt.trim();

  if (!question) {
    setAiResponse("Type a question first.");
    return;
  }

  const annotationContext = selectedAnnotation
    ? formatAnnotationForConversation(selectedAnnotation)
    : null;

  try {
    setIsAskingQuestion(true);

    const askQuestionParams = {
      paperId: paper.id,
      message: question,
      conversationId: activeConversation?.id ?? null,
      annotationId: selectedAnnotation?.id ?? null,
      target: currentSelection,
      targets: selectedTargets.length > 0 ? selectedTargets : undefined,
      annotationExplanation: annotationContext,
      responseKind: aiResponseKind,
      knowledgeProfile: selectedReaderKnowledgeProfile,
    };
    const result = isGuestMode
      ? await askGuestAiQuestion(askQuestionParams)
      : isLocalPaper
        ? await askLocalAiQuestion(askQuestionParams)
        : await askAiQuestion(askQuestionParams);

    setActiveConversation(result.conversation);
    setQuestionTurns(result.conversation.turns);
    setCollapsedConversationIds((current) => ({
      ...current,
      [result.conversation.id]: false,
    }));
    setAllConversations((current) => {
      const existingConversationIndex = current.findIndex(
        (conversation) => conversation.id === result.conversation.id
      );

      if (existingConversationIndex === -1) {
        return sortConversationsNewestFirst([...current, result.conversation]);
      }

      return sortConversationsNewestFirst(
        current.map((conversation) =>
          conversation.id === result.conversation.id
            ? result.conversation
            : conversation
        )
      );
    });
    setPrompt("");
  } catch (error) {
    console.error(error);
    setQuestionTurns((current) => [
      ...current,
      {
        id: createId(),
        conversationId: "local-error",
        paperId: paper.id,
        userId: paper.userId,
        userMessage: question,
        aiResponse: "Failed to get AI response. Please try again.",
        linkedSelection: currentSelection
          ? {
              annotationId: selectedAnnotation?.id ?? null,
              annotationTargetId: currentSelection.id,
              target: currentSelection,
              annotationExplanation: annotationContext,
            }
          : null,
        createdAt: new Date().toISOString(),
      },
    ]);
  } finally {
    setIsAskingQuestion(false);
  }
}

  const selectedAnnotationVersions = getAnnotationVersionsForTarget(
    annotations,
    currentSelection
  );
  const selectedAnnotationVersionIndex = selectedAnnotation
    ? selectedAnnotationVersions.findIndex(
        (annotation) => annotation.id === selectedAnnotation.id
      )
    : -1;
  const currentAnnotationVersionIndex =
    selectedAnnotationVersionIndex >= 0 ? selectedAnnotationVersionIndex : 0;
  const aiResponseSections = getAnnotationResponseSections(selectedAnnotation);
  const activeAiResponseContent = getAnnotationResponseContent(
    selectedAnnotation,
    aiResponseKind
  );
  const isSelectionAiBusy = isExplaining || isSummarizing;
  const generatingResponseKind: AiAnnotationResponseKind | null = isSummarizing
    ? "summary"
    : isExplaining
      ? "explanation"
      : null;
  const aiResponseHeading = getAiResponseHeading(aiResponseKind);
  const pendingAiResponseSection =
    generatingResponseKind &&
    !aiResponseSections.some((section) => section.kind === generatingResponseKind)
      ? {
          kind: generatingResponseKind,
          title: getAiResponseHeading(generatingResponseKind),
          content: null as AiExplanationContent | null,
        }
      : null;
  const displayedAiResponseSections = [
    ...aiResponseSections,
    ...(pendingAiResponseSection ? [pendingAiResponseSection] : []),
  ].sort((first, second) => {
    const order: Record<AiAnnotationResponseKind, number> = {
      summary: 0,
      explanation: 1,
    };

    return order[first.kind] - order[second.kind];
  });
  const normalizedAiResponse = normalizeAiDisplayText(aiResponse);
  const aiResponseIsAlreadyDisplayed = displayedAiResponseSections.some(
    (section) =>
      normalizeAiDisplayText(section.content?.mainExplanation) ===
      normalizedAiResponse
  );
  const hasQuestionTurns = questionTurns.length > 0;
  const shouldShowTransientAiResponse =
    Boolean(normalizedAiResponse) &&
    !isSelectionAiBusy &&
    !aiResponseIsAlreadyDisplayed &&
    (displayedAiResponseSections.length === 0 ||
      !activeAiResponseContent ||
      normalizedAiResponse !==
        normalizeAiDisplayText(activeAiResponseContent.mainExplanation));
  const hasAiPanelContent =
    shouldShowTransientAiResponse ||
    displayedAiResponseSections.length > 0 ||
    hasQuestionTurns ||
    isAskingQuestion;
  const historyAnnotations = getNewestAnnotationsByTarget(annotations);
  const historyConversations = sortConversationsNewestFirst(allConversations);
  const visibleAnnotations = guideDemoAnnotation
    ? [
        guideDemoAnnotation,
        ...annotations.filter(
          (annotation) => !annotationHasTarget(annotation, guideDemoAnnotation.target.id)
        ),
      ]
    : annotations;
  const relatedConversations =
    selectedTargets.length > 0
      ? historyConversations.filter((conversation) =>
          conversation.turns.some(
            (turn) =>
              selectedTargets.some(
                (target) =>
                  turn.linkedSelection?.annotationTargetId === target.id
              )
          )
        )
      : [];
  const handlePdfPageStatusChange = useCallback(
    ({ currentPage, numPages }: { currentPage: number; numPages: number }) => {
      setPdfCurrentPage(currentPage);
      setPdfNumPages(numPages);
    },
    []
  );
  const shouldExpandPrompt = promptFocused || prompt.length > 0;
  const selectedReaderProfileRecord =
    readerProfileRecords.find(
      (profileRecord) => profileRecord.id === selectedReaderProfileId
    ) ?? null;
  const readerProfileToolbarName =
    selectedReaderProfileRecord?.name ?? DEFAULT_KNOWLEDGE_PROFILE_NAME;
  const previewedSelectionTargetIndex = selectedTargets.findIndex(
    (target) => target.id === previewedSelectionTargetId
  );
  const previewedSelectionTarget =
    previewedSelectionTargetIndex >= 0
      ? selectedTargets[previewedSelectionTargetIndex]
      : null;
  const sortedPdfBookmarks = [...pdfBookmarks].sort(
    (first, second) => first.ratio - second.ratio
  );
  const hasPdfBookmarks = sortedPdfBookmarks.length > 0;
  const pdfBookmarkPlacementPreviewRatio =
    isPdfBookmarkPlacementActive &&
    pdfBookmarkPlacementLineTop !== null &&
    pdfBookmarkDocumentHeight > 0
      ? clampBookmarkRatio(pdfBookmarkPlacementLineTop / pdfBookmarkDocumentHeight)
      : null;

  if (isLoading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-100">
        <p className="text-slate-600">Loading paper...</p>
      </main>
    );
  }

  if (error || !paper) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-100 p-8">
        <div className="max-w-md rounded-2xl bg-white p-8 text-center shadow-sm">
          <h1 className="text-2xl font-bold">Could not open paper</h1>

          <p className="mt-3 text-slate-600">
            {error || "This paper does not exist."}
          </p>

          <Link
            href="/"
            className="mt-6 inline-block rounded-lg bg-slate-900 px-5 py-3 text-white"
          >
            Upload a PDF
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-100">
      <header className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center border-b bg-white px-4 py-2">
        <div className="flex min-w-0 items-center gap-2">
          <AppMenu />
          <div className="min-w-0">
            <h1 className="text-base font-semibold">NoviceReader</h1>
            <p className="max-w-[60vw] truncate text-xs text-slate-500">
              {paper.originalFilename}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-xs text-slate-600">
          <div className="flex min-w-16 items-center justify-center gap-1 tabular-nums">
            <span>{pdfNumPages > 0 ? pdfCurrentPage : "-"}</span>
            <span className="text-slate-300">/</span>
            <span>{pdfNumPages > 0 ? pdfNumPages : "-"}</span>
          </div>

          <div className="h-4 w-px bg-slate-200" />

          <div className="flex items-center gap-1">
            <button
              onClick={zoomPdfOut}
              className="flex h-6 w-6 items-center justify-center rounded text-base leading-none text-slate-500 hover:bg-white hover:text-slate-900"
              aria-label="Zoom out"
            >
              −
            </button>

            <button
              onClick={resetPdfZoom}
              className="h-6 min-w-12 rounded px-1.5 text-xs tabular-nums text-slate-600 hover:bg-white hover:text-slate-900"
              aria-label="Reset zoom"
            >
              {Math.round(pdfVisualZoom * 100)}%
            </button>

            <button
              onClick={zoomPdfIn}
              className="flex h-6 w-6 items-center justify-center rounded text-sm leading-none text-slate-500 hover:bg-white hover:text-slate-900"
              aria-label="Zoom in"
            >
              +
            </button>
          </div>

          <div className="h-4 w-px bg-slate-200" />

          <button
            type="button"
            data-guide="bookmark-control"
            onClick={togglePdfBookmarkPlacement}
            disabled={pdfNumPages === 0}
            className={`flex h-6 items-center gap-1 rounded px-1.5 text-xs font-medium transition hover:bg-white disabled:pointer-events-none disabled:opacity-40 ${
              isPdfBookmarkPlacementActive
                ? "bg-white text-sky-700 shadow-sm"
                : "text-slate-500 hover:text-slate-900"
            }`}
            title="Place bookmark"
            aria-label="Place bookmark"
            aria-pressed={isPdfBookmarkPlacementActive}
          >
            <svg
              aria-hidden="true"
              viewBox="0 0 24 24"
              className="h-3.5 w-3.5"
              fill="none"
              stroke="currentColor"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="1.8"
            >
              <path d="M7 4h10a1 1 0 0 1 1 1v15l-6-3-6 3V5a1 1 0 0 1 1-1Z" />
              <path d="M12 8v5" />
              <path d="M9.5 10.5h5" />
            </svg>
            <span className="tabular-nums">{sortedPdfBookmarks.length}</span>
          </button>
        </div>

        <div className="flex justify-self-end items-center gap-2">
          <div ref={readerProfileMenuRef} className="relative">
            <button
              type="button"
              onClick={() => setIsReaderProfileMenuOpen((isOpen) => !isOpen)}
              className="flex h-8 min-w-40 max-w-52 items-center justify-between gap-2 rounded-md border border-slate-200 bg-white px-2 text-xs text-slate-500 shadow-sm transition hover:border-slate-300 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-slate-200"
              aria-expanded={isReaderProfileMenuOpen}
              aria-haspopup="listbox"
            >
              <span className="hidden font-medium lg:inline">Profile</span>
              <span className="min-w-0 flex-1 truncate text-left font-semibold text-slate-800">
                {readerProfileToolbarName}
              </span>
              <svg
                aria-hidden="true"
                viewBox="0 0 20 20"
                className={`h-3.5 w-3.5 shrink-0 text-slate-400 transition ${
                  isReaderProfileMenuOpen ? "rotate-180 text-slate-700" : ""
                }`}
                fill="currentColor"
              >
                <path
                  fillRule="evenodd"
                  d="M5.23 7.21a.75.75 0 0 1 1.06.02L10 11.17l3.71-3.94a.75.75 0 1 1 1.08 1.04l-4.25 4.5a.75.75 0 0 1-1.08 0l-4.25-4.5a.75.75 0 0 1 .02-1.06Z"
                  clipRule="evenodd"
                />
              </svg>
            </button>

            {isReaderProfileMenuOpen && (
              <div className="absolute right-0 top-full z-40 mt-2 w-60 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-xl ring-1 ring-slate-950/5">
                <div className="border-b border-slate-100 bg-slate-50 px-3 py-2">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                    Active profile
                  </p>
                  <p className="mt-0.5 truncate text-sm font-semibold text-slate-900">
                    {readerProfileToolbarName}
                  </p>
                </div>

                <div
                  role="listbox"
                  aria-label="Knowledge profiles"
                  className="max-h-44 overflow-auto p-1.5"
                >
                  {readerProfileRecords.length > 0 ? (
                    readerProfileRecords.map((profileRecord) => {
                      const isActive =
                        selectedReaderProfileId === profileRecord.id;

                      return (
                        <button
                          key={profileRecord.id}
                          type="button"
                          role="option"
                          aria-selected={isActive}
                          onClick={() => handleReaderProfileChange(profileRecord.id)}
                          className={`group flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm transition ${
                            isActive
                              ? "bg-slate-900 text-white shadow-sm"
                              : "text-slate-700 hover:bg-slate-100 hover:text-slate-950"
                          }`}
                        >
                          <span
                            className={`h-2 w-2 shrink-0 rounded-full ${
                              isActive
                                ? "bg-emerald-300"
                                : "bg-slate-300 group-hover:bg-slate-500"
                            }`}
                          />
                          <span className="min-w-0 flex-1 truncate font-medium">
                            {profileRecord.name}
                          </span>
                          {isActive && (
                            <span className="text-[10px] font-semibold uppercase tracking-wide opacity-80">
                              On
                            </span>
                          )}
                        </button>
                      );
                    })
                  ) : (
                    <p className="px-2.5 py-3 text-sm text-slate-500">
                      No saved profiles yet.
                    </p>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-1 border-t border-slate-100 bg-slate-50 p-1.5">
                  <button
                    type="button"
                    onClick={openEditReaderProfileDialog}
                    className="inline-flex h-8 items-center justify-center gap-1.5 rounded-md text-xs font-semibold text-slate-600 transition hover:bg-white hover:text-slate-950 hover:shadow-sm"
                    title="Edit profile"
                  >
                    <svg
                      aria-hidden="true"
                      viewBox="0 0 24 24"
                      className="h-3.5 w-3.5"
                      fill="none"
                      stroke="currentColor"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="1.8"
                    >
                      <path d="M12 20h9" />
                      <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
                    </svg>
                    <span>Edit</span>
                  </button>

                  <button
                    type="button"
                    onClick={openNewReaderProfileDialog}
                    className="inline-flex h-8 items-center justify-center gap-1.5 rounded-md text-xs font-semibold text-slate-600 transition hover:bg-white hover:text-slate-950 hover:shadow-sm"
                    title="New"
                  >
                    <svg
                      aria-hidden="true"
                      viewBox="0 0 24 24"
                      className="h-3.5 w-3.5"
                      fill="none"
                      stroke="currentColor"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="1.8"
                    >
                      <path d="M12 5v14" />
                      <path d="M5 12h14" />
                    </svg>
                    <span>New</span>
                  </button>
                </div>
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={startReaderGuide}
            className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 transition hover:bg-slate-50 hover:text-slate-950"
          >
            <svg
              aria-hidden="true"
              viewBox="0 0 24 24"
              className="h-3.5 w-3.5"
              fill="none"
              stroke="currentColor"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="1.8"
            >
              <circle cx="12" cy="12" r="8" />
              <path d="M10.2 9.5a2 2 0 1 1 3.3 1.5c-.9.7-1.5 1.2-1.5 2.4" />
              <path d="M12 16.7h.01" />
            </svg>
            Guide
          </button>

          <Link
            href="/"
            onClick={handleGuestNavigation}
            className="rounded-md border px-3 py-1.5 text-xs hover:bg-slate-50"
          >
            Upload another PDF
          </Link>
        </div>
      </header>

      <div
        role="status"
        aria-live="polite"
        aria-hidden={!isMultiselectToastVisible}
        className={`pointer-events-none fixed left-1/2 top-[72px] z-[130] -translate-x-1/2 rounded-lg bg-slate-950/85 px-4 py-2 text-sm font-semibold text-white shadow-lg ring-1 ring-white/10 backdrop-blur transition-all duration-200 ${
          isMultiselectToastVisible
            ? "translate-y-0 opacity-100"
            : "-translate-y-1 opacity-0"
        }`}
      >
        multiselect
      </div>

      <div className="relative grid h-[calc(100vh-49px)] grid-cols-[minmax(0,1fr)_305px] gap-3 p-3">
        <div
          ref={pdfBookmarkGlobalRailRef}
          className="absolute bottom-5 left-1 top-5 z-20 flex w-4 justify-center"
          onMouseLeave={restorePdfBookmarkPreview}
          aria-label="PDF bookmarks"
        >
          <div className="pointer-events-none h-full w-px rounded-full bg-slate-900/10" />

          {sortedPdfBookmarks.map((bookmark, index) => (
            <button
              key={bookmark.id}
              type="button"
              onMouseEnter={() => previewPdfBookmark(bookmark)}
              onFocus={() => previewPdfBookmark(bookmark)}
              onBlur={restorePdfBookmarkPreview}
              onClick={(event) => {
                jumpToPdfBookmark(bookmark);
                event.currentTarget.blur();
              }}
              onContextMenu={(event) => {
                event.preventDefault();
                removePdfBookmark(bookmark.id);
              }}
              className={`absolute left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white shadow-sm ring-1 ring-slate-900/20 transition hover:bg-sky-600 focus:bg-sky-600 focus:outline-none focus:ring-2 focus:ring-sky-300 ${
                previewedPdfBookmarkId === bookmark.id
                  ? "h-3 w-3 bg-sky-600"
                  : "h-2.5 w-2.5 bg-slate-900"
              }`}
              style={{ top: `${clampBookmarkRatio(bookmark.ratio) * 100}%` }}
              title={`Bookmark ${index + 1}. Click to jump. Right-click to remove.`}
              aria-label={`Bookmark ${index + 1}`}
            />
          ))}

          {pdfBookmarkPlacementPreviewRatio !== null && (
            <span
              aria-hidden="true"
              className="pointer-events-none absolute left-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border border-dashed border-sky-500/55 bg-sky-200/25 shadow-sm ring-1 ring-sky-300/20"
              style={{ top: `${pdfBookmarkPlacementPreviewRatio * 100}%` }}
            />
          )}
        </div>

       <section
         ref={pdfScrollContainerRef}
         data-guide="pdf-viewer"
         onMouseMove={rememberPdfCursorBookmarkPosition}
         onScroll={handlePdfScroll}
         onMouseDownCapture={handlePdfBookmarkPlacementMouseDown}
         className={`relative min-w-0 overflow-auto rounded-2xl bg-slate-200 p-2 shadow-sm ${
           isPdfBookmarkPlacementActive ? "cursor-crosshair" : ""
         }`}
       >
        {isPdfBookmarkPlacementActive &&
           pdfBookmarkPlacementLineTop !== null && (
             <div
               className="pointer-events-none absolute left-3 right-3 z-40 -translate-y-1/2 border-t border-dashed border-sky-500/45 shadow-[0_0_0_1px_rgba(255,255,255,0.65)]"
               style={{ top: pdfBookmarkPlacementLineTop }}
             />
           )}

         {(hasPdfBookmarks || pdfBookmarkPlacementPreviewRatio !== null) &&
           pdfBookmarkDocumentHeight > 0 && (
           <div
             aria-label="PDF bookmark document positions"
             className="pointer-events-none absolute top-0 z-40 w-4 -translate-x-1/2"
             style={{
               height: pdfBookmarkDocumentHeight,
               left: pdfBookmarkLocalRailLeft,
             }}
           >
             <div className="absolute bottom-2 left-1/2 top-2 w-px -translate-x-1/2 rounded-full bg-sky-500/10" />

             {sortedPdfBookmarks.map((bookmark, index) => {
               const markerTop = Math.min(
                 Math.max(
                   clampBookmarkRatio(bookmark.ratio) * pdfBookmarkDocumentHeight,
                   8
                 ),
                 Math.max(pdfBookmarkDocumentHeight - 8, 8)
               );

               return (
                 <button
                   key={`document_${bookmark.id}`}
                   type="button"
                   onMouseEnter={() => selectPdfBookmarkIcon(bookmark.id)}
                   onMouseLeave={() => clearSelectedPdfBookmarkIcon(bookmark.id)}
                   onFocus={() => selectPdfBookmarkIcon(bookmark.id)}
                   onBlur={() => clearSelectedPdfBookmarkIcon(bookmark.id)}
                   onClick={(event) => {
                     jumpToPdfBookmark(bookmark);
                     event.currentTarget.blur();
                   }}
                   onContextMenu={(event) => {
                     event.preventDefault();
                     removePdfBookmark(bookmark.id);
                   }}
                   className={`pointer-events-auto absolute left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white shadow-sm transition hover:bg-sky-600 focus:bg-sky-600 focus:outline-none focus:ring-2 focus:ring-sky-300 ${
                     previewedPdfBookmarkId === bookmark.id
                       ? "h-3 w-3 bg-sky-600"
                       : "h-2 w-2 bg-sky-500/55"
                   }`}
                   style={{ top: markerTop }}
                   title={`Bookmark ${index + 1}. Click to jump. Right-click to remove.`}
                   aria-label={`Bookmark ${index + 1} position`}
                 />
               );
             })}

             {pdfBookmarkPlacementLineTop !== null && (
               <span
                 aria-hidden="true"
                 className="pointer-events-none absolute left-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border border-dashed border-sky-500/55 bg-sky-200/25 shadow-sm ring-1 ring-sky-300/20"
                 style={{
                   top: Math.min(
                     Math.max(pdfBookmarkPlacementLineTop, 8),
                     Math.max(pdfBookmarkDocumentHeight - 8, 8)
                   ),
                 }}
               />
             )}
           </div>
         )}

         <div ref={pdfBookmarkContentRef} className="relative">
           <PdfViewer
             fileUrl={paper.fileUrl}
             selectionTool={selectionTool}
             annotations={visibleAnnotations}
             zoom={pdfZoom}
             visualZoom={pdfVisualZoom}
             targetToReveal={targetToReveal}
             currentSelection={currentSelection}
             currentSelectionTargets={selectedTargets}
             onPageStatusChange={handlePdfPageStatusChange}
             onTextSelected={handleTextSelected}
             onRegionSelected={handleRegionSelected}
             onAnnotationContextMenu={handleAnnotationContextMenu}
             onSelectionContextMenu={handleSelectionContextMenu}
             onAnnotationContextMenuEmpty={clearSelection}
           />
         </div>
        </section>

        <div
          data-guide="selection-toolbox"
          className="pointer-events-none absolute right-[349px] top-5 z-20"
        >
          <div
            className={`pointer-events-auto flex flex-col gap-1 rounded-lg border border-slate-200 bg-white/95 p-1 shadow-sm backdrop-blur transition ${
              isGuideToolSwitchAnimating
                ? "ring-2 ring-sky-300 ring-offset-2 ring-offset-slate-100"
                : ""
            }`}
          >
            <button
              onClick={() => setSelectionTool("highlight")}
              className={`flex h-8 w-8 items-center justify-center rounded-md transition ${
                selectionTool === "highlight"
                  ? "bg-slate-900 text-white"
                  : "text-slate-500 hover:bg-slate-100 hover:text-slate-900"
              }`}
              title="Highlight text"
              aria-label="Highlight text"
            >
              <svg
                aria-hidden="true"
                viewBox="0 0 24 24"
                className="h-4 w-4"
                fill="none"
                stroke="currentColor"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="1.8"
              >
                <path d="M9 4h6" />
                <path d="M12 4v16" />
                <path d="M9 20h6" />
                <path d="M5 8h3" />
                <path d="M5 16h3" />
                <path d="M16 8h3" />
                <path d="M16 16h3" />
                <path d="M5 11h14" className="opacity-50" />
                <path d="M5 14h14" className="opacity-50" />
              </svg>
            </button>

            <button
              onClick={() => setSelectionTool("region")}
              className={`flex h-8 w-8 items-center justify-center rounded-md transition ${
                selectionTool === "region"
                  ? "bg-slate-900 text-white"
                  : "text-slate-500 hover:bg-slate-100 hover:text-slate-900"
              }`}
              title="Select region"
              aria-label="Select region"
            >
              <svg
                aria-hidden="true"
                viewBox="0 0 24 24"
                className="h-4 w-4"
                fill="none"
                stroke="currentColor"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="1.8"
              >
                <path d="M6 3v15h15" />
                <path d="M3 6h15v15" />
                <path d="M9 9h6v6H9z" />
              </svg>
            </button>
          </div>
        </div>

        <aside className="relative z-30 flex min-h-0 w-[305px] flex-col overflow-visible rounded-2xl bg-white shadow-sm">
         <div className="border-b p-2">
  <div className="grid grid-cols-2 rounded-lg bg-slate-100 p-0.5 text-xs">
              <button
                onClick={() => setRightPanelView("annotations")}
                className={`rounded-md px-2 py-1.5 font-medium transition ${
                  rightPanelView === "annotations"
                    ? "bg-white text-slate-950 shadow-sm"
                    : "text-slate-500 hover:text-slate-900"
                }`}
              >
                Annotations
              </button>

              <button
                onClick={() => setRightPanelView("history")}
                className={`rounded-md px-2 py-1.5 font-medium transition ${
                  rightPanelView === "history"
                    ? "bg-white text-slate-950 shadow-sm"
                    : "text-slate-500 hover:text-slate-900"
                }`}
              >
                History
              </button>
            </div>
          </div>

          {rightPanelView === "annotations" ? (
            <>
          <div className="flex min-h-0 flex-1 flex-col overflow-visible p-2">
            <section>
             <div className="mb-2 flex items-center justify-between gap-2">
  <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
    Selection
  </h2>

  <div data-guide="selection-actions" className="flex items-center gap-2">
    {(selectionHistory.length > 0 || selectionFuture.length > 0) && (
      <>
        <button
          onClick={revertSelectionChange}
          disabled={selectionHistory.length === 0}
          className="inline-flex h-6 w-6 items-center justify-center rounded-md text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 disabled:pointer-events-none disabled:opacity-30"
          title="Undo selection (Ctrl/Cmd+Z)"
          aria-label="Undo selection"
        >
          <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            className="h-3.5 w-3.5"
            fill="none"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="1.8"
          >
            <path d="M9 7H5v4" />
            <path d="M5 7l5.5 5.5a5 5 0 1 0 1.5-8.1" />
          </svg>
        </button>

        <button
          onClick={restoreForwardSelectionChange}
          disabled={selectionFuture.length === 0}
          className="inline-flex h-6 w-6 items-center justify-center rounded-md text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 disabled:pointer-events-none disabled:opacity-30"
          title="Redo selection (Ctrl/Cmd+Y)"
          aria-label="Redo selection"
        >
          <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            className="h-3.5 w-3.5"
            fill="none"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="1.8"
          >
            <path d="M15 7h4v4" />
            <path d="M19 7l-5.5 5.5A5 5 0 1 1 12 4.4" />
          </svg>
        </button>
      </>
    )}

    {currentSelection && (
      <button
        onClick={clearSelection}
        className="inline-flex h-6 w-6 items-center justify-center rounded-md text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
        title="Deselect"
        aria-label="Deselect annotation"
      >
        ×
      </button>
    )}

  </div>
</div>

              <div
  data-guide="selection-preview"
  className="relative rounded-lg bg-slate-100 p-2 text-xs leading-5 text-slate-700"
>
                {selectedTargets.length > 0 && (
                  <div className="grid grid-cols-4 gap-1.5">
                    {selectedTargets.map((target, index) => {
                      return (
                      <div
                        key={target.id}
                        role="button"
                        tabIndex={0}
                        onMouseEnter={() => openSelectionPreview(target.id)}
                        onMouseLeave={scheduleCloseSelectionPreview}
                        onFocus={() => openSelectionPreview(target.id)}
                        onBlur={(event) => {
                          if (
                            isEventTargetInsideElement(
                              event.relatedTarget,
                              event.currentTarget
                            )
                          ) {
                            return;
                          }

                          scheduleCloseSelectionPreview();
                        }}
                        onClick={() => selectTargetFromSelectionBox(target)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            selectTargetFromSelectionBox(target);
                          }
                        }}
                        className="group relative overflow-visible text-left"
                      >
                        <div
                          className={`relative h-14 overflow-hidden rounded-md border bg-white transition ${
                            currentSelection?.id === target.id ||
                            previewedSelectionTargetId === target.id
                              ? "border-sky-500 ring-1 ring-sky-300"
                              : "border-slate-200 hover:border-slate-300"
                          } ${
                            previewedSelectionTargetId === target.id
                              ? "shadow-sm"
                              : ""
                          }`}
                        >
                          <span className="absolute left-1 top-1 z-10 rounded bg-white/85 px-1 text-[9px] font-semibold leading-4 text-slate-500 shadow-sm">
                            {index + 1}
                          </span>

                          {target.type === "text" ? (
                            <span className="block h-full overflow-hidden px-1.5 pb-1 pt-5 text-[9px] leading-3 text-slate-500">
                              {shortenTextForDisplay(target.text)}
                            </span>
                          ) : target.imageDataUrl ? (
                            <img
                              src={target.imageDataUrl}
                              alt="Selected PDF region"
                              className="h-full w-full object-cover"
                            />
                          ) : (
                            <span className="flex h-full items-center justify-center px-1 text-center text-[9px] leading-3 text-slate-500">
                              Page {target.pageNumber}
                            </span>
                          )}

                          <button
                          type="button"
                          onClick={(event) => {
                            event.preventDefault();
                            event.stopPropagation();
                            removeTargetFromSelectionBox(target.id);
                          }}
                          onKeyDown={(event) => {
                            if (event.key === "Enter" || event.key === " ") {
                              event.preventDefault();
                              event.stopPropagation();
                              removeTargetFromSelectionBox(target.id);
                            }
                          }}
                          className="absolute right-0.5 top-0.5 z-20 hidden h-5 w-5 items-center justify-center rounded-full bg-slate-900/85 text-white shadow-sm transition hover:bg-slate-700 group-hover:flex group-focus-within:flex"
                          aria-label="Remove selection"
                        >
                          <svg
                            aria-hidden="true"
                            viewBox="0 0 16 16"
                            className="h-3 w-3"
                            fill="none"
                            stroke="currentColor"
                            strokeLinecap="round"
                            strokeWidth="1.8"
                          >
                            <path d="M4.5 4.5l7 7" />
                            <path d="M11.5 4.5l-7 7" />
                          </svg>
                        </button>
                        </div>

                      </div>
                      );
                    })}
                  </div>
                )}

                {previewedSelectionTarget && (
                  <div
                    onMouseEnter={() =>
                      openSelectionPreview(previewedSelectionTarget.id)
                    }
                    onMouseLeave={scheduleCloseSelectionPreview}
                    onClick={(event) => event.stopPropagation()}
                    onWheel={(event) => event.stopPropagation()}
                    className="fixed right-[329px] top-24 z-[120] max-h-[min(32rem,calc(100vh-7rem))] w-80 overflow-y-auto rounded-lg border border-slate-200 bg-white p-3 text-left text-xs leading-5 text-slate-700 shadow-xl"
                  >
                    <div className="mb-2 flex items-center justify-between gap-2 text-[10px] font-semibold uppercase text-slate-400">
                      <span>Selection {previewedSelectionTargetIndex + 1}</span>
                      <span>
                        {previewedSelectionTarget.type === "region"
                          ? `Page ${previewedSelectionTarget.pageNumber}`
                          : `${previewedSelectionTarget.chunks.length} mark${
                              previewedSelectionTarget.chunks.length === 1
                                ? ""
                                : "s"
                            }`}
                      </span>
                    </div>

                    {previewedSelectionTarget.type === "text" ? (
                      <p className="text-sm leading-6 text-slate-700">
                        {cleanTextForDisplay(previewedSelectionTarget.text)}
                      </p>
                    ) : previewedSelectionTarget.imageDataUrl ? (
                      <img
                        src={previewedSelectionTarget.imageDataUrl}
                        alt="Selected PDF region preview"
                        className="max-h-72 w-full rounded-md border border-slate-200 bg-white object-contain"
                      />
                    ) : (
                      <p className="rounded-md border border-slate-200 bg-slate-50 p-3 text-sm text-slate-500">
                        Region on page {previewedSelectionTarget.pageNumber}
                      </p>
                    )}
                  </div>
                )}

                {selectedTargets.length === 0 &&
                  (selectionTool === "highlight"
                    ? "No text selected yet."
                    : "No region selected yet.")}
              </div>

            <div
              data-guide="ai-request-buttons"
              className="mt-2 grid grid-cols-2 gap-2"
            >
              <button
                data-guide="explain-selection"
                onClick={handleExplainSelection}
                disabled={
                  selectedTargets.length === 0 ||
                  isSelectionAiBusy ||
                  isSavingAnnotation
                }
                className="rounded-lg bg-slate-900 px-3 py-2 text-xs font-medium text-white hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {isExplaining
                  ? "Explaining..."
                  : isSavingAnnotation
                    ? "Saving..."
                    : "Explain"}
              </button>

              <button
                onClick={handleSummarizeSelection}
                disabled={
                  selectedTargets.length === 0 ||
                  isSelectionAiBusy ||
                  isSavingAnnotation
                }
                className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-50 hover:text-slate-950 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {isSummarizing
                  ? "Summarizing..."
                  : isSavingAnnotation
                    ? "Saving..."
                    : "Summary"}
              </button>
            </div>
            </section>

            <section className="mt-3 flex min-h-0 flex-1 flex-col">
              <div className="mb-2 flex min-w-0 items-center gap-2">
                <h2 className="shrink-0 text-sm font-semibold">AI response</h2>

                {selectedAnnotationVersions.length > 1 && (
                  <div className="flex min-w-0 flex-1 items-center gap-1 rounded-md border border-slate-200 bg-white px-1 py-0.5">
                    <button
                      onClick={() => {
                        const previousAnnotation =
                          selectedAnnotationVersions[
                            currentAnnotationVersionIndex - 1
                          ];

                        if (previousAnnotation) {
                          handleAnnotationClick(previousAnnotation, currentSelection);
                        }
                      }}
                      disabled={currentAnnotationVersionIndex <= 0}
                      className="flex h-6 w-6 shrink-0 items-center justify-center rounded border border-slate-200 text-slate-500 transition hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900 disabled:pointer-events-none disabled:opacity-30"
                      title={
                        selectedAnnotationVersions[currentAnnotationVersionIndex - 1]
                          ? getAnnotationDisplayName(
                              selectedAnnotationVersions[
                                currentAnnotationVersionIndex - 1
                              ]
                            )
                          : "Previous annotation"
                      }
                      aria-label="Previous annotation"
                    >
                      <svg
                        aria-hidden="true"
                        viewBox="0 0 24 24"
                        className="h-3.5 w-3.5"
                        fill="none"
                        stroke="currentColor"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth="1.8"
                      >
                        <path d="M15 6l-6 6 6 6" />
                      </svg>
                    </button>

                    <div className="min-w-0 flex-1 overflow-x-auto py-0.5">
                      <div className="flex min-w-max gap-0.5">
                        {selectedAnnotationVersions.map((annotation, index) => {
                          const isActive = selectedAnnotation?.id === annotation.id;

                          return (
                            <button
                              key={annotation.id}
                              onClick={() =>
                                handleAnnotationClick(annotation, currentSelection)
                              }
                              aria-pressed={isActive}
                              className={`flex h-5 min-w-5 items-center justify-center rounded px-1 text-[10px] font-medium tabular-nums transition ${
                                isActive
                                  ? "bg-slate-900 text-white shadow-sm"
                                  : "bg-slate-100 text-slate-500 hover:bg-slate-200 hover:text-slate-900"
                              }`}
                              title={getAnnotationDisplayName(annotation)}
                              aria-label={getAnnotationDisplayName(annotation)}
                            >
                              {index + 1}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    <button
                      onClick={() => {
                        const nextAnnotation =
                          selectedAnnotationVersions[
                            currentAnnotationVersionIndex + 1
                          ];

                        if (nextAnnotation) {
                          handleAnnotationClick(nextAnnotation, currentSelection);
                        }
                      }}
                      disabled={
                        currentAnnotationVersionIndex >=
                        selectedAnnotationVersions.length - 1
                      }
                      className="flex h-6 w-6 shrink-0 items-center justify-center rounded border border-slate-200 text-slate-500 transition hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900 disabled:pointer-events-none disabled:opacity-30"
                      title={
                        selectedAnnotationVersions[currentAnnotationVersionIndex + 1]
                          ? getAnnotationDisplayName(
                              selectedAnnotationVersions[
                                currentAnnotationVersionIndex + 1
                              ]
                            )
                          : "Next annotation"
                      }
                      aria-label="Next annotation"
                    >
                      <svg
                        aria-hidden="true"
                        viewBox="0 0 24 24"
                        className="h-3.5 w-3.5"
                        fill="none"
                        stroke="currentColor"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth="1.8"
                      >
                        <path d="M9 6l6 6-6 6" />
                      </svg>
                    </button>
                  <span className="shrink-0 px-1 text-[10px] tabular-nums text-slate-400">
                    {currentAnnotationVersionIndex + 1}/
                    {selectedAnnotationVersions.length}
                  </span>
                  </div>
                )}

                {selectedAnnotation && (
                  <button
                    data-guide="delete-annotation"
                    onClick={requestDeleteSelectedAnnotation}
                    className="ml-auto inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-slate-400 transition hover:bg-red-50 hover:text-red-600"
                    title="Delete annotation"
                    aria-label="Delete annotation"
                  >
                    <svg
                      aria-hidden="true"
                      viewBox="0 0 24 24"
                      className="h-3.5 w-3.5"
                      fill="none"
                      stroke="currentColor"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                    >
                      <path d="M3 6h18" />
                      <path d="M8 6V4h8v2" />
                      <path d="M19 6l-1 14H6L5 6" />
                      <path d="M10 11v5" />
                      <path d="M14 11v5" />
                    </svg>
                  </button>
                )}
              </div>

              <div
                data-guide="ai-response"
                className="min-h-0 flex-1 overflow-auto rounded-lg bg-slate-100 p-3 text-sm leading-6 text-slate-700"
              >
  {hasAiPanelContent ? (
    <div className="space-y-3">
      {displayedAiResponseSections.map((section) => {
        const isCollapsed = collapsedAiResponseSections[section.kind];
        const isGeneratingSection = generatingResponseKind === section.kind;
        const sectionConcepts = section.content?.relatedConcepts ?? [];

        return (
          <section key={section.kind}>
            <button
              type="button"
              onClick={() => toggleAiResponseSection(section.kind)}
              className="mb-1 flex w-full items-center justify-between rounded-md px-1 py-1 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 transition hover:bg-slate-50 hover:text-slate-700"
              aria-expanded={!isCollapsed}
            >
              <span>{section.title}</span>
              <span className="text-slate-400">
                {isCollapsed ? "+" : "−"}
              </span>
            </button>

            {!isCollapsed && (
              <div className="space-y-3">
                {isGeneratingSection && (
                  <div className="rounded-lg border border-slate-200 bg-white px-3 py-2">
                    <LoadingDots
                      label={`Generating ${section.title.toLowerCase()}...`}
                    />
                  </div>
                )}

                {section.content && (
                  <RichAiText text={section.content.mainExplanation} />
                )}

                {sectionConcepts.length > 0 && (
                  <div>
                    <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Explore
                    </h3>

                    <div className="flex flex-wrap gap-1.5">
                      {sectionConcepts.map((concept) => {
                        const followUpKey = getFollowUpStateKey(
                          section.kind,
                          concept
                        );
                        const savedFollowUpResponse = getFollowUpResponse(
                          selectedAnnotation,
                          concept,
                          section.kind
                        );
                        const followUpError = followUpErrors[followUpKey];

                        return (
                          <div key={followUpKey} className="w-full">
                            <button
                              onClick={() =>
                                handleExplainRelatedConcept(
                                  concept,
                                  section.kind
                                )
                              }
                              disabled={Boolean(activeFollowUpConcept)}
                              className="w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-left text-xs leading-4 text-slate-600 transition hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              <span className="flex items-center justify-between gap-2">
                                <RichAiInlineText
                                  text={concept}
                                  className="min-w-0"
                                />
                                <span className="shrink-0 text-slate-400">
                                  {activeFollowUpConcept === followUpKey ? (
                                    <span className="block h-3 w-3 animate-spin rounded-full border border-slate-300 border-t-slate-700" />
                                  ) : expandedFollowUpConcepts[followUpKey] ? (
                                    "−"
                                  ) : (
                                    "+"
                                  )}
                                </span>
                              </span>
                            </button>

                            {expandedFollowUpConcepts[followUpKey] &&
                              (savedFollowUpResponse || followUpError) && (
                                <div className="mt-1 rounded-lg border-l-2 border-slate-200 bg-white px-3 py-2 text-xs leading-5 text-slate-600">
                                  <div className="flex items-start justify-between gap-2">
                                    <RichAiText
                                      text={
                                        savedFollowUpResponse || followUpError
                                      }
                                    />

                                    <button
                                      onClick={() =>
                                        setExpandedFollowUpConcepts(
                                          (current) => ({
                                            ...current,
                                            [followUpKey]: false,
                                          })
                                        )
                                      }
                                      className="shrink-0 rounded px-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                                      aria-label="Close follow-up explanation"
                                    >
                                      ×
                                    </button>
                                  </div>
                                </div>
                              )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}
          </section>
        );
      })}

      {shouldShowTransientAiResponse && (
        <section>
          <button
            type="button"
            onClick={() => toggleAiResponseSection(aiResponseKind)}
            className="mb-1 flex w-full items-center justify-between rounded-md px-1 py-1 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 transition hover:bg-slate-50 hover:text-slate-700"
            aria-expanded={!collapsedAiResponseSections[aiResponseKind]}
          >
            <span>{aiResponseHeading}</span>
            <span className="text-slate-400">
              {collapsedAiResponseSections[aiResponseKind] ? "+" : "−"}
            </span>
          </button>

          {!collapsedAiResponseSections[aiResponseKind] && (
            <RichAiText text={aiResponse} />
          )}
        </section>
      )}

      {relatedConversations.length > 0 && (
        <section>
          <button
            onClick={() =>
              setRelatedConversationsExpanded((current) => !current)
            }
            className="flex w-full items-center justify-between rounded-md px-1 py-1 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 hover:bg-slate-50"
          >
            <span>Related conversations</span>
            <span className="text-slate-400">
              {relatedConversationsExpanded ? "−" : "+"}
            </span>
          </button>

          {relatedConversationsExpanded && (
            <div className="mt-1 space-y-1.5">
              {relatedConversations.map((conversation) => (
                <button
                  key={conversation.id}
                  onClick={() => handleConversationHistoryClick(conversation)}
                  className="w-full rounded-lg border border-slate-100 bg-white p-2 text-left transition hover:border-slate-200 hover:bg-slate-50"
                >
                  <p className="text-xs leading-5 text-slate-700">
                    {shortenTextForDisplay(
                      conversation.turns[0]?.userMessage || "Conversation",
                      130
                    )}
                  </p>

                  <p className="mt-1 text-[11px] text-slate-400">
                    {conversation.turns.length} message
                    {conversation.turns.length === 1 ? "" : "s"}
                  </p>
                </button>
              ))}
            </div>
          )}
        </section>
      )}

      {(hasQuestionTurns || isAskingQuestion) && (
        <section>
          <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
            Conversations
          </h3>

          <div className="space-y-3">
            {activeConversation && (
              <div className="border-t border-slate-200 pt-3">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <button
                    onClick={() =>
                      toggleConversationCollapsed(activeConversation.id)
                    }
                    className="inline-flex h-6 w-6 items-center justify-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                    title={
                      collapsedConversationIds[activeConversation.id]
                        ? "Expand conversation"
                        : "Collapse conversation"
                    }
                    aria-label={
                      collapsedConversationIds[activeConversation.id]
                        ? "Expand conversation"
                        : "Collapse conversation"
                    }
                  >
                    {collapsedConversationIds[activeConversation.id] ? "⌄" : "⌃"}
                  </button>

                  <button
                    onClick={closeActiveConversation}
                    className="inline-flex h-6 w-6 items-center justify-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                    title="Stop continuing this conversation"
                    aria-label="Stop continuing this conversation"
                  >
                    ×
                  </button>
                </div>

                {!collapsedConversationIds[activeConversation.id] &&
                  questionTurns.map((turn) => (
                    <div key={turn.id} className="space-y-2 pb-4 last:pb-0">
                      {turn.linkedSelection && (
                        <div className="border-l-2 border-slate-200 pl-2 text-xs leading-5 text-slate-500">
                          {turn.linkedSelection.target.type === "text"
                            ? `“${shortenTextForDisplay(
                                turn.linkedSelection.target.text,
                                120
                              )}”`
                            : `Region on page ${turn.linkedSelection.target.pageNumber}`}
                        </div>
                      )}

                      <div className="rounded-lg bg-slate-100 px-3 py-2 text-sm font-medium leading-6 text-slate-900">
                        {turn.userMessage}
                      </div>

                      <RichAiText
                        text={turn.aiResponse}
                        className="pl-1 text-sm leading-7 text-slate-700"
                      />
                    </div>
                  ))}
              </div>
            )}

            {isAskingQuestion && (
              <div className="pt-2 text-sm leading-6 text-slate-500">
                Asking...
              </div>
            )}
          </div>
        </section>
      )}

      <section className="hidden">
        <h3>Knowledge points</h3>
      </section>

      <section className="hidden">
        <h3>Follow-up conversation</h3>
      </section>

      <section className="hidden">
        <h3>Related concepts</h3>
      </section>
    </div>
  ) : (
    getAiExplanationEmptyMessage(currentSelection)
  )}
</div>
            </section>
          </div>

          <div
            data-guide="ask-ai-panel"
            className="border-t bg-white p-2"
            onFocusCapture={() => setPromptFocused(true)}
            onBlurCapture={(event) => {
              const nextFocusedElement = event.relatedTarget;

              if (
                nextFocusedElement instanceof Node &&
                event.currentTarget.contains(nextFocusedElement)
              ) {
                return;
              }

              setPromptFocused(false);
            }}
          >
            {shouldExpandPrompt && activeConversation ? (
              <div className="mb-2 rounded-lg border-l-2 border-slate-300 bg-slate-50 px-2 py-1.5 text-xs text-slate-500">
                <div className="mb-1 flex items-center justify-between gap-2">
                  <span className="font-medium text-slate-600">
                    Continuing conversation
                  </span>
                  <button
                    onClick={closeActiveConversation}
                    className="inline-flex h-5 w-5 items-center justify-center rounded text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                    title="Stop continuing this conversation"
                    aria-label="Stop continuing this conversation"
                  >
                    ×
                  </button>
                </div>

                <p className="max-h-8 overflow-hidden leading-4">
                  {shortenTextForDisplay(
                    activeConversation.turns[0]?.userMessage ||
                      "Conversation",
                    110
                  )}
                </p>
              </div>
            ) : shouldExpandPrompt && currentSelection ? (
              <div className="mb-2 rounded-lg border-l-2 border-slate-300 bg-slate-50 px-2 py-1.5 text-xs text-slate-500">
                <div className="mb-1 flex items-center justify-between gap-2">
                  <span className="font-medium text-slate-600">
                    Included annotation
                  </span>
                  <div className="flex items-center gap-1">
                    {selectedAnnotation && (
                      <span className="shrink-0 text-[10px] uppercase tracking-wide text-slate-400">
                        annotation included
                      </span>
                    )}
                    <button
                      onClick={clearSelection}
                      className="inline-flex h-5 w-5 items-center justify-center rounded text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                      title="Remove annotation reference"
                      aria-label="Remove annotation reference"
                    >
                      ×
                    </button>
                  </div>
                </div>

                {selectedTargets.length > 1 ? (
                  <p className="leading-4">
                    {selectedTargets.length} selected items included
                  </p>
                ) : currentSelection.type === "text" ? (
                  <p className="max-h-8 overflow-hidden leading-4">
                    “{shortenTextForDisplay(currentSelection.text, 110)}”
                  </p>
                ) : (
                  <p className="leading-4">
                    Region on page {currentSelection.pageNumber}
                  </p>
                )}
              </div>
            ) : null}

            <div>
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-slate-500">
                  Ask
                </span>

                <textarea
                  value={prompt}
                  onChange={(event) => setPrompt(event.target.value)}
                  placeholder="Ask about the selected content..."
                  className={`w-full resize-none rounded-lg border p-2 text-sm outline-none transition-all focus:ring-2 focus:ring-slate-300 ${
                    shouldExpandPrompt ? "h-24" : "h-10"
                  }`}
                />
              </label>

              <button
                onClick={handleAskAi}
                disabled={isSelectionAiBusy || isAskingQuestion}
                className="mt-2 w-full rounded-lg bg-slate-900 px-3 py-2 text-xs font-medium text-white hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {isAskingQuestion ? "Asking..." : "Ask AI"}
              </button>
            </div>
          </div>
            </>
          ) : (
            <div className="min-h-0 flex-1 overflow-auto bg-white p-2">
              <section>
                <button
                  onClick={() =>
                    setHistoryAnnotationsExpanded((current) => !current)
                  }
                  className="flex w-full items-center justify-between rounded-md px-1 py-1 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 hover:bg-slate-50"
                >
                  <span>Annotations</span>
                  <span className="text-slate-400">
                    {historyAnnotationsExpanded ? "−" : "+"}
                  </span>
                </button>

                {historyAnnotationsExpanded && (
                  <div
                    className="mt-1 space-y-1.5"
                    onMouseLeave={restoreHistoryAnnotationPreview}
                  >
                    {historyAnnotations.length === 0 ? (
                      <p className="px-1 py-2 text-xs text-slate-400">
                        No annotations yet.
                      </p>
                    ) : (
                      historyAnnotations.map((annotation) => {
                        const targets = getAnnotationTargets(annotation);
                        const primaryTarget = targets[0];
                        const annotationName = getAnnotationDisplayName(annotation);

                        return (
                          <button
                            key={annotation.id}
                            onMouseEnter={() =>
                              primaryTarget && previewHistoryAnnotation(primaryTarget.id)
                            }
                            onClick={() => handleAnnotationClick(annotation)}
                            className="w-full rounded-lg border border-slate-100 bg-slate-50 p-2 text-left transition hover:border-slate-200 hover:bg-white"
                          >
                            <p className="text-xs font-semibold leading-5 text-slate-800">
                              {annotationName}
                            </p>

                            <p className="mb-1 text-[11px] font-medium text-slate-400">
                              {targets.length} selected item
                              {targets.length === 1 ? "" : "s"}
                            </p>

                            <div className="space-y-1.5">
                              {targets.slice(0, 3).map((target) =>
                                target.type === "text" ? (
                                  <p
                                    key={target.id}
                                    className="text-xs leading-5 text-slate-600"
                                  >
                                    {shortenTextForDisplay(target.text, 130)}
                                  </p>
                                ) : (
                                  <div key={target.id} className="space-y-1">
                                    <p className="text-xs text-slate-500">
                                      Region on page {target.pageNumber}
                                    </p>

                                    {target.imageDataUrl && (
                                      <img
                                        src={target.imageDataUrl}
                                        alt="Annotated region"
                                        className="max-h-20 rounded border bg-white"
                                      />
                                    )}
                                  </div>
                                )
                              )}
                            </div>
                          </button>
                        );
                      })
                    )}
                  </div>
                )}
              </section>

              <section className="mt-3">
                <button
                  onClick={() =>
                    setHistoryQuestionsExpanded((current) => !current)
                  }
                  className="flex w-full items-center justify-between rounded-md px-1 py-1 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 hover:bg-slate-50"
                >
                  <span>Conversations</span>
                  <span className="text-slate-400">
                    {historyQuestionsExpanded ? "−" : "+"}
                  </span>
                </button>

                {historyQuestionsExpanded && (
                  <div className="mt-1 space-y-1.5">
                    {historyConversations.length === 0 ? (
                      <p className="px-1 py-2 text-xs text-slate-400">
                        No conversations yet.
                      </p>
                    ) : (
                      historyConversations.map((conversation) => (
                        <button
                          key={conversation.id}
                          onClick={() =>
                            handleConversationHistoryClick(conversation)
                          }
                          className="w-full rounded-lg border border-slate-100 bg-slate-50 p-2 text-left transition hover:border-slate-200 hover:bg-white"
                        >
                          <p className="text-xs leading-5 text-slate-700">
                            {shortenTextForDisplay(
                              conversation.turns[0]?.userMessage ||
                                "Conversation",
                              130
                            )}
                          </p>

                          <p className="mt-1 text-[11px] text-slate-400">
                            {conversation.turns.length} message
                            {conversation.turns.length === 1 ? "" : "s"}
                          </p>

                          {conversation.turns.some(
                            (turn) => turn.linkedSelection
                          ) && (
                            <p className="mt-1 text-[11px] text-slate-400">
                              Linked to annotation
                            </p>
                          )}
                        </button>
                      ))
                    )}
                  </div>
                )}
              </section>
            </div>
          )}
        </aside>
            </div>

      <ReaderGuide
        isOpen={isReaderGuideOpen}
        onClose={closeReaderGuide}
        onStepChange={handleReaderGuideStepChange}
      />

      {isReaderProfilePresetPickerOpen && (
        <KnowledgeProfilePresetPicker
          search={readerProfilePresetSearch}
          onSearchChange={setReaderProfilePresetSearch}
          onChoosePreset={chooseReaderProfilePreset}
          onClose={closeReaderProfilePresetPicker}
        />
      )}

      {readerProfileDialogMode && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 p-4"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              closeReaderProfileDialog();
            }
          }}
        >
          <form
            onSubmit={handleReaderProfileDialogSubmit}
            role="dialog"
            aria-modal="true"
            aria-labelledby="reader-profile-dialog-title"
            className="w-full max-w-xl overflow-hidden rounded-xl bg-white shadow-2xl"
          >
            <div className="flex items-start justify-between gap-3 border-b border-slate-200 px-5 py-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Reader profile
                </p>
                <h2
                  id="reader-profile-dialog-title"
                  className="mt-1 text-lg font-semibold text-slate-950"
                >
                  {readerProfileDialogMode === "new"
                    ? "New"
                    : "Edit"}
                </h2>
              </div>

              <button
                type="button"
                onClick={closeReaderProfileDialog}
                disabled={isSavingReaderProfile}
                className="flex h-8 w-8 items-center justify-center rounded-md text-slate-400 transition hover:bg-slate-100 hover:text-slate-800 disabled:opacity-50"
                aria-label="Close profile editor"
              >
                <svg
                  aria-hidden="true"
                  viewBox="0 0 24 24"
                  className="h-4 w-4"
                  fill="none"
                  stroke="currentColor"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                >
                  <path d="M18 6 6 18" />
                  <path d="m6 6 12 12" />
                </svg>
              </button>
            </div>

            <div className="max-h-[72vh] space-y-4 overflow-auto px-5 py-4">
              {readerProfileDialogError && (
                <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                  {readerProfileDialogError}
                </div>
              )}

              <label className="block">
                <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Profile name
                </span>
                <input
                  value={readerProfileDialogName}
                  onChange={(event) => {
                    setReaderProfileDialogName(event.target.value);
                    setReaderProfileDialogError("");
                  }}
                  placeholder={DEFAULT_KNOWLEDGE_PROFILE_NAME}
                  required
                  className="mt-2 h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-slate-400 focus:ring-2 focus:ring-slate-200"
                />
              </label>

              <label className="block">
                <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Brief knowledge description
                </span>
                <textarea
                  value={readerProfileDialogForm.backgroundSummary}
                  onChange={(event) =>
                    updateReaderProfileDialogForm(
                      "backgroundSummary",
                      event.target.value
                    )
                  }
                  rows={4}
                  placeholder={DEFAULT_KNOWLEDGE_DESCRIPTION}
                  className="mt-2 w-full resize-y rounded-md border border-slate-200 bg-white px-3 py-2 text-sm leading-6 text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-slate-400 focus:ring-2 focus:ring-slate-200"
                />
              </label>

              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block">
                  <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Knowledge domains
                  </span>
                  <textarea
                    value={readerProfileDialogForm.knownDomainsText}
                    onChange={(event) =>
                      updateReaderProfileDialogForm(
                        "knownDomainsText",
                        event.target.value
                      )
                    }
                    rows={4}
                    placeholder={"e.g. neuroscience\ne.g. computer science"}
                    className="mt-2 w-full resize-y rounded-md border border-slate-200 bg-white px-3 py-2 text-sm leading-6 text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-slate-400 focus:ring-2 focus:ring-slate-200"
                  />
                </label>

                <label className="block">
                  <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Weak areas
                  </span>
                  <textarea
                    value={readerProfileDialogForm.weakAreasText}
                    onChange={(event) =>
                      updateReaderProfileDialogForm(
                        "weakAreasText",
                        event.target.value
                      )
                    }
                    rows={4}
                    placeholder={"e.g. math\ne.g. probability notation"}
                    className="mt-2 w-full resize-y rounded-md border border-slate-200 bg-white px-3 py-2 text-sm leading-6 text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-slate-400 focus:ring-2 focus:ring-slate-200"
                  />
                </label>
              </div>
            </div>

            <div className="flex items-center justify-between gap-3 border-t border-slate-200 bg-slate-50 px-5 py-3">
              {readerProfileDialogMode === "edit" &&
              readerProfileDialogProfileId ? (
                <button
                  type="button"
                  onClick={handleDeleteReaderProfile}
                  disabled={isSavingReaderProfile || isDeletingReaderProfile}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-red-100 bg-white text-red-500 transition hover:border-red-200 hover:bg-red-50 hover:text-red-700 disabled:cursor-not-allowed disabled:opacity-40"
                  title="Delete profile"
                  aria-label="Delete profile"
                >
                  {isDeletingReaderProfile ? (
                    <span className="h-3.5 w-3.5 animate-spin rounded-full border border-red-200 border-t-red-600" />
                  ) : (
                    <svg
                      aria-hidden="true"
                      viewBox="0 0 24 24"
                      className="h-4 w-4"
                      fill="none"
                      stroke="currentColor"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="1.8"
                    >
                      <path d="M3 6h18" />
                      <path d="M8 6V4h8v2" />
                      <path d="M19 6l-1 14H6L5 6" />
                      <path d="M10 11v5" />
                      <path d="M14 11v5" />
                    </svg>
                  )}
                </button>
              ) : (
                <span />
              )}

              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={closeReaderProfileDialog}
                  disabled={isSavingReaderProfile || isDeletingReaderProfile}
                  className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-50 hover:text-slate-950 disabled:opacity-50"
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  disabled={isSavingReaderProfile || isDeletingReaderProfile}
                  className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-700 disabled:opacity-60"
                >
                  {isSavingReaderProfile
                    ? "Saving..."
                    : readerProfileDialogMode === "new"
                      ? "Create"
                      : "Save"}
                </button>
              </div>
            </div>
          </form>
        </div>
      )}

      {annotationToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl">
            <h2 className="text-lg font-semibold">Delete annotation?</h2>

            <p className="mt-2 text-sm leading-6 text-slate-600">
              This removes this annotation and its saved explanations.
            </p>

            <div className="mt-4 rounded-lg bg-slate-100 p-3 text-xs text-slate-600">
              {annotationToDelete.target.type === "text" ? (
                <p>
                  Text annotation:{" "}
                  {cleanTextForDisplay(annotationToDelete.target.text).slice(
                    0,
                    120
                  )}
                  ...
                </p>
              ) : (
                <p>
                  Region annotation on page{" "}
                  {annotationToDelete.target.pageNumber}
                </p>
              )}
            </div>

            <div className="mt-5 flex justify-end gap-2">
              <button
                onClick={cancelDeleteAnnotation}
                disabled={isDeletingAnnotation}
                className="rounded-lg border px-4 py-2 text-sm font-medium hover:bg-slate-50 disabled:opacity-50"
              >
                Cancel
              </button>

              <button
                onClick={confirmDeleteAnnotation}
                disabled={isDeletingAnnotation}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
              >
                {isDeletingAnnotation ? "Deleting..." : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
