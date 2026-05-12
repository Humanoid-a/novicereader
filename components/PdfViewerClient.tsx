"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import type {
  AiAnnotation,
  RegionAnnotationTarget,
  SelectionTool,
  TextAnnotationTarget,
} from "@/types/annotation";

import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";
import { createId } from "@/lib/id";
import { getAuthHeaders } from "@/lib/api";

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  "react-pdf/node_modules/pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url
).toString();

type PdfViewerClientProps = {
  fileUrl: string;
  selectionTool: SelectionTool;
  annotations: AiAnnotation[];
  zoom: number;
  targetToReveal?: { targetId: string; nonce: number } | null;
  currentSelection?: TextAnnotationTarget | RegionAnnotationTarget | null;
  onPageStatusChange: (status: { currentPage: number; numPages: number }) => void;
  onTextSelected: (target: TextAnnotationTarget) => void;
  onRegionSelected: (region: RegionAnnotationTarget) => void;
  onAnnotationContextMenu: (annotations: AiAnnotation[]) => void;
  onAnnotationContextMenuEmpty: () => void;
};

type DraftRegion = {
  pageNumber: number;
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
};


function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
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
    const existingAnnotation = newestAnnotationsByTarget.get(annotation.target.id);

    if (
      !existingAnnotation ||
      getAnnotationCreatedAtMs(annotation) >
        getAnnotationCreatedAtMs(existingAnnotation)
    ) {
      newestAnnotationsByTarget.set(annotation.target.id, annotation);
    }
  }

  return Array.from(newestAnnotationsByTarget.values());
}

export default function PdfViewerClient({
  fileUrl,
  selectionTool,
  annotations,
  zoom,
  targetToReveal,
  currentSelection,
  onPageStatusChange,
  onTextSelected,
  onRegionSelected,
  onAnnotationContextMenu,
  onAnnotationContextMenuEmpty,
}: PdfViewerClientProps) {
  const [numPages, setNumPages] = useState<number>(0);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [draftRegion, setDraftRegion] = useState<DraftRegion | null>(null);
  const [hoveredAnnotationTargetIds, setHoveredAnnotationTargetIds] = useState<
    string[]
  >([]);

  const pageRefs = useRef<Record<number, HTMLDivElement | null>>({});
  const visiblePageRatios = useRef<Record<number, number>>({});

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
      return;
    }

    const annotation = annotations.find(
      (annotation) => annotation.target.id === targetToReveal.targetId
    );
    const target =
      annotation?.target?.id === targetToReveal.targetId
        ? annotation.target
        : currentSelection?.id === targetToReveal.targetId
          ? currentSelection
          : null;

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
      annotation && annotation.target.id === target.id
        ? getAnnotationBoundsForPage(annotation, pageNumber)
        : getTargetBoundsForPage(target, pageNumber);
    const scrollContainer = findScrollableParent(pageElement);

    if (!bounds || !scrollContainer) {
      pageElement.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }

    const pageRect = pageElement.getBoundingClientRect();
    const scrollContainerRect = scrollContainer.getBoundingClientRect();
    const targetTop =
      scrollContainer.scrollTop +
      pageRect.top -
      scrollContainerRect.top +
      bounds.y * pageRect.height;

    scrollContainer.scrollTo({
      top: Math.max(targetTop - scrollContainer.clientHeight * 0.35, 0),
      behavior: "smooth",
    });
  }, [annotations, currentSelection, targetToReveal]);

  function handleTextMouseUp() {
  if (selectionTool !== "highlight") {
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

  onTextSelected(textTarget);
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
      annotationOverlays,
      pageNumber,
      point
    ).map((annotation) => annotation.target.id);

    setHoveredAnnotationTargetIds((currentIds) =>
      areSameIds(currentIds, hitTargetIds) ? currentIds : hitTargetIds
    );
  }

  function handleAnnotationContextMenu(
    event: React.MouseEvent,
    pageNumber: number
  ) {
    const point = getNormalizedPointInPage(event, pageNumber);

    if (!point) {
      return;
    }

    const hitAnnotations = getHitAnnotationTargets(
      annotationOverlays,
      pageNumber,
      point
    );

    if (hitAnnotations.length === 0) {
      onAnnotationContextMenuEmpty();
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    onAnnotationContextMenu(hitAnnotations);
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

    onRegionSelected(region);
  }

  const pageWidth = Math.round(900 * zoom);
  const annotationOverlays = getNewestAnnotationsForTargets(annotations);
  const pdfFile = useMemo(
    () => ({ url: fileUrl, httpHeaders: getAuthHeaders() }) as { url: string },
    [fileUrl]
  );

  return (
    <div className="flex w-full flex-col items-center gap-3">
      {selectionTool === "region" && (
        <div className="w-full rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          Region mode: drag a box around an equation, figure, or table.
        </div>
      )}

      <div className="flex w-full flex-col items-center gap-4 rounded-lg bg-slate-200 p-2">
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
                    handleTextMouseUp();
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

                {isActiveDraftPage && (
                  <div
                    className="pointer-events-none absolute border-2 border-blue-500 bg-blue-500/20"
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
      </div>
    </div>
  );
}
