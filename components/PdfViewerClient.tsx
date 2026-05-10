"use client";

import { useRef, useState } from "react";
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

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  "react-pdf/node_modules/pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url
).toString();

type PdfViewerClientProps = {
  fileUrl: string;
  selectionTool: SelectionTool;
  annotations: AiAnnotation[];
  onTextSelected: (target: TextAnnotationTarget) => void;
  onRegionSelected: (region: RegionAnnotationTarget) => void;
  onAnnotationClick: (annotation: AiAnnotation) => void;
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

export default function PdfViewerClient({
  fileUrl,
  selectionTool,
  annotations,
  onTextSelected,
  onRegionSelected,
  onAnnotationClick,
}: PdfViewerClientProps) {
  const [numPages, setNumPages] = useState<number>(0);
  const [zoom, setZoom] = useState<number>(0.85);
  const [draftRegion, setDraftRegion] = useState<DraftRegion | null>(null);

  const pageRefs = useRef<Record<number, HTMLDivElement | null>>({});

  function zoomIn() {
    setZoom((currentZoom) => Math.min(currentZoom + 0.1, 1.6));
  }

  function zoomOut() {
    setZoom((currentZoom) => Math.max(currentZoom - 0.1, 0.5));
  }

  function resetZoom() {
    setZoom(0.85);
  }

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
    chunks,
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

  function handleRegionMouseDown(
    event: React.MouseEvent,
    pageNumber: number
  ) {
    if (selectionTool !== "region") {
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
    openImageInNewTab(imageDataUrl);
  }

  function openImageInNewTab(imageDataUrl: string) {
    const imageWindow = window.open();

    if (!imageWindow) {
      return;
    }

    imageWindow.document.write(`
      <html>
        <head>
          <title>Selected Region</title>
          <style>
            body {
              margin: 0;
              min-height: 100vh;
              display: flex;
              align-items: center;
              justify-content: center;
              background: #0f172a;
            }

            img {
              max-width: 95vw;
              max-height: 95vh;
              background: white;
              box-shadow: 0 20px 60px rgba(0, 0, 0, 0.35);
            }
          </style>
        </head>

        <body>
          <img src="${imageDataUrl}" />
        </body>
      </html>
    `);

    imageWindow.document.close();
  }

  const pageWidth = Math.round(900 * zoom);

  return (
    <div className="flex w-full flex-col items-center gap-3">
      <div className="sticky top-0 z-10 flex w-full items-center justify-between rounded-lg border bg-white px-3 py-2 shadow-sm">
        <p className="text-sm text-slate-600">
          {numPages > 0 ? `${numPages} pages loaded` : "Loading PDF..."}
        </p>

        <div className="flex items-center gap-2">
          <button
            onClick={zoomOut}
            className="rounded-md border px-3 py-1 text-sm hover:bg-slate-50"
          >
            −
          </button>

          <button
            onClick={resetZoom}
            className="rounded-md border px-3 py-1 text-sm hover:bg-slate-50"
          >
            {Math.round(zoom * 100)}%
          </button>

          <button
            onClick={zoomIn}
            className="rounded-md border px-3 py-1 text-sm hover:bg-slate-50"
          >
            +
          </button>
        </div>
      </div>

      {selectionTool === "region" && (
        <div className="w-full rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          Region mode: drag a box around an equation, figure, or table.
        </div>
      )}

      <div className="flex w-full flex-col items-center gap-4 rounded-lg bg-slate-200 p-2">
      <Document
        file={fileUrl}
          onLoadSuccess={({ numPages }) => {
            setNumPages(numPages);
          }}
          loading={<p>Loading PDF...</p>}
          error={<p>Failed to load PDF. Please try another file.</p>}
        >
          {Array.from(new Array(numPages), (_element, index) => {
            const pageNumber = index + 1;
            const regionAnnotationsForPage = annotations.filter(
              (annotation) =>
                annotation.target.type === "region" &&
                annotation.target.pageNumber === pageNumber
            );
            const textAnnotationsForPage = annotations.filter(
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
                ref={(element) => {
                  pageRefs.current[pageNumber] = element;
                }}
                onMouseDown={(event) =>
                  handleRegionMouseDown(event, pageNumber)
                }
                onMouseMove={(event) =>
                  handleRegionMouseMove(event, pageNumber)
                }
                onMouseUp={(event) => {
                  if (selectionTool === "region") {
                    handleRegionMouseUp(event, pageNumber);
                  } else {
                    handleTextMouseUp();
                  }
                }}
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

  const chunksForPage = (annotation.target.chunks ?? []).filter(
    (chunk) => chunk.pageNumber === pageNumber
  );

  return chunksForPage.map((chunk) => {
    const { rect } = chunk;

    return (
      <button
        key={`${annotation.id}_${chunk.id}`}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          onAnnotationClick(annotation);
        }}
        title="Open saved explanation"
        className="group absolute z-20 bg-yellow-300/30 transition hover:bg-yellow-300/50"
        style={{
          left: `${rect.x * 100}%`,
          top: `${rect.y * 100}%`,
          width: `${rect.width * 100}%`,
          height: `${rect.height * 100}%`,
        }}
      >
        <span className="pointer-events-none absolute -top-7 left-1/2 hidden -translate-x-1/2 rounded-full bg-slate-900 px-2 py-1 text-xs text-white shadow-md group-hover:block">
          💬
        </span>
      </button>
    );
  });
})}
                {regionAnnotationsForPage.map((annotation) => {
  if (annotation.target.type !== "region") {
    return null;
  }

  const { rect } = annotation.target;

  return (
    <button
      key={annotation.id}
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        onAnnotationClick(annotation);
      }}
      title="Open saved explanation"
      className="group absolute z-20 border-2 border-transparent bg-transparent transition hover:border-amber-400 hover:bg-amber-300/20"
      style={{
        left: `${rect.x * 100}%`,
        top: `${rect.y * 100}%`,
        width: `${rect.width * 100}%`,
        height: `${rect.height * 100}%`,
      }}
    >
      <span className="pointer-events-none absolute -top-7 left-1/2 hidden -translate-x-1/2 rounded-full bg-slate-900 px-2 py-1 text-xs text-white shadow-md group-hover:block">
        💬
      </span>
    </button>
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