"use client";

import { useEffect, useState } from "react";

type ReaderGuideProps = {
  isOpen: boolean;
  onClose: () => void;
  onStepChange?: (stepIndex: number) => void;
};

type GuideRect = {
  left: number;
  top: number;
  width: number;
  height: number;
};

type GuideStep = {
  selector: string;
  title: string;
  body: string;
  demo:
    | "text-selection"
    | "region-tool"
    | "ai-actions"
    | "right-click"
    | "multiselect"
    | "hover-preview"
    | "undo"
    | "ask-ai"
    | "delete"
    | "bookmark";
};

const guideSteps: GuideStep[] = [
  {
    selector: '[data-guide="selection-preview"]',
    title: "1. Selecting from text",
    body:
      "Drag across text in the PDF to highlight it. The selected passage appears in the Selection box.",
    demo: "text-selection",
  },
  {
    selector: '[data-guide="selection-toolbox"]',
    title: "2. Switch selection tools",
    body:
      "Use the small toolbox above the PDF to switch between text highlighting and region selection.",
    demo: "region-tool",
  },
  {
    selector: '[data-guide="ai-request-buttons"]',
    title: "3. Explain or summarize",
    body:
      "Click Explain for a teaching-style explanation, or Summary for a shorter author-perspective summary of the selected area.",
    demo: "ai-actions",
  },
  {
    selector: '[data-guide="pdf-viewer"]',
    title: "4. Right-click to select",
    body:
      "Right-click an existing highlighted text or region box to select it and reopen its saved annotation.",
    demo: "right-click",
  },
  {
    selector: '[data-guide="pdf-viewer"]',
    title: "5. Hold Shift for multiple",
    body:
      "Hold Shift while right-clicking another saved item to add it to the current selection instead of replacing the selection.",
    demo: "multiselect",
  },
  {
    selector: '[data-guide="selection-preview"]',
    title: "6. Check each selected item",
    body:
      "Hover over a small Selection icon to preview exactly which text or region it represents.",
    demo: "hover-preview",
  },
  {
    selector: '[data-guide="selection-actions"]',
    title: "7. Undo selection mistakes",
    body:
      "When making mistakes or misselecting, press the undo button or Ctrl/Cmd+Z to go back.",
    demo: "undo",
  },
  {
    selector: '[data-guide="ask-ai-panel"]',
    title: "8. Ask follow-up questions",
    body:
      "Use the Ask box to ask about the whole article, the current selected region, or the saved annotation attached to it.",
    demo: "ask-ai",
  },
  {
    selector: '[data-guide="delete-annotation"]',
    title: "9. Delete selected annotation",
    body:
      "Press the trash button to delete the selected annotation.",
    demo: "delete",
  },
  {
    selector: '[data-guide="bookmark-control"]',
    title: "10. Add bookmarks",
    body:
      "Click the bookmark button or press Ctrl/Cmd+B, then click the PDF to place a bookmark at that position.",
    demo: "bookmark",
  },
];

function MouseRightClickIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="h-5 w-5"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.7"
    >
      <path d="M12 3.5h.3a5.2 5.2 0 0 1 5.2 5.2v6.6a5.5 5.5 0 0 1-11 0V8.7A5.2 5.2 0 0 1 11.7 3.5H12Z" />
      <path d="M12 3.5V11" />
      <path d="M12 7.2h5.1" />
      <path d="M14.6 5.2v2" className="opacity-60" />
    </svg>
  );
}

function renderStepDemo(step: GuideStep) {
  if (step.demo === "right-click") {
    return (
      <div className="flex items-center gap-2 rounded-lg bg-slate-100 p-2 text-xs leading-5 text-slate-600">
        <span className="inline-flex h-8 w-8 items-center justify-center rounded-md bg-white text-slate-700 shadow-sm">
          <MouseRightClickIcon />
        </span>
        Right-click the annotation area to select it again.
      </div>
    );
  }

  if (step.demo === "multiselect") {
    return (
      <div className="rounded-lg bg-slate-100 p-2 text-xs leading-5 text-slate-600">
        <span className="mr-2 rounded bg-white px-2 py-1 font-semibold text-slate-700 shadow-sm">
          Shift
        </span>
        Keep Shift held while choosing the next item.
      </div>
    );
  }

  if (step.demo === "undo") {
    return (
      <div className="rounded-lg bg-slate-100 p-2 text-xs leading-5 text-slate-600">
        Selection replaced by accident. Use undo or Ctrl/Cmd+Z to restore the
        previous Selection box.
      </div>
    );
  }

  if (step.demo === "bookmark") {
    return (
      <div className="flex items-center gap-2 rounded-lg bg-slate-100 p-2 text-xs leading-5 text-slate-600">
        <span className="rounded bg-white px-2 py-1 font-semibold text-slate-700 shadow-sm">
          Ctrl/Cmd+B
        </span>
        Use the left bookmark rails to jump back later.
      </div>
    );
  }

  return null;
}

function readTargetRect(selector: string): GuideRect | null {
  const element = document.querySelector<HTMLElement>(selector);

  if (!element) {
    return null;
  }

  const rect = element.getBoundingClientRect();

  return {
    left: rect.left,
    top: rect.top,
    width: rect.width,
    height: rect.height,
  };
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function getTooltipPosition(rect: GuideRect | null) {
  const tooltipWidth = 320;
  const margin = 14;
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;

  if (!rect) {
    return {
      left: clamp((viewportWidth - tooltipWidth) / 2, margin, viewportWidth - tooltipWidth - margin),
      top: Math.max(margin, viewportHeight * 0.22),
    };
  }

  const hasRoomRight = rect.left + rect.width + tooltipWidth + margin * 2 < viewportWidth;
  const hasRoomLeft = rect.left - tooltipWidth - margin * 2 > 0;
  const left = hasRoomRight
    ? rect.left + rect.width + margin
    : hasRoomLeft
      ? rect.left - tooltipWidth - margin
      : clamp(rect.left, margin, viewportWidth - tooltipWidth - margin);
  const top = clamp(
    rect.top + rect.height / 2 - 150,
    margin,
    viewportHeight - 340
  );

  return { left, top };
}

export function ReaderGuide({
  isOpen,
  onClose,
  onStepChange,
}: ReaderGuideProps) {
  const [stepIndex, setStepIndex] = useState(0);
  const [targetRect, setTargetRect] = useState<GuideRect | null>(null);

  const currentStep = guideSteps[stepIndex];
  const isFirstStep = stepIndex === 0;
  const isLastStep = stepIndex === guideSteps.length - 1;

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const resetTimer = window.setTimeout(() => {
      setStepIndex(0);
      onStepChange?.(0);
    }, 0);

    return () => {
      window.clearTimeout(resetTimer);
    };
  }, [isOpen, onStepChange]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    function updateTargetRect() {
      setTargetRect(readTargetRect(currentStep.selector));
    }

    updateTargetRect();
    window.addEventListener("resize", updateTargetRect);
    window.addEventListener("scroll", updateTargetRect, true);

    return () => {
      window.removeEventListener("resize", updateTargetRect);
      window.removeEventListener("scroll", updateTargetRect, true);
    };
  }, [currentStep.selector, isOpen]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
      }
    }

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, onClose]);

  if (!isOpen) {
    return null;
  }

  const paddedRect = targetRect
    ? {
        left: Math.max(targetRect.left - 8, 8),
        top: Math.max(targetRect.top - 8, 8),
        width: Math.min(targetRect.width + 16, window.innerWidth - 16),
        height: Math.min(targetRect.height + 16, window.innerHeight - 16),
      }
    : null;
  const tooltipPosition = getTooltipPosition(paddedRect);
  const stepDemo = renderStepDemo(currentStep);

  return (
    <div className="fixed inset-0 z-[80]">
      {paddedRect && (
        <div
          className="pointer-events-none absolute rounded-2xl border border-white bg-transparent shadow-[0_0_0_9999px_rgba(15,23,42,0.42),0_18px_45px_rgba(15,23,42,0.22)] transition-all duration-200"
          style={{
            left: paddedRect.left,
            top: paddedRect.top,
            width: paddedRect.width,
            height: paddedRect.height,
          }}
        />
      )}

      {!paddedRect && <div className="absolute inset-0 bg-slate-950/40" />}

      <section
        className="absolute w-[320px] rounded-2xl border border-slate-200 bg-white p-4 shadow-2xl"
        style={tooltipPosition}
        role="dialog"
        aria-label="Reader guide"
      >
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
              Reader guide
            </p>
            <h2 className="mt-1 text-base font-semibold text-slate-950">
              {currentStep.title}
            </h2>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-7 w-7 items-center justify-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-800"
            aria-label="Close reader guide"
          >
            x
          </button>
        </div>

        <p className="text-sm leading-6 text-slate-600">{currentStep.body}</p>

        {stepDemo && <div className="mt-3">{stepDemo}</div>}

        <div className="mt-4 flex items-center justify-between gap-3">
          <span className="text-xs tabular-nums text-slate-400">
            {stepIndex + 1}/{guideSteps.length}
          </span>

          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={isFirstStep}
              onClick={() => {
                const nextStepIndex = Math.max(stepIndex - 1, 0);
                setStepIndex(nextStepIndex);
                onStepChange?.(nextStepIndex);
              }}
              className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:pointer-events-none disabled:opacity-40"
            >
              Back
            </button>

            <button
              type="button"
              onClick={() => {
                if (isLastStep) {
                  onClose();
                  return;
                }

                const nextStepIndex = Math.min(
                  stepIndex + 1,
                  guideSteps.length - 1
                );
                setStepIndex(nextStepIndex);
                onStepChange?.(nextStepIndex);
              }}
              className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-700"
            >
              {isLastStep ? "Done" : "Next"}
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}

export default ReaderGuide;
