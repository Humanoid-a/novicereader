"use client";

import { AppMenu } from "@/components/AppMenu";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { createId } from "@/lib/id";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import PdfViewer from "@/components/PdfViewer";
import RichAiText from "@/components/RichAiText";
import {
  askAiQuestion,
  createPaperAnnotation,
  deletePaperAnnotationTarget,
  explainFollowUpConcept,
  explainSelection,
  getStoredAuthToken,
  getPaper,
  listPaperAnnotations,
  listPaperConversations,
} from "@/lib/api";
import type { PaperWithUrls } from "@/types/paper";
import type {
  AiAnnotation,
  AnnotationTarget,
  RegionAnnotationTarget,
  SelectionTool,
  TextAnnotationTarget,
} from "@/types/annotation";
import type { QuestionAnswerTurn, QuestionConversation } from "@/types/questions";



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

function getAnnotationMainExplanation(annotation: AiAnnotation) {
  return annotation.explanation?.mainExplanation || annotation.response;
}

function sortAnnotationsNewestFirst(annotations: AiAnnotation[]) {
  return [...annotations].sort(
    (first, second) =>
      new Date(second.createdAt).getTime() - new Date(first.createdAt).getTime()
  );
}

function getAnnotationVersionsForTarget(
  annotations: AiAnnotation[],
  target: AnnotationTarget | null
) {
  if (!target) {
    return [];
  }

  return sortAnnotationsNewestFirst(
    annotations.filter((annotation) => annotation.target.id === target.id)
  );
}

function getNewestAnnotationForTargetId(
  annotations: AiAnnotation[],
  targetId: string
) {
  return sortAnnotationsNewestFirst(
    annotations.filter((annotation) => annotation.target.id === targetId)
  )[0] ?? null;
}

function getNewestAnnotationsByTarget(annotations: AiAnnotation[]) {
  const seenTargetIds = new Set<string>();
  const newestAnnotations: AiAnnotation[] = [];

  for (const annotation of sortAnnotationsNewestFirst(annotations)) {
    if (seenTargetIds.has(annotation.target.id)) {
      continue;
    }

    seenTargetIds.add(annotation.target.id);
    newestAnnotations.push(annotation);
  }

  return newestAnnotations;
}

function getFollowUpResponse(annotation: AiAnnotation | null, concept: string) {
  return (
    annotation?.explanation.followUpExplanations?.find(
      (followUp) => followUp.prompt === concept
    )?.response ?? ""
  );
}

function sortConversationsNewestFirst(conversations: QuestionConversation[]) {
  return [...conversations].sort(
    (first, second) =>
      new Date(second.updatedAt).getTime() - new Date(first.updatedAt).getTime()
  );
}

function LoadingDots() {
  return (
    <div className="flex items-center gap-2 text-sm text-slate-500">
      <div className="h-4 w-4 animate-spin rounded-full border-2 border-slate-300 border-t-slate-900" />
      <span>Generating explanation...</span>
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

function clampPdfZoom(zoom: number) {
  return Math.min(Math.max(zoom, PDF_ZOOM_MIN), PDF_ZOOM_MAX);
}

export default function ReaderPage() {
  const params = useParams<{ paperId: string }>();
  const router = useRouter();
  const paperId = params.paperId;
  const pdfScrollContainerRef = useRef<HTMLElement | null>(null);
  const pdfZoomCommitTimeoutRef = useRef<number | null>(null);
  const pdfGestureStartZoomRef = useRef(1);
  const pdfVisualZoomRef = useRef(1);
  const historyHoverScrollPositionRef = useRef<{
    left: number;
    top: number;
    visualZoom: number;
  } | null>(null);
  const targetRevealNonceRef = useRef(0);

  const [paper, setPaper] = useState<PaperWithUrls | null>(null);
  const [annotations, setAnnotations] = useState<AiAnnotation[]>([]);
  const [pdfCurrentPage, setPdfCurrentPage] = useState(1);
  const [pdfNumPages, setPdfNumPages] = useState(0);
  const [pdfZoom, setPdfZoom] = useState(1);
  const [pdfVisualZoom, setPdfVisualZoom] = useState(1);
  const [targetToReveal, setTargetToReveal] = useState<{
    targetId: string;
    nonce: number;
    behavior?: ScrollBehavior;
    trackVisualPosition?: boolean;
  } | null>(null);

  const [selectionTool, setSelectionTool] = useState<SelectionTool>("highlight");
  const [rightPanelView, setRightPanelView] = useState<
    "annotations" | "history"
  >("annotations");
  const [currentSelection, setCurrentSelection] =
    useState<AnnotationTarget | null>(null);
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

  const [isLoading, setIsLoading] = useState(true);
  const [isExplaining, setIsExplaining] = useState(false);
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
  if (!paperId) {
    return;
  }

  if (!getStoredAuthToken()) {
    router.replace("/login");
    return;
  }



  async function loadPaperWorkspace() {
    try {
      setIsLoading(true);

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
}, [paperId, router]);

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


function requestDeleteSelectedAnnotation() {
  if (!selectedAnnotation) {
    return;
  }

  setAnnotationToDelete(selectedAnnotation);
}

function clearSelection() {
  setCurrentSelection(null);
  setSelectedAnnotation(null);
  setAnnotationToDelete(null);
  setAiResponse("");
  setSelectionExpanded(false);
  setOverlappingTargetIds([]);
  setActiveFollowUpConcept("");
  setExpandedFollowUpConcepts({});
  setFollowUpErrors({});
  setRelatedConversationsExpanded(false);
  setActiveConversation(null);
  setQuestionTurns([]);
}

function clearPendingPdfZoomCommit() {
  if (pdfZoomCommitTimeoutRef.current === null) {
    return;
  }

  window.clearTimeout(pdfZoomCommitTimeoutRef.current);
  pdfZoomCommitTimeoutRef.current = null;
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
    trackVisualPosition: true,
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

function revealCurrentSelection() {
  if (!currentSelection) {
    return;
  }

  targetRevealNonceRef.current += 1;
  setTargetToReveal({
    targetId: currentSelection.id,
    nonce: targetRevealNonceRef.current,
  });
}

async function confirmDeleteAnnotation() {
  if (!paper || !annotationToDelete) {
    return;
  }

  const deletedTargetId = annotationToDelete.target.id;
  const targetIdsInSelection =
    overlappingTargetIds.length > 0 ? overlappingTargetIds : [deletedTargetId];
  const deletedTargetIndex = targetIdsInSelection.indexOf(deletedTargetId);
  const remainingTargetIds = targetIdsInSelection.filter(
    (targetId) => targetId !== deletedTargetId
  );
  const replacementTargetIndex =
    deletedTargetIndex > 0 ? deletedTargetIndex - 1 : 0;
  const replacementTargetId = remainingTargetIds[replacementTargetIndex];
  const replacementAnnotation = replacementTargetId
    ? getNewestAnnotationForTargetId(annotations, replacementTargetId)
    : null;

  try {
    setIsDeletingAnnotation(true);

    await deletePaperAnnotationTarget({
      paperId: paper.id,
      targetId: deletedTargetId,
    });

    setAnnotations((current) =>
      current.filter(
        (annotation) => annotation.target.id !== deletedTargetId
      )
    );

    if (currentSelection?.id === deletedTargetId) {
      if (replacementAnnotation) {
        setSelectedAnnotation(replacementAnnotation);
        setCurrentSelection(replacementAnnotation.target);
        setAiResponse(getAnnotationMainExplanation(replacementAnnotation));
        setOverlappingTargetIds(remainingTargetIds);
        setSelectionExpanded(false);
        setActiveFollowUpConcept("");
        setExpandedFollowUpConcepts({});
        setFollowUpErrors({});
        setQuestionTurns([]);
      } else {
        setSelectedAnnotation(null);
        setCurrentSelection(null);
        setAiResponse("");
        setOverlappingTargetIds([]);
        setActiveFollowUpConcept("");
        setExpandedFollowUpConcepts({});
        setFollowUpErrors({});
        setQuestionTurns([]);
      }
    } else {
      setOverlappingTargetIds(remainingTargetIds);
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

function handleAnnotationClick(annotation: AiAnnotation) {
  setRightPanelView("annotations");
  setCurrentSelection(annotation.target);
  setSelectedAnnotation(annotation);
  setSelectionExpanded(false);
  setAiResponse(getAnnotationMainExplanation(annotation));
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
    setCurrentSelection(null);
    setSelectedAnnotation(null);
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

  setCurrentSelection(linkedSelection.target);
  setSelectedAnnotation(linkedAnnotation);
  setSelectionExpanded(false);
  setOverlappingTargetIds([linkedSelection.annotationTargetId]);
  setAiResponse(
    linkedAnnotation
      ? getAnnotationMainExplanation(linkedAnnotation)
      : linkedSelection.annotationExplanation || ""
  );
}

function closeActiveConversation() {
  setActiveConversation(null);
  setQuestionTurns([]);
}

function toggleConversationCollapsed(conversationId: string) {
  setCollapsedConversationIds((current) => ({
    ...current,
    [conversationId]: !current[conversationId],
  }));
}

function handleAnnotationContextMenu(hitAnnotations: AiAnnotation[]) {
  const sortedHitAnnotations = sortAnnotationsNewestFirst(hitAnnotations);

  setOverlappingTargetIds(
    sortedHitAnnotations.map((annotation) => annotation.target.id)
  );

  if (sortedHitAnnotations[0]) {
    handleAnnotationClick(sortedHitAnnotations[0]);
  }
}

function handleTextSelected(target: TextAnnotationTarget) {
  setCurrentSelection(target);
  setSelectedAnnotation(null);
  setAiResponse("");
  setSelectionExpanded(false);
  setOverlappingTargetIds([]);
  setActiveFollowUpConcept("");
  setExpandedFollowUpConcepts({});
  setActiveConversation(null);
  setQuestionTurns([]);
}


  function handleRegionSelected(region: RegionAnnotationTarget) {
    setCurrentSelection(region);
    setSelectedAnnotation(null);
    setSelectionExpanded(false);
    setOverlappingTargetIds([]);
    setActiveFollowUpConcept("");
    setExpandedFollowUpConcepts({});
    setAiResponse("");
    setActiveConversation(null);
    setQuestionTurns([]);
  }

async function handleExplainSelection() {
  if (!currentSelection || !paper) {
    setAiResponse("Select text or a region from the PDF first.");
    return;
  }

  const explanationPrompt =
    prompt.trim() || "Explain this selection for a beginner.";

  try {
    setIsExplaining(true);
    setActiveFollowUpConcept("");
    setAiResponse("");

    const result = await explainSelection({
  paperId: paper.id,
  target: currentSelection,
  prompt: explanationPrompt,
});

setAiResponse(result.explanation.mainExplanation);

    const annotation: AiAnnotation = {
  id: createId(),
  paperId: paper.id,
  userId: paper.userId,
  target: currentSelection,
  prompt: explanationPrompt,
  response: result.explanation.mainExplanation,
  explanation: result.explanation,
  createdAt: new Date().toISOString(),
};

    try {
      setIsSavingAnnotation(true);

      const savedAnnotation = await createPaperAnnotation(paper.id, annotation);

setAnnotations((current) => [savedAnnotation, ...current]);
setSelectedAnnotation(savedAnnotation);
    } catch (error) {
      console.error(error);
      setAiResponse(
  result.explanation.mainExplanation +
    "\n\nWarning: explanation worked, but saving failed."
);
    } finally {
      setIsSavingAnnotation(false);
    }
  } catch (error) {
    console.error(error);
    setAiResponse(
      "Failed to get explanation. Make sure the backend is running and try again."
    );
  } finally {
    setIsExplaining(false);
  }
}

async function handleExplainRelatedConcept(concept: string) {
  if (!paper || !selectedAnnotation) {
    return;
  }

  if (getFollowUpResponse(selectedAnnotation, concept)) {
    setExpandedFollowUpConcepts((current) => ({
      ...current,
      [concept]: !current[concept],
    }));
    return;
  }

  const previousExplanation = getAnnotationMainExplanation(selectedAnnotation);

  try {
    setActiveFollowUpConcept(concept);

    setFollowUpErrors((current) => {
      const next = { ...current };
      delete next[concept];
      return next;
    });

    const result = await explainFollowUpConcept({
      paperId: paper.id,
      annotationId: selectedAnnotation.id,
      target: selectedAnnotation.target,
      annotationPrompt: selectedAnnotation.prompt,
      annotationExplanation: previousExplanation,
      followUpPoint: concept,
    });

    const updatedAnnotation: AiAnnotation = {
      ...selectedAnnotation,
      explanation: {
        ...selectedAnnotation.explanation,
        followUpExplanations: [
          ...(selectedAnnotation.explanation.followUpExplanations ?? []).filter(
            (followUp) => followUp.id !== result.followUp.id
          ),
          result.followUp,
        ],
      },
    };

    setSelectedAnnotation(updatedAnnotation);
    setAnnotations((current) =>
      current.map((annotation) =>
        annotation.id === updatedAnnotation.id ? updatedAnnotation : annotation
      )
    );
    setExpandedFollowUpConcepts((current) => ({
      ...current,
      [concept]: true,
    }));
  } catch (error) {
    console.error(error);
    setFollowUpErrors((current) => ({
      ...current,
      [concept]: "Failed to explain this follow-up point. Please try again.",
    }));
    setExpandedFollowUpConcepts((current) => ({
      ...current,
      [concept]: true,
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

  try {
    setIsAskingQuestion(true);

    const result = await askAiQuestion({
      paperId: paper.id,
      message: question,
      conversationId: activeConversation?.id ?? null,
      annotationId: selectedAnnotation?.id ?? null,
      target: currentSelection,
      annotationExplanation: selectedAnnotation
        ? getAnnotationMainExplanation(selectedAnnotation)
        : null,
    });

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
              annotationExplanation: selectedAnnotation
                ? getAnnotationMainExplanation(selectedAnnotation)
                : null,
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
  const overlappingTargetAnnotations = overlappingTargetIds
    .map((targetId) => getNewestAnnotationForTargetId(annotations, targetId))
    .filter((annotation): annotation is AiAnnotation => Boolean(annotation));
  const selectedOverlappingTargetIndex = selectedAnnotation
    ? overlappingTargetAnnotations.findIndex(
        (annotation) => annotation.target.id === selectedAnnotation.target.id
      )
    : -1;
  const currentOverlappingTargetIndex =
    selectedOverlappingTargetIndex >= 0 ? selectedOverlappingTargetIndex : 0;
  const selectedAnnotationVersionIndex = selectedAnnotation
    ? selectedAnnotationVersions.findIndex(
        (annotation) => annotation.id === selectedAnnotation.id
      )
    : -1;
  const currentAnnotationVersionIndex =
    selectedAnnotationVersionIndex >= 0 ? selectedAnnotationVersionIndex : 0;
  const relatedConcepts = selectedAnnotation?.explanation.relatedConcepts ?? [];
  const hasQuestionTurns = questionTurns.length > 0;
  const hasAiPanelContent = Boolean(aiResponse) || hasQuestionTurns || isAskingQuestion;
  const historyAnnotations = getNewestAnnotationsByTarget(annotations);
  const historyConversations = sortConversationsNewestFirst(allConversations);
  const relatedConversations =
    currentSelection
      ? historyConversations.filter((conversation) =>
          conversation.turns.some(
            (turn) =>
              turn.linkedSelection?.annotationTargetId === currentSelection.id
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
        </div>

        <Link
          href="/"
          className="justify-self-end rounded-md border px-3 py-1.5 text-xs hover:bg-slate-50"
        >
          Upload another PDF
        </Link>
      </header>

      <div className="relative grid h-[calc(100vh-49px)] grid-cols-[minmax(0,1fr)_305px] gap-3 p-3">
       <section
         ref={pdfScrollContainerRef}
         className="min-w-0 overflow-auto rounded-2xl bg-slate-200 p-2 shadow-sm"
       >
         <PdfViewer
  fileUrl={paper.fileUrl}
  selectionTool={selectionTool}
  annotations={annotations}
  zoom={pdfZoom}
  visualZoom={pdfVisualZoom}
  targetToReveal={targetToReveal}
  currentSelection={currentSelection}
  onPageStatusChange={handlePdfPageStatusChange}
  onTextSelected={handleTextSelected}
  onRegionSelected={handleRegionSelected}
  onAnnotationContextMenu={handleAnnotationContextMenu}
  onAnnotationContextMenuEmpty={clearSelection}
/>
        </section>

        <div className="pointer-events-none absolute right-[329px] top-5 z-20">
          <div className="pointer-events-auto flex flex-col gap-1 rounded-lg border border-slate-200 bg-white/95 p-1 shadow-sm backdrop-blur">
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

        <aside className="flex min-h-0 w-[305px] flex-col overflow-hidden rounded-2xl bg-white shadow-sm">
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
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden p-2">
            <section>
             <div className="mb-2 flex items-center justify-between gap-2">
  <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
    Selection
  </h2>

  <div className="flex items-center gap-2">
    {overlappingTargetAnnotations.length > 1 && (
      <div className="flex items-center gap-1 text-[11px] text-slate-400">
        <button
          onClick={() => {
            const previousAnnotation =
              overlappingTargetAnnotations[currentOverlappingTargetIndex - 1];

            if (previousAnnotation) {
              handleAnnotationClick(previousAnnotation);
            }
          }}
          disabled={currentOverlappingTargetIndex <= 0}
          className="rounded px-1 py-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:pointer-events-none disabled:opacity-25"
          aria-label="Previous selected annotation"
        >
          {"<"}
        </button>

        <span className="min-w-8 text-center tabular-nums text-slate-500">
          {currentOverlappingTargetIndex + 1}/{overlappingTargetAnnotations.length}
        </span>

        <button
          onClick={() => {
            const nextAnnotation =
              overlappingTargetAnnotations[currentOverlappingTargetIndex + 1];

            if (nextAnnotation) {
              handleAnnotationClick(nextAnnotation);
            }
          }}
          disabled={
            currentOverlappingTargetIndex >=
            overlappingTargetAnnotations.length - 1
          }
          className="rounded px-1 py-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:pointer-events-none disabled:opacity-25"
          aria-label="Next selected annotation"
        >
          {">"}
        </button>
      </div>
    )}

    {currentSelection && (
      <button
        onClick={revealCurrentSelection}
        className="inline-flex h-6 w-6 items-center justify-center rounded-md text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
        title="Jump to selection in PDF"
        aria-label="Jump to selection in PDF"
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
          <path d="M12 21s7-5.2 7-11a7 7 0 0 0-14 0c0 5.8 7 11 7 11z" />
          <circle cx="12" cy="10" r="2.5" />
        </svg>
      </button>
    )}

    {selectedAnnotation && (
      <button
        onClick={requestDeleteSelectedAnnotation}
        className="inline-flex h-6 w-6 items-center justify-center rounded-md text-slate-400 transition hover:bg-red-50 hover:text-red-600"
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

    {currentSelection?.type === "text" &&
      currentSelection.text.length > 260 && (
        <button
          onClick={() => setSelectionExpanded((current) => !current)}
          className="text-xs font-medium text-slate-500 hover:text-slate-900"
        >
          {selectionExpanded ? "Collapse" : "Expand"}
        </button>
      )}
  </div>
</div>

              <div
  className={`rounded-lg bg-slate-100 p-2 text-xs leading-5 text-slate-700 ${
    selectionExpanded ? "max-h-40" : "max-h-20"
  } overflow-auto`}
>
                {currentSelection?.type === "text" &&
  (selectionExpanded
    ? cleanTextForDisplay(currentSelection.text)
    : shortenTextForDisplay(currentSelection.text))}

                {currentSelection?.type === "region" && (
                  <div className="space-y-2">
                    <p className="text-xs">Region selected on page {currentSelection.pageNumber}.</p>

                    {currentSelection.imageDataUrl && (
                      <img
                        src={currentSelection.imageDataUrl}
                        alt="Selected PDF region"
                        className="max-h-20 rounded-md border bg-white"
                        />
                    )}
                  </div>
                )}

                {!currentSelection &&
                  (selectionTool === "highlight"
                    ? "No text selected yet."
                    : "No region selected yet.")}
              </div>

            <button
  onClick={handleExplainSelection}
  disabled={!currentSelection || isExplaining || isSavingAnnotation}
  className="mt-2 w-full rounded-lg bg-slate-900 px-3 py-2 text-xs font-medium text-white hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-40"
>
  {isExplaining
    ? "Explaining..."
    : isSavingAnnotation
      ? "Saving..."
      : "Explain selection"}
</button>
            </section>

            <section className="mt-3 flex min-h-0 flex-1 flex-col">
              <div className="mb-2 flex items-center justify-between gap-2">
                <h2 className="text-sm font-semibold">AI response</h2>

                <div className="flex min-w-0 items-center gap-2">
                  {selectedAnnotationVersions.length > 1 && (
                    <div className="flex items-center gap-1 text-[11px] text-slate-400">
                      <button
                        onClick={() => {
                          const previousAnnotation =
                            selectedAnnotationVersions[
                              currentAnnotationVersionIndex - 1
                            ];

                          if (previousAnnotation) {
                            handleAnnotationClick(previousAnnotation);
                          }
                        }}
                        disabled={currentAnnotationVersionIndex <= 0}
                        className="rounded px-1 py-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:pointer-events-none disabled:opacity-25"
                        aria-label="Previous explanation version"
                      >
                        {"<"}
                      </button>

                      <span className="min-w-8 text-center tabular-nums text-slate-500">
                        {currentAnnotationVersionIndex + 1}/
                        {selectedAnnotationVersions.length}
                      </span>

                      <button
                        onClick={() => {
                          const nextAnnotation =
                            selectedAnnotationVersions[
                              currentAnnotationVersionIndex + 1
                            ];

                          if (nextAnnotation) {
                            handleAnnotationClick(nextAnnotation);
                          }
                        }}
                        disabled={
                          currentAnnotationVersionIndex >=
                          selectedAnnotationVersions.length - 1
                        }
                        className="rounded px-1 py-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:pointer-events-none disabled:opacity-25"
                        aria-label="Next explanation version"
                      >
                        {">"}
                      </button>
                    </div>
                  )}

                  <span className="whitespace-nowrap text-xs text-slate-400">
                    {annotations.length} saved
                  </span>
                </div>
              </div>

              <div className="min-h-0 flex-1 overflow-auto rounded-lg bg-slate-100 p-3 text-sm leading-6 text-slate-700">
  {isExplaining ? (
    <LoadingDots />
  ) : hasAiPanelContent ? (
    <div className="space-y-3">
      {aiResponse && (
        <section>
          <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
            Explanation
          </h3>

          <RichAiText text={aiResponse} />
        </section>
      )}

      {relatedConcepts.length > 0 && (
        <section>
          <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
            Explore
          </h3>

          <div className="flex flex-wrap gap-1.5">
            {relatedConcepts.map((concept) => (
              <div key={concept} className="w-full">
                <button
                  onClick={() => handleExplainRelatedConcept(concept)}
                  disabled={Boolean(activeFollowUpConcept)}
                  className="w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-left text-xs leading-4 text-slate-600 transition hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-50"
                >
                    <span className="flex items-center justify-between gap-2">
                      <span>{concept}</span>
                      <span className="shrink-0 text-slate-400">
                      {activeFollowUpConcept === concept ? (
                        <span className="block h-3 w-3 animate-spin rounded-full border border-slate-300 border-t-slate-700" />
                      ) : expandedFollowUpConcepts[concept] ? (
                        "−"
                      ) : (
                        "+"
                      )}
                    </span>
                  </span>
                </button>

                {expandedFollowUpConcepts[concept] &&
                  (getFollowUpResponse(selectedAnnotation, concept) ||
                    followUpErrors[concept]) && (
                    <div className="mt-1 rounded-lg border-l-2 border-slate-200 bg-white px-3 py-2 text-xs leading-5 text-slate-600">
                      <div className="flex items-start justify-between gap-2">
                        <RichAiText
                          text={
                            getFollowUpResponse(selectedAnnotation, concept) ||
                            followUpErrors[concept]
                          }
                        />

                        <button
                          onClick={() =>
                            setExpandedFollowUpConcepts((current) => ({
                              ...current,
                              [concept]: false,
                            }))
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
            ))}
          </div>
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

          <div className="border-t bg-white p-2">
            {activeConversation ? (
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
            ) : currentSelection ? (
              <div className="mb-2 rounded-lg border-l-2 border-slate-300 bg-slate-50 px-2 py-1.5 text-xs text-slate-500">
                <div className="mb-1 flex items-center justify-between gap-2">
                  <span className="font-medium text-slate-600">
                    Included annotation
                  </span>
                  <div className="flex items-center gap-1">
                    {selectedAnnotation && (
                      <span className="shrink-0 text-[10px] uppercase tracking-wide text-slate-400">
                        explanation included
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

                {currentSelection.type === "text" ? (
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

            <label className="block">
              <span className="mb-1 block text-xs font-medium text-slate-500">
                Ask
                </span>

              <textarea
                value={prompt}
                onFocus={() => setPromptFocused(true)}
                onBlur={() => setPromptFocused(false)}
                onChange={(event) => setPrompt(event.target.value)}
                placeholder="Ask about the selected content..."
                className={`w-full resize-none rounded-lg border p-2 text-sm outline-none transition-all focus:ring-2 focus:ring-slate-300 ${
  shouldExpandPrompt ? "h-24" : "h-10"
}`}
              />
            </label>

            <button
              onClick={handleAskAi}
              disabled={isExplaining || isAskingQuestion}
              className="mt-2 w-full rounded-lg bg-slate-900 px-3 py-2 text-xs font-medium text-white hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {isAskingQuestion ? "Asking..." : "Ask AI"}
            </button>
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
                      historyAnnotations.map((annotation) => (
                        <button
                          key={annotation.target.id}
                          onMouseEnter={() =>
                            previewHistoryAnnotation(annotation.target.id)
                          }
                          onClick={() => handleAnnotationClick(annotation)}
                          className="w-full rounded-lg border border-slate-100 bg-slate-50 p-2 text-left transition hover:border-slate-200 hover:bg-white"
                        >
                          {annotation.target.type === "text" ? (
                            <p className="text-xs leading-5 text-slate-600">
                              {shortenTextForDisplay(
                                annotation.target.text,
                                130
                              )}
                            </p>
                          ) : (
                            <div className="space-y-1.5">
                              <p className="text-xs text-slate-500">
                                Region on page {annotation.target.pageNumber}
                              </p>

                              {annotation.target.imageDataUrl && (
                                <img
                                  src={annotation.target.imageDataUrl}
                                  alt="Annotated region"
                                  className="max-h-20 rounded border bg-white"
                                />
                              )}
                            </div>
                          )}
                        </button>
                      ))
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

      {annotationToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl">
            <h2 className="text-lg font-semibold">Delete highlighted area?</h2>

            <p className="mt-2 text-sm leading-6 text-slate-600">
              This will remove the highlighted or cropped area and every saved
              explanation version attached to it. This action cannot be undone.
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
