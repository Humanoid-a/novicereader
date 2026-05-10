"use client";

import { useEffect, useState } from "react";
import { createId } from "@/lib/id";
import { useParams } from "next/navigation";
import Link from "next/link";
import PdfViewer from "@/components/PdfViewer";
import {
  createPaperAnnotation,
  deletePaperAnnotation,
  explainSelection,
  getPaper,
  listPaperAnnotations,
  TEST_USER_ID,
} from "@/lib/api";
import type { PaperWithUrls } from "@/types/paper";
import type {
  AiAnnotation,
  AnnotationTarget,
  RegionAnnotationTarget,
  SelectionTool,
  TextAnnotationTarget,
} from "@/types/annotation";



function cleanTextForDisplay(text: string) {
  return text.replace(/\s+/g, " ").trim();
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

function LoadingDots() {
  return (
    <div className="flex items-center gap-2 text-sm text-slate-500">
      <div className="h-4 w-4 animate-spin rounded-full border-2 border-slate-300 border-t-slate-900" />
      <span>Generating explanation...</span>
    </div>
  );
}

export default function ReaderPage() {
  const params = useParams<{ paperId: string }>();
  const paperId = params.paperId;

  const [paper, setPaper] = useState<PaperWithUrls | null>(null);
  const [annotations, setAnnotations] = useState<AiAnnotation[]>([]);

  const [selectionTool, setSelectionTool] = useState<SelectionTool>("highlight");
  const [currentSelection, setCurrentSelection] =
    useState<AnnotationTarget | null>(null);
 const [selectedAnnotation, setSelectedAnnotation] =
  useState<AiAnnotation | null>(null);

const [annotationToDelete, setAnnotationToDelete] =
  useState<AiAnnotation | null>(null);

const [isDeletingAnnotation, setIsDeletingAnnotation] = useState(false);   
  const [selectionExpanded, setSelectionExpanded] = useState(false);

  const [prompt, setPrompt] = useState("");
  const [promptFocused, setPromptFocused] = useState(false);
  const [aiResponse, setAiResponse] = useState("");

  const [isLoading, setIsLoading] = useState(true);
  const [isExplaining, setIsExplaining] = useState(false);
  const [isSavingAnnotation, setIsSavingAnnotation] = useState(false);
  const [error, setError] = useState("");

useEffect(() => {
  if (!paperId) {
    return;
  }



  async function loadPaperWorkspace() {
    try {
      setIsLoading(true);

      const loadedPaper = await getPaper(paperId);
      const loadedAnnotations = await listPaperAnnotations(paperId);

      setPaper(loadedPaper);
      setAnnotations(loadedAnnotations);
    } catch (error) {
      console.error(error);
      setError("Failed to load this paper.");
    } finally {
      setIsLoading(false);
    }
  }

  loadPaperWorkspace();
}, [paperId]);


function requestDeleteSelectedAnnotation() {
  if (!selectedAnnotation) {
    return;
  }

  setAnnotationToDelete(selectedAnnotation);
}

async function confirmDeleteAnnotation() {
  if (!paper || !annotationToDelete) {
    return;
  }

  try {
    setIsDeletingAnnotation(true);

    await deletePaperAnnotation({
      paperId: paper.id,
      annotationId: annotationToDelete.id,
    });

    setAnnotations((current) =>
      current.filter((annotation) => annotation.id !== annotationToDelete.id)
    );

    if (selectedAnnotation?.id === annotationToDelete.id) {
      setSelectedAnnotation(null);
      setCurrentSelection(null);
      setAiResponse("");
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

  function getAnnotationMainExplanation(annotation: AiAnnotation) {
  return annotation.explanation?.mainExplanation || annotation.response;
}

function handleAnnotationClick(annotation: AiAnnotation) {
  setCurrentSelection(annotation.target);
  setSelectedAnnotation(annotation);
  setSelectionExpanded(false);
  setAiResponse(getAnnotationMainExplanation(annotation));
}

function handleTextSelected(target: TextAnnotationTarget) {
  setCurrentSelection(target);
  setSelectedAnnotation(null);
  setSelectionExpanded(false);
}


  function handleRegionSelected(region: RegionAnnotationTarget) {
    setCurrentSelection(region);
    setSelectedAnnotation(null);
    setSelectionExpanded(false);

    setAiResponse(
      `Region selected on page ${region.pageNumber}.\n\nFor now, the cropped image opens in a new tab. Later, this region will be sent to a vision-capable AI model.`
    );
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
  userId: TEST_USER_ID,
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

 async function handleAskAi() {
  if (!paper) {
    return;
  }

  if (!currentSelection && !prompt.trim()) {
    setAiResponse("Select something from the PDF or type a question first.");
    return;
  }

  if (!currentSelection) {
    setAiResponse(
      "For now, general paper chat is not connected yet. Select text or a region first, then ask your question."
    );
    return;
  }

  try {
    setIsExplaining(true);
    setAiResponse("");

    const result = await explainSelection({
      paperId: paper.id,
      target: currentSelection,
      prompt: prompt.trim() || "Explain this selected content.",
    });

    setAiResponse(result.explanation.mainExplanation);
  } catch (error) {
    console.error(error);
    setAiResponse("Failed to get AI response. Please try again.");
  } finally {
    setIsExplaining(false);
  }
}

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
      <header className="flex items-center justify-between border-b bg-white px-6 py-4">
        <div>
          <h1 className="text-2xl font-bold">NoviceReader</h1>
          <p className="text-sm text-slate-500">
            {paper.originalFilename}
          </p>
        </div>

        <Link
          href="/"
          className="rounded-lg border px-4 py-2 text-sm hover:bg-slate-50"
        >
          Upload another PDF
        </Link>
      </header>

      <div className="grid h-[calc(100vh-73px)] grid-cols-[minmax(0,1fr)_305px] gap-3 p-3">
       <section className="min-w-0 overflow-auto rounded-2xl bg-slate-200 p-2 shadow-sm">
         <PdfViewer
  fileUrl={paper.fileUrl}
  selectionTool={selectionTool}
  annotations={annotations}
  onTextSelected={handleTextSelected}
  onRegionSelected={handleRegionSelected}
  onAnnotationClick={handleAnnotationClick}
/>
        </section>

        <aside className="flex min-h-0 w-[305px] flex-col overflow-hidden rounded-2xl bg-white shadow-sm">
         <div className="border-b p-2">
  <div className="grid grid-cols-2 rounded-lg bg-slate-100 p-0.5 text-xs">
              <button
                onClick={() => setSelectionTool("highlight")}
                className={`rounded-md px-2 py-1.5 font-medium transition ${
                  selectionTool === "highlight"
                    ? "bg-white text-slate-950 shadow-sm"
                    : "text-slate-500 hover:text-slate-900"
                }`}
              >
                Highlight
              </button>

              <button
                onClick={() => setSelectionTool("region")}
                className={`rounded-md px-2 py-1.5 font-medium transition ${
                  selectionTool === "region"
                    ? "bg-white text-slate-950 shadow-sm"
                    : "text-slate-500 hover:text-slate-900"
                }`}
              >
                Region
              </button>
            </div>

            <p className="mt-1 text-[11px] text-slate-500">
              {selectionTool === "highlight"
                ? "Select text from the PDF."
                : "Drag a box around an equation, figure, or table."}
            </p>
          </div>

          <div className="flex min-h-0 flex-1 flex-col overflow-hidden p-2">
            <section>
             <div className="mb-2 flex items-center justify-between gap-2">
  <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
    Selection
  </h2>

  <div className="flex items-center gap-2">
    {selectedAnnotation && (
      <button
        onClick={requestDeleteSelectedAnnotation}
        className="text-xs font-medium text-red-500 hover:text-red-700"
      >
        Delete
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
              <div className="mb-2 flex items-center justify-between">
                <h2 className="text-sm font-semibold">AI response</h2>

                <span className="text-xs text-slate-400">
                  {annotations.length} saved
                </span>
              </div>

              <div className="min-h-0 flex-1 overflow-auto rounded-lg bg-slate-100 p-3 text-sm leading-6 text-slate-700">
  {isExplaining ? (
    <LoadingDots />
  ) : aiResponse ? (
    <div className="space-y-3">
      <section>
        <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
          Explanation
        </h3>

        <div className="whitespace-pre-wrap">{aiResponse}</div>
      </section>

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
    "Explanations will appear here."
  )}
</div>
            </section>
          </div>

          <div className="border-t bg-white p-2">
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
              className="mt-2 w-full rounded-lg bg-slate-900 px-3 py-2 text-xs font-medium text-white hover:bg-slate-700"
            >
              Ask AI
            </button>
          </div>
        </aside>
            </div>

      {annotationToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl">
            <h2 className="text-lg font-semibold">Delete annotation?</h2>

            <p className="mt-2 text-sm leading-6 text-slate-600">
              This will remove the saved explanation and its clickable annotation
              from this paper. This action cannot be undone.
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