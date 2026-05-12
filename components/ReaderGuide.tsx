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
    | "ai-explanation"
    | "follow-ups"
    | "region-tool"
    | "ask-ai"
    | "right-click"
    | "delete";
};

const guideSteps: GuideStep[] = [
  {
    selector: '[data-guide="selection-preview"]',
    title: "1. Highlight text",
    body:
      "Drag across a sentence in the PDF. The demo text is now shown in the Selection box.",
    demo: "text-selection",
  },
  {
    selector: '[data-guide="explain-selection"]',
    title: "2. Ask for an annotation explanation",
    body:
      "After text or a region is selected, click this button. NoviceReader saves the annotation and writes a short explanation beside the paper.",
    demo: "ai-explanation",
  },
  {
    selector: '[data-guide="ai-response"]',
    title: "3. Explore follow-up points",
    body:
      "The explanation appears here, with follow-up points listed below it.",
    demo: "follow-ups",
  },
  {
    selector: '[data-guide="selection-toolbox"]',
    title: "4. Switch to region selection",
    body:
      "The tool switches from text highlighting to region selection, then places a demo cropped region in the Selection box.",
    demo: "region-tool",
  },
  {
    selector: '[data-guide="ask-ai-panel"]',
    title: "5. Ask AI about the paper",
    body: "Ask a specific question here. Active selections can be included as context.",
    demo: "ask-ai",
  },
  {
    selector: '[data-guide="pdf-viewer"]',
    title: "6. Reopen a saved annotation",
    body:
      "The demo region annotation is selected now. In normal use, right-click a saved annotation to reopen it.",
    demo: "right-click",
  },
  {
    selector: '[data-guide="selection-actions"]',
    title: "7. Delete annotations",
    body:
      "When an annotation is selected, use the small trash button near the Selection heading to remove the highlighted or cropped area from the PDF.",
    demo: "delete",
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

    setStepIndex(0);
    onStepChange?.(0);
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
