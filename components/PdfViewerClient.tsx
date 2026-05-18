"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import type {
  AiAnnotation,
  AnnotationTarget,
  RegionAnnotationTarget,
  SelectionTool,
  TextAnnotationTarget,
} from "@/types/annotation";

import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";
import { createId } from "@/lib/id";
import { getStoredAuthToken } from "@/lib/api";

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  "react-pdf/node_modules/pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url
).toString();

type PdfViewerClientProps = {
  fileUrl: string;
  selectionTool: SelectionTool;
  annotations: AiAnnotation[];
  zoom: number;
  visualZoom: number;
  targetToReveal?: {
    targetId: string;
    nonce: number;
    behavior?: ScrollBehavior;
    animation?: "fast";
    trackVisualPosition?: boolean;
  } | null;
  currentSelection?: TextAnnotationTarget | RegionAnnotationTarget | null;
  currentSelectionTargets?: (TextAnnotationTarget | RegionAnnotationTarget)[];
  onPageStatusChange: (status: { currentPage: number; numPages: number }) => void;
  onTextSelected: (target: TextAnnotationTarget, append: boolean) => void;
  onRegionSelected: (region: RegionAnnotationTarget, append: boolean) => void;
  onAnnotationContextMenu: (annotations: AiAnnotation[], append: boolean) => void;
  onSelectionContextMenu: (targets: AnnotationTarget[], append: boolean) => void;
  onAnnotationContextMenuEmpty: () => void;
};

type DraftRegion = {
  pageNumber: number;
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
};

const EMPTY_SELECTION_TARGETS: (TextAnnotationTarget | RegionAnnotationTarget)[] =
  [];


function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function easeOutCubic(progress: number) {
  return 1 - Math.pow(1 - progress, 3);
}

function getFastScrollDuration(distance: number) {
  return Math.min(Math.max(distance / 6, 120), 220);
}

function getPdfFetchUrl(fileUrl: string) {
  const token = getStoredAuthToken();

  if (!token) {
    return fileUrl;
  }

  const url = new URL(fileUrl, window.location.href);

  if (url.pathname.startsWith("/api/papers/")) {
    url.searchParams.set("access_token", token);
  }

  return url.toString();
}

function mergeTextSelectionChunks(
  chunks: TextAnnotationTarget["chunks"]
): TextAnnotationTarget["chunks"] {
  const mergedChunks: TextAnnotationTarget["chunks"] = [];

  const copiedChunks = chunks.map((chunk) => ({
    ...chunk,
    rect: { ...chunk.rect },
  }));

  for (const chunk of copiedChunks.sort((first, second) => {
    if (first.pageNumber !== second.pageNumber) {
      return first.pageNumber - second.pageNumber;
    }

    if (Math.abs(first.rect.y - second.rect.y) > 0.001) {
      return first.rect.y - second.rect.y;
    }

    return first.rect.x - second.rect.x;
  })) {
    const chunkCenterY = chunk.rect.y + chunk.rect.height / 2;
    const matchingLine = mergedChunks.find((mergedChunk) => {
      if (mergedChunk.pageNumber !== chunk.pageNumber) {
        return false;
      }

      const mergedCenterY = mergedChunk.rect.y + mergedChunk.rect.height / 2;
      const lineTolerance =
        Math.max(mergedChunk.rect.height, chunk.rect.height) * 0.55;

      return Math.abs(mergedCenterY - chunkCenterY) <= lineTolerance;
    });

    if (!matchingLine) {
      mergedChunks.push(chunk);
      continue;
    }

    const left = Math.min(matchingLine.rect.x, chunk.rect.x);
    const top = Math.min(matchingLine.rect.y, chunk.rect.y);
    const right = Math.max(
      matchingLine.rect.x + matchingLine.rect.width,
      chunk.rect.x + chunk.rect.width
    );
    const bottom = Math.max(
      matchingLine.rect.y + matchingLine.rect.height,
      chunk.rect.y + chunk.rect.height
    );

    matchingLine.rect = {
      pageNumber: matchingLine.pageNumber,
      x: left,
      y: top,
      width: right - left,
      height: bottom - top,
    };
  }

  return mergedChunks;
}

function getTextChunkBounds(chunks: TextAnnotationTarget["chunks"]) {
  if (chunks.length === 0) {
    return null;
  }

  const left = Math.min(...chunks.map((chunk) => chunk.rect.x));
  const top = Math.min(...chunks.map((chunk) => chunk.rect.y));
  const right = Math.max(
    ...chunks.map((chunk) => chunk.rect.x + chunk.rect.width)
  );
  const bottom = Math.max(
    ...chunks.map((chunk) => chunk.rect.y + chunk.rect.height)
  );

  return {
    x: left,
    y: top,
    width: right - left,
    height: bottom - top,
  };
}

function getTextHighlightChunks(
  chunks: TextAnnotationTarget["chunks"]
): TextAnnotationTarget["chunks"] {
  const sortedChunks = chunks
    .map((chunk) => ({
      ...chunk,
      rect: { ...chunk.rect },
    }))
    .sort((first, second) => {
      const firstCenterY = first.rect.y + first.rect.height / 2;
      const secondCenterY = second.rect.y + second.rect.height / 2;

      if (Math.abs(firstCenterY - secondCenterY) > 0.001) {
        return firstCenterY - secondCenterY;
      }

      return first.rect.x - second.rect.x;
    });

  if (sortedChunks.length < 2) {
    return sortedChunks;
  }

  const sortedHeights = sortedChunks
    .map((chunk) => chunk.rect.height)
    .filter((height) => height > 0)
    .sort((first, second) => first - second);
  const medianHeight =
    sortedHeights[Math.floor(sortedHeights.length / 2)] ?? 0;
  const verticalPadding = Math.min(medianHeight * 0.08, 0.002);
  const closeLineGapLimit = medianHeight * 0.7;
  const lineMetrics = sortedChunks.map((chunk) => {
    const top = chunk.rect.y;
    const bottom = chunk.rect.y + chunk.rect.height;

    return {
      top,
      bottom,
      center: top + chunk.rect.height / 2,
      height: chunk.rect.height,
    };
  });

  return sortedChunks.map((chunk, index) => {
    const current = lineMetrics[index];
    const previous = lineMetrics[index - 1];
    const next = lineMetrics[index + 1];
    const previousBoundary = previous
      ? (previous.center + current.center) / 2
      : null;
    const nextBoundary = next ? (current.center + next.center) / 2 : null;
    const previousGap = previous ? current.top - previous.bottom : Infinity;
    const nextGap = next ? next.top - current.bottom : Infinity;
    let top = Math.max(0, current.top - verticalPadding);
    let bottom = Math.min(1, current.bottom + verticalPadding);

    if (previousBoundary !== null) {
      top =
        previousGap <= closeLineGapLimit
          ? previousBoundary
          : Math.max(top, Math.min(previousBoundary, current.center));
    }

    if (nextBoundary !== null) {
      bottom =
        nextGap <= closeLineGapLimit
          ? nextBoundary
          : Math.min(bottom, Math.max(nextBoundary, current.center));
    }

    if (bottom <= top) {
      const safeHalfHeight = Math.max(current.height * 0.35, 0.0001);
      const minTop = previousBoundary ?? 0;
      const maxBottom = nextBoundary ?? 1;

      top = clamp(current.center - safeHalfHeight, minTop, current.center);
      bottom = clamp(current.center + safeHalfHeight, current.center, maxBottom);
    }

    return {
      ...chunk,
      rect: {
        ...chunk.rect,
        y: top,
        height: Math.max(bottom - top, 0),
      },
    };
  });
}

function getAnnotationTargets(
  annotation: AiAnnotation
): (TextAnnotationTarget | RegionAnnotationTarget)[] {
  return annotation.targets?.length ? annotation.targets : [annotation.target];
}

function getTextChunksForPage(annotation: AiAnnotation, pageNumber: number) {
  if (annotation.target.type !== "text") {
    return [];
  }

  return mergeTextSelectionChunks(
    (annotation.target.chunks ?? []).filter(
      (chunk) => chunk.pageNumber === pageNumber
    )
  );
}

function getAnnotationBoundsForPage(
  annotation: AiAnnotation,
  pageNumber: number
) {
  if (annotation.target.type === "region") {
    if (annotation.target.pageNumber !== pageNumber) {
      return null;
    }

    return annotation.target.rect;
  }

  return getTextChunkBounds(getTextChunksForPage(annotation, pageNumber));
}

function getTargetBoundsForPage(
  target: TextAnnotationTarget | RegionAnnotationTarget,
  pageNumber: number
) {
  if (target.type === "region") {
    return target.pageNumber === pageNumber ? target.rect : null;
  }

  return getTextChunkBounds(
    mergeTextSelectionChunks(
      (target.chunks ?? []).filter((chunk) => chunk.pageNumber === pageNumber)
    )
  );
}

function rectContainsPoint(
  rect: { x: number; y: number; width: number; height: number },
  point: { x: number; y: number }
) {
  return (
    point.x >= rect.x &&
    point.x <= rect.x + rect.width &&
    point.y >= rect.y &&
    point.y <= rect.y + rect.height
  );
}

function rectsOverlap(
  first: { x: number; y: number; width: number; height: number },
  second: { x: number; y: number; width: number; height: number }
) {
  return (
    first.x < second.x + second.width &&
    first.x + first.width > second.x &&
    first.y < second.y + second.height &&
    first.y + first.height > second.y
  );
}

function getAnnotationOverlapCount(
  annotations: AiAnnotation[],
  annotation: AiAnnotation,
  pageNumber: number
) {
  const bounds = getAnnotationBoundsForPage(annotation, pageNumber);

  if (!bounds) {
    return 0;
  }

  return annotations.filter((otherAnnotation) => {
    if (otherAnnotation.target.id === annotation.target.id) {
      return true;
    }

    const otherBounds = getAnnotationBoundsForPage(otherAnnotation, pageNumber);

    return otherBounds ? rectsOverlap(bounds, otherBounds) : false;
  }).length;
}

function getHitAnnotationTargets(
  annotations: AiAnnotation[],
  pageNumber: number,
  point: { x: number; y: number }
) {
  return annotations
    .filter((annotation) => {
      const bounds = getAnnotationBoundsForPage(annotation, pageNumber);

      return bounds ? rectContainsPoint(bounds, point) : false;
    })
    .sort(
      (first, second) =>
        getAnnotationCreatedAtMs(second) - getAnnotationCreatedAtMs(first)
    );
}

function getHitSelectionTargets(
  targets: (TextAnnotationTarget | RegionAnnotationTarget)[],
  pageNumber: number,
  point: { x: number; y: number }
) {
  return targets
    .filter((target) => {
      const bounds = getTargetBoundsForPage(target, pageNumber);

      return bounds ? rectContainsPoint(bounds, point) : false;
    })
    .sort((first, second) => {
      const firstTimestamp = new Date(first.createdAt).getTime();
      const secondTimestamp = new Date(second.createdAt).getTime();

      return (
        (Number.isFinite(secondTimestamp) ? secondTimestamp : 0) -
        (Number.isFinite(firstTimestamp) ? firstTimestamp : 0)
      );
    });
}

function areSameIds(first: string[], second: string[]) {
  return (
    first.length === second.length &&
    first.every((value, index) => value === second[index])
  );
}

function findScrollableParent(element: HTMLElement) {
  let currentElement = element.parentElement;

  while (currentElement) {
    const style = window.getComputedStyle(currentElement);
    const canScrollY =
      style.overflowY === "auto" || style.overflowY === "scroll";

    if (canScrollY && currentElement.scrollHeight > currentElement.clientHeight) {
      return currentElement;
    }

    currentElement = currentElement.parentElement;
  }

  return null;
}

function getAnchorFromEvent(event: React.MouseEvent) {
  if (!(event.target instanceof Element)) {
    return null;
  }

  const anchor = event.target.closest("a");

  return anchor instanceof HTMLAnchorElement ? anchor : null;
}

function isInternalPdfLink(anchor: HTMLAnchorElement, fileUrl: string) {
  const href = anchor.getAttribute("href");

  if (!href || href.startsWith("#")) {
    return true;
  }

  try {
    const linkUrl = new URL(anchor.href);
    const pdfUrl = new URL(fileUrl, window.location.href);
    const currentUrl = new URL(window.location.href);

    const pointsToPdfFile =
      linkUrl.origin === pdfUrl.origin && linkUrl.pathname === pdfUrl.pathname;
    const pointsToCurrentPage =
      linkUrl.origin === currentUrl.origin &&
      linkUrl.pathname === currentUrl.pathname;

    return Boolean(linkUrl.hash && (pointsToPdfFile || pointsToCurrentPage));
  } catch {
    return false;
  }
}

function isExternalWebLink(anchor: HTMLAnchorElement, fileUrl: string) {
  if (isInternalPdfLink(anchor, fileUrl)) {
    return false;
  }

  try {
    const linkUrl = new URL(anchor.href);

    return linkUrl.protocol === "http:" || linkUrl.protocol === "https:";
  } catch {
    return false;
  }
}

function getInternalPdfPageNumber(anchor: HTMLAnchorElement, fileUrl: string) {
  if (!isInternalPdfLink(anchor, fileUrl)) {
    return null;
  }

  const href = anchor.getAttribute("href") ?? "";

  try {
    const hash = href.startsWith("#")
      ? href
      : new URL(anchor.href, window.location.href).hash;
    const pageMatch = hash.match(/[?&#]page=(\d+)/);

    if (!pageMatch) {
      return null;
    }

    const pageNumber = Number(pageMatch[1]);

    return Number.isInteger(pageNumber) && pageNumber > 0 ? pageNumber : null;
  } catch {
    return null;
  }
}

function getAnnotationCreatedAtMs(annotation: AiAnnotation) {
  const timestamp = new Date(annotation.createdAt).getTime();

  return Number.isFinite(timestamp) ? timestamp : 0;
}

function getNewestAnnotationsForTargets(annotations: AiAnnotation[]) {
  const newestAnnotationsByTarget = new Map<string, AiAnnotation>();

  for (const annotation of annotations) {
    for (const target of getAnnotationTargets(annotation)) {
      const existingAnnotation = newestAnnotationsByTarget.get(target.id);

      if (
        !existingAnnotation ||
        getAnnotationCreatedAtMs(annotation) >
          getAnnotationCreatedAtMs(existingAnnotation)
      ) {
        newestAnnotationsByTarget.set(target.id, {
          ...annotation,
          target,
          targets: getAnnotationTargets(annotation),
        });
      }
    }
  }

  return Array.from(newestAnnotationsByTarget.values());
}

function getAnnotationTargetInstances(annotations: AiAnnotation[]) {
  return annotations.flatMap((annotation) =>
    getAnnotationTargets(annotation).map((target) => ({
      ...annotation,
      target,
      targets: getAnnotationTargets(annotation),
    }))
  );
}

function uniqueIds(ids: string[]) {
  return Array.from(new Set(ids));
}

export default function PdfViewerClient({
  fileUrl,
  selectionTool,
  annotations,
  zoom,
  visualZoom,
  targetToReveal,
  currentSelection,
  currentSelectionTargets = EMPTY_SELECTION_TARGETS,
  onPageStatusChange,
  onTextSelected,
  onRegionSelected,
  onAnnotationContextMenu,
  onSelectionContextMenu,
  onAnnotationContextMenuEmpty,
}: PdfViewerClientProps) {
  const [numPages, setNumPages] = useState<number>(0);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [draftRegion, setDraftRegion] = useState<DraftRegion | null>(null);
  const [resolvedPdfUrl, setResolvedPdfUrl] = useState<string | null>(null);
  const [pdfFetchError, setPdfFetchError] = useState("");
  const [hoveredAnnotationTargetIds, setHoveredAnnotationTargetIds] = useState<
    string[]
  >([]);

  const pageRefs = useRef<Record<number, HTMLDivElement | null>>({});
  const lastRevealKeyRef = useRef<string | null>(null);
  const revealAnimationFrameRef = useRef<number | null>(null);
  const visiblePageRatios = useRef<Record<number, number>>({});
  const pendingTextSelectionAppendRef = useRef(false);

  useEffect(() => {
    let isActive = true;
    let objectUrl: string | null = null;

    setResolvedPdfUrl(null);
    setPdfFetchError("");

    if (fileUrl.startsWith("blob:") || fileUrl.startsWith("data:")) {
      setResolvedPdfUrl(fileUrl);
      return () => {
        isActive = false;
      };
    }

    async function fetchPdf() {
      try {
        const pdfFetchUrl = getPdfFetchUrl(fileUrl);
        const response = await fetch(pdfFetchUrl);

        if (!response.ok) {
          throw new Error(`PDF request failed with status ${response.status}`);
        }

        const blob = await response.blob();
        objectUrl = URL.createObjectURL(blob);

        if (isActive) {
          setResolvedPdfUrl(objectUrl);
        }
      } catch (error) {
        console.error("Failed to fetch PDF", {
          fileUrl,
          pdfFetchUrl: getPdfFetchUrl(fileUrl),
          error,
        });

        if (isActive) {
          setPdfFetchError("Failed to load PDF file.");
        }
      }
    }

    fetchPdf();

    return () => {
      isActive = false;

      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
    };
  }, [fileUrl]);

  function cancelRevealAnimation() {
    if (revealAnimationFrameRef.current === null) {
      return;
    }

    window.cancelAnimationFrame(revealAnimationFrameRef.current);
    revealAnimationFrameRef.current = null;
  }

  function scrollToDisplayedTarget(
    scrollContainer: HTMLElement,
    targetScrollPosition: { left: number; top: number },
    targetAnimation: "fast" | undefined,
    targetBehavior: ScrollBehavior | undefined
  ) {
    cancelRevealAnimation();

    const maxLeft = Math.max(
      scrollContainer.scrollWidth - scrollContainer.clientWidth,
      0
    );
    const maxTop = Math.max(
      scrollContainer.scrollHeight - scrollContainer.clientHeight,
      0
    );
    const nextLeft = clamp(targetScrollPosition.left, 0, maxLeft);
    const nextTop = clamp(targetScrollPosition.top, 0, maxTop);

    if (targetAnimation !== "fast") {
      scrollContainer.scrollTo({
        left: nextLeft,
        top: nextTop,
        behavior: targetBehavior ?? "smooth",
      });
      return;
    }

    const startLeft = scrollContainer.scrollLeft;
    const startTop = scrollContainer.scrollTop;
    const deltaLeft = nextLeft - startLeft;
    const deltaTop = nextTop - startTop;
    const distance = Math.hypot(deltaLeft, deltaTop);

    if (distance < 1) {
      return;
    }

    const duration = getFastScrollDuration(distance);
    const startTime = window.performance.now();

    function animateScroll(now: number) {
      const progress = clamp((now - startTime) / duration, 0, 1);
      const easedProgress = easeOutCubic(progress);

      scrollContainer.scrollLeft = startLeft + deltaLeft * easedProgress;
      scrollContainer.scrollTop = startTop + deltaTop * easedProgress;

      if (progress < 1) {
        revealAnimationFrameRef.current =
          window.requestAnimationFrame(animateScroll);
      } else {
        revealAnimationFrameRef.current = null;
      }
    }

    revealAnimationFrameRef.current =
      window.requestAnimationFrame(animateScroll);
  }

  useEffect(() => {
    if (numPages === 0 || typeof IntersectionObserver === "undefined") {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const pageNumber = Number(
            (entry.target as HTMLElement).dataset.pageNumber
          );

          if (!pageNumber) {
            continue;
          }

          visiblePageRatios.current[pageNumber] = entry.isIntersecting
            ? entry.intersectionRatio
            : 0;
        }

        const mostVisiblePage = Object.entries(visiblePageRatios.current)
          .sort((first, second) => second[1] - first[1])
          .find((entry) => entry[1] > 0);

        if (mostVisiblePage) {
          setCurrentPage(Number(mostVisiblePage[0]));
        }
      },
      {
        threshold: [0, 0.15, 0.3, 0.45, 0.6, 0.75, 0.9, 1],
      }
    );

    Object.values(pageRefs.current).forEach((pageElement) => {
      if (pageElement) {
        observer.observe(pageElement);
      }
    });

    return () => observer.disconnect();
  }, [numPages]);

  useEffect(() => {
    onPageStatusChange({ currentPage, numPages });
  }, [currentPage, numPages, onPageStatusChange]);

  useEffect(() => {
    if (!targetToReveal) {
      cancelRevealAnimation();
      lastRevealKeyRef.current = null;
      return;
    }

    const revealKey = `${targetToReveal.targetId}:${targetToReveal.nonce}`;

    if (
      !targetToReveal.trackVisualPosition &&
      lastRevealKeyRef.current === revealKey
    ) {
      return;
    }

    lastRevealKeyRef.current = revealKey;

    const annotation = annotations.find((annotation) =>
      getAnnotationTargets(annotation).some(
        (target) => target.id === targetToReveal.targetId
      )
    );
    const annotationTarget = annotation
      ? getAnnotationTargets(annotation).find(
          (target) => target.id === targetToReveal.targetId
        )
      : null;
    const activeSelectionTarget = currentSelectionTargets.find(
      (target) => target.id === targetToReveal.targetId
    );
    const target =
      annotationTarget
        ? annotationTarget
        : activeSelectionTarget ??
          (currentSelection?.id === targetToReveal.targetId
            ? currentSelection
            : null);

    if (!target) {
      return;
    }

    const pageNumber =
      target.type === "region" ? target.pageNumber : target.chunks[0]?.pageNumber;

    if (!pageNumber) {
      return;
    }

    const pageElement = pageRefs.current[pageNumber];

    if (!pageElement) {
      return;
    }

    const bounds =
      annotation && annotationTarget
        ? getTargetBoundsForPage(annotationTarget, pageNumber)
        : getTargetBoundsForPage(target, pageNumber);
    const scrollContainer = findScrollableParent(pageElement);

    if (!bounds || !scrollContainer) {
      pageElement.scrollIntoView({
        behavior:
          targetToReveal.animation === "fast"
            ? "smooth"
            : (targetToReveal.behavior ?? "smooth"),
        block: "center",
      });
      return;
    }

    const pageRect = pageElement.getBoundingClientRect();
    const scrollContainerRect = scrollContainer.getBoundingClientRect();
    const targetCenterX =
      scrollContainer.scrollLeft +
      pageRect.left -
      scrollContainerRect.left +
      (bounds.x + bounds.width / 2) * pageRect.width;
    const targetCenterY =
      scrollContainer.scrollTop +
      pageRect.top -
      scrollContainerRect.top +
      (bounds.y + bounds.height / 2) * pageRect.height;

    scrollToDisplayedTarget(
      scrollContainer,
      {
        left: targetCenterX - scrollContainer.clientWidth * 0.5,
        top: targetCenterY - scrollContainer.clientHeight * 0.38,
      },
      targetToReveal.animation,
      targetToReveal.behavior
    );
  }, [
    annotations,
    currentSelection,
    currentSelectionTargets,
    targetToReveal,
    visualZoom,
  ]);

  function handleTextMouseDown(event: React.MouseEvent) {
    if (selectionTool !== "highlight" || event.button !== 0) {
      return;
    }

    pendingTextSelectionAppendRef.current = event.shiftKey;

    if (event.shiftKey) {
      window.getSelection()?.removeAllRanges();
    }
  }

  function handleTextMouseUp(event: React.MouseEvent) {
  const shouldAppend = pendingTextSelectionAppendRef.current || event.shiftKey;
  pendingTextSelectionAppendRef.current = false;

  if (selectionTool !== "highlight") {
    return;
  }

  if (event.button !== 0) {
    return;
  }

  const selection = window.getSelection();

  if (!selection || selection.rangeCount === 0) {
    return;
  }

  const selectedText = selection.toString().trim();

  if (!selectedText) {
    return;
  }

  const range = selection.getRangeAt(0);
  const clientRects = Array.from(range.getClientRects());

  const chunks: TextAnnotationTarget["chunks"] = [];

  for (const clientRect of clientRects) {
    if (clientRect.width < 2 || clientRect.height < 2) {
      continue;
    }

    for (const [pageNumberString, pageElement] of Object.entries(
      pageRefs.current
    )) {
      if (!pageElement) {
        continue;
      }

      const pageNumber = Number(pageNumberString);
      const pageRect = pageElement.getBoundingClientRect();

      const intersects =
        clientRect.right > pageRect.left &&
        clientRect.left < pageRect.right &&
        clientRect.bottom > pageRect.top &&
        clientRect.top < pageRect.bottom;

      if (!intersects) {
        continue;
      }

      const left = Math.max(clientRect.left, pageRect.left) - pageRect.left;
      const top = Math.max(clientRect.top, pageRect.top) - pageRect.top;
      const right = Math.min(clientRect.right, pageRect.right) - pageRect.left;
      const bottom = Math.min(clientRect.bottom, pageRect.bottom) - pageRect.top;

      const width = right - left;
      const height = bottom - top;

      if (width < 2 || height < 2) {
        continue;
      }

      chunks.push({
        id: createId(),
        pageNumber,
        text: selectedText,
        rect: {
          pageNumber,
          x: left / pageRect.width,
          y: top / pageRect.height,
          width: width / pageRect.width,
          height: height / pageRect.height,
        },
      });
    }
  }

  if (chunks.length === 0) {
    return;
  }

  const textTarget: TextAnnotationTarget = {
    type: "text",
    id: createId(),
    text: selectedText,
    chunks: mergeTextSelectionChunks(chunks),
    createdAt: new Date().toISOString(),
  };

  onTextSelected(textTarget, shouldAppend);
  window.getSelection()?.removeAllRanges();
}

  function getPointInPage(event: React.MouseEvent, pageNumber: number) {
    const pageElement = pageRefs.current[pageNumber];

    if (!pageElement) {
      return null;
    }

    const pageRect = pageElement.getBoundingClientRect();

    return {
      x: clamp(event.clientX - pageRect.left, 0, pageRect.width),
      y: clamp(event.clientY - pageRect.top, 0, pageRect.height),
      pageWidth: pageRect.width,
      pageHeight: pageRect.height,
    };
  }

  function getNormalizedPointInPage(
    event: React.MouseEvent,
    pageNumber: number
  ) {
    const point = getPointInPage(event, pageNumber);

    if (!point) {
      return null;
    }

    return {
      x: point.x / point.pageWidth,
      y: point.y / point.pageHeight,
    };
  }

  function updateHoveredAnnotations(event: React.MouseEvent, pageNumber: number) {
    const point = getNormalizedPointInPage(event, pageNumber);

    if (!point) {
      onAnnotationContextMenuEmpty();
      return;
    }

    const hitTargetIds = getHitAnnotationTargets(
      annotationHitTargets,
      pageNumber,
      point
    ).map((annotation) => annotation.target.id);

    setHoveredAnnotationTargetIds((currentIds) =>
      areSameIds(currentIds, uniqueIds(hitTargetIds))
        ? currentIds
        : uniqueIds(hitTargetIds)
    );
  }

  function handleAnnotationContextMenu(
    event: React.MouseEvent,
    pageNumber: number
  ) {
    event.preventDefault();
    event.stopPropagation();
    window.getSelection()?.removeAllRanges();

    const point = getNormalizedPointInPage(event, pageNumber);

    if (!point) {
      onAnnotationContextMenuEmpty();
      return;
    }

    const hitAnnotations = getHitAnnotationTargets(
      annotationHitTargets,
      pageNumber,
      point
    );

    if (hitAnnotations.length === 0) {
      const selectedTargets = getHitSelectionTargets(
        currentSelectionTargets,
        pageNumber,
        point
      );

      if (selectedTargets.length > 0) {
        onSelectionContextMenu(selectedTargets, event.shiftKey);
        return;
      }

      onAnnotationContextMenuEmpty();
      return;
    }

    onAnnotationContextMenu(hitAnnotations, event.shiftKey);
  }

  function handlePdfLinkClick(event: React.MouseEvent) {
    const anchor = getAnchorFromEvent(event);

    if (!anchor) {
      return;
    }

    const internalPageNumber = getInternalPdfPageNumber(anchor, fileUrl);

    if (internalPageNumber) {
      const pageElement = pageRefs.current[internalPageNumber];

      if (pageElement) {
        event.preventDefault();
        event.stopPropagation();

        pageElement.scrollIntoView({
          behavior: "smooth",
          block: "start",
        });
      }

      return;
    }

    if (isExternalWebLink(anchor, fileUrl)) {
      event.preventDefault();
      event.stopPropagation();

      window.open(anchor.href, "_blank", "noopener,noreferrer");
    }
  }

  function handleRegionMouseDown(
    event: React.MouseEvent,
    pageNumber: number
  ) {
    if (selectionTool !== "region") {
      return;
    }

    if (getAnchorFromEvent(event)) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    const point = getPointInPage(event, pageNumber);

    if (!point) {
      return;
    }

    setDraftRegion({
      pageNumber,
      startX: point.x,
      startY: point.y,
      currentX: point.x,
      currentY: point.y,
    });
  }

  function handleRegionMouseMove(
    event: React.MouseEvent,
    pageNumber: number
  ) {
    if (selectionTool !== "region" || !draftRegion) {
      return;
    }

    if (draftRegion.pageNumber !== pageNumber) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    const point = getPointInPage(event, pageNumber);

    if (!point) {
      return;
    }

    setDraftRegion((current) => {
      if (!current) {
        return current;
      }

      return {
        ...current,
        currentX: point.x,
        currentY: point.y,
      };
    });
  }

  function handleRegionMouseUp(event: React.MouseEvent, pageNumber: number) {
    if (selectionTool !== "region" || !draftRegion) {
      return;
    }

    if (draftRegion.pageNumber !== pageNumber) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    const pageElement = pageRefs.current[pageNumber];

    if (!pageElement) {
      setDraftRegion(null);
      return;
    }

    const pageRect = pageElement.getBoundingClientRect();

    const left = Math.min(draftRegion.startX, draftRegion.currentX);
    const top = Math.min(draftRegion.startY, draftRegion.currentY);
    const width = Math.abs(draftRegion.currentX - draftRegion.startX);
    const height = Math.abs(draftRegion.currentY - draftRegion.startY);

    setDraftRegion(null);

    if (width < 8 || height < 8) {
      return;
    }

    const canvas = pageElement.querySelector("canvas");

    if (!canvas) {
      return;
    }

    const scaleX = canvas.width / pageRect.width;
    const scaleY = canvas.height / pageRect.height;

    const cropCanvas = document.createElement("canvas");
    cropCanvas.width = Math.round(width * scaleX);
    cropCanvas.height = Math.round(height * scaleY);

    const cropContext = cropCanvas.getContext("2d");

    if (!cropContext) {
      return;
    }

    cropContext.drawImage(
      canvas,
      Math.round(left * scaleX),
      Math.round(top * scaleY),
      Math.round(width * scaleX),
      Math.round(height * scaleY),
      0,
      0,
      cropCanvas.width,
      cropCanvas.height
    );

    const imageDataUrl = cropCanvas.toDataURL("image/png");

    const region: RegionAnnotationTarget = {
      type: "region",
      id: createId(),
      pageNumber,
      rect: {
        x: left / pageRect.width,
        y: top / pageRect.height,
        width: width / pageRect.width,
        height: height / pageRect.height,
      },
      imageDataUrl,
      createdAt: new Date().toISOString(),
    };

    onRegionSelected(region, event.shiftKey);
  }

  const pageWidth = Math.round(900 * zoom);
  const visualScale = zoom > 0 ? visualZoom / zoom : 1;
  const activeSelectionTargetIds = new Set(
    currentSelectionTargets.map((target) => target.id)
  );
  const annotationHitTargets = getAnnotationTargetInstances(annotations);
  const annotationOverlays = getNewestAnnotationsForTargets(annotations).filter(
    (annotation) => !activeSelectionTargetIds.has(annotation.target.id)
  );
  const pdfFile = useMemo(
    () => (resolvedPdfUrl ? ({ url: resolvedPdfUrl } as { url: string }) : null),
    [resolvedPdfUrl]
  );

  return (
    <div className="flex w-full flex-col items-center gap-3">
      <div className="flex w-full flex-col items-center gap-4 rounded-lg bg-slate-200 p-2">
      <div
        className="flex w-full flex-col items-center gap-4"
        style={{
          zoom: visualScale,
        }}
      >
      {pdfFetchError ? (
        <p>{pdfFetchError}</p>
      ) : pdfFile ? (
        <Document
          file={pdfFile}
          onLoadSuccess={({ numPages }) => {
            setNumPages(numPages);
            setCurrentPage(1);
          }}
          loading={<p>Loading PDF...</p>}
          error={<p>Failed to load PDF. Please try another file.</p>}
        >
          {Array.from(new Array(numPages), (_element, index) => {
            const pageNumber = index + 1;
            const regionAnnotationsForPage = annotationOverlays.filter(
              (annotation) =>
                annotation.target.type === "region" &&
                annotation.target.pageNumber === pageNumber
            );
            const textAnnotationsForPage = annotationOverlays.filter(
  (annotation) =>
    annotation.target.type === "text" &&
    (annotation.target.chunks ?? []).some(
      (chunk) => chunk.pageNumber === pageNumber
    )
);
            const activeRegionSelectionTargetsForPage =
              currentSelectionTargets.filter(
                (target): target is RegionAnnotationTarget =>
                  target.type === "region" && target.pageNumber === pageNumber
              );
            const activeTextSelectionTargetsForPage =
              currentSelectionTargets.filter(
                (target): target is TextAnnotationTarget =>
                  target.type === "text" &&
                  (target.chunks ?? []).some(
                    (chunk) => chunk.pageNumber === pageNumber
                  )
              );
            const isActiveDraftPage =
              draftRegion?.pageNumber === pageNumber && selectionTool === "region";

            const selectionLeft = draftRegion
              ? Math.min(draftRegion.startX, draftRegion.currentX)
              : 0;
            const selectionTop = draftRegion
              ? Math.min(draftRegion.startY, draftRegion.currentY)
              : 0;
            const selectionWidth = draftRegion
              ? Math.abs(draftRegion.currentX - draftRegion.startX)
              : 0;
            const selectionHeight = draftRegion
              ? Math.abs(draftRegion.currentY - draftRegion.startY)
              : 0;

            return (
              <div
                key={`page_${pageNumber}`}
                data-page-number={pageNumber}
                ref={(element) => {
                  pageRefs.current[pageNumber] = element;
                }}
                onMouseDownCapture={handleTextMouseDown}
                onMouseDown={(event) =>
                  handleRegionMouseDown(event, pageNumber)
                }
                onMouseMove={(event) =>
                  {
                    if (selectionTool === "region") {
                      handleRegionMouseMove(event, pageNumber);
                    }

                    if (!draftRegion) {
                      updateHoveredAnnotations(event, pageNumber);
                    }
                  }
                }
                onMouseUp={(event) => {
                  if (selectionTool === "region") {
                    handleRegionMouseUp(event, pageNumber);
                  } else {
                    handleTextMouseUp(event);
                  }
                }}
                onClick={handlePdfLinkClick}
                onContextMenu={(event) =>
                  handleAnnotationContextMenu(event, pageNumber)
                }
                onMouseLeave={() => setHoveredAnnotationTargetIds([])}
                className={`relative overflow-hidden rounded-lg bg-white shadow ${
                  selectionTool === "region"
                    ? "cursor-crosshair select-none"
                    : ""
                }`}
              >
                <Page
                  pageNumber={pageNumber}
                  width={pageWidth}
                  renderTextLayer={true}
                  renderAnnotationLayer={true}
                />
                {textAnnotationsForPage.map((annotation) => {
  if (annotation.target.type !== "text") {
    return null;
  }

  const chunksForPage = mergeTextSelectionChunks(
    (annotation.target.chunks ?? []).filter(
      (chunk) => chunk.pageNumber === pageNumber
    )
  );

  const bounds = getTextChunkBounds(chunksForPage);

  if (!bounds || bounds.width <= 0 || bounds.height <= 0) {
    return null;
  }

  const isHovered = hoveredAnnotationTargetIds.includes(annotation.target.id);
  const hoverTargetCount = hoveredAnnotationTargetIds.length;

  return (
    <div
      key={`${annotation.id}_page_${pageNumber}`}
      title="Open saved explanation"
      className="pointer-events-none absolute z-20 bg-transparent"
      style={{
        left: `${bounds.x * 100}%`,
        top: `${bounds.y * 100}%`,
        width: `${bounds.width * 100}%`,
        height: `${bounds.height * 100}%`,
      }}
    >
      {chunksForPage.map((chunk) => {
        const { rect } = chunk;

        return (
          <span
            key={chunk.id}
            className={`pointer-events-none absolute transition ${
              isHovered ? "bg-yellow-300/25" : "bg-yellow-300/15"
            }`}
            style={{
              left: `${((rect.x - bounds.x) / bounds.width) * 100}%`,
              top: `${((rect.y - bounds.y) / bounds.height) * 100}%`,
              width: `${(rect.width / bounds.width) * 100}%`,
              height: `${(rect.height / bounds.height) * 100}%`,
            }}
          />
        );
      })}

      <span
        className={`pointer-events-none absolute -top-2 right-0 min-h-3 min-w-3 rounded-full bg-slate-800/55 px-1 text-[9px] leading-3 text-white shadow-sm transition ${
          isHovered ? "opacity-70" : "opacity-0"
        }`}
      >
        {hoverTargetCount > 1 ? hoverTargetCount : ""}
      </span>
    </div>
  );
})}
                {regionAnnotationsForPage.map((annotation) => {
  if (annotation.target.type !== "region") {
    return null;
  }

  const { rect } = annotation.target;
  const isHovered = hoveredAnnotationTargetIds.includes(annotation.target.id);
  const hoverTargetCount = hoveredAnnotationTargetIds.length;

  return (
    <div
      key={annotation.id}
      title="Open saved explanation"
      className={`pointer-events-none absolute z-20 border transition ${
        isHovered
          ? "border-amber-400/45 bg-amber-200/10"
          : "border-amber-400/20 bg-amber-200/5"
      }`}
      style={{
        left: `${rect.x * 100}%`,
        top: `${rect.y * 100}%`,
        width: `${rect.width * 100}%`,
        height: `${rect.height * 100}%`,
      }}
    >
      <span
        className={`pointer-events-none absolute -top-2 right-0 min-h-3 min-w-3 rounded-full bg-slate-800/55 px-1 text-[9px] leading-3 text-white shadow-sm transition ${
          isHovered ? "opacity-70" : "opacity-0"
        }`}
      >
        {hoverTargetCount > 1 ? hoverTargetCount : ""}
      </span>
    </div>
  );
})}

                {activeTextSelectionTargetsForPage.map((target) => {
                  const chunksForPage = getTextHighlightChunks(
                    mergeTextSelectionChunks(
                      (target.chunks ?? []).filter(
                        (chunk) => chunk.pageNumber === pageNumber
                      )
                    )
                  );
                  const bounds = getTextChunkBounds(chunksForPage);

                  if (!bounds || bounds.width <= 0 || bounds.height <= 0) {
                    return null;
                  }

                  const isFocused = currentSelection?.id === target.id;

                  return (
                    <div
                      key={`active_text_${target.id}_page_${pageNumber}`}
                      className="pointer-events-none absolute z-30 bg-transparent"
                      style={{
                        left: `${bounds.x * 100}%`,
                        top: `${bounds.y * 100}%`,
                        width: `${bounds.width * 100}%`,
                        height: `${bounds.height * 100}%`,
                      }}
                    >
                      {chunksForPage.map((chunk) => {
                        const { rect } = chunk;

                        return (
                          <span
                            key={`active_${chunk.id}`}
                            className={`pointer-events-none absolute transition ${
                              isFocused
                                ? "bg-sky-200/25"
                                : "bg-sky-200/20"
                            }`}
                            style={{
                              left: `${((rect.x - bounds.x) / bounds.width) * 100}%`,
                              top: `${((rect.y - bounds.y) / bounds.height) * 100}%`,
                              width: `${(rect.width / bounds.width) * 100}%`,
                              height: `${(rect.height / bounds.height) * 100}%`,
                            }}
                          />
                        );
                      })}
                    </div>
                  );
                })}

                {activeRegionSelectionTargetsForPage.map((target) => {
                  const { rect } = target;
                  const isFocused = currentSelection?.id === target.id;

                  return (
                    <div
                      key={`active_region_${target.id}`}
                      className={`pointer-events-none absolute z-30 border transition ${
                        isFocused
                          ? "border-sky-400/45 bg-sky-200/10"
                          : "border-sky-300/35 bg-sky-200/5"
                      }`}
                      style={{
                        left: `${rect.x * 100}%`,
                        top: `${rect.y * 100}%`,
                        width: `${rect.width * 100}%`,
                        height: `${rect.height * 100}%`,
                      }}
                    />
                  );
                })}

                {isActiveDraftPage && (
                  <div
                    className="pointer-events-none absolute border border-sky-400/55 bg-sky-200/10"
                    style={{
                      left: selectionLeft,
                      top: selectionTop,
                      width: selectionWidth,
                      height: selectionHeight,
                    }}
                  />
                )}
              </div>
            );
          })}
        </Document>
      ) : (
        <p>Loading PDF...</p>
      )}
        </div>
      </div>
    </div>
  );
}
