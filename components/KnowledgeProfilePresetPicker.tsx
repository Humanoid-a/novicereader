"use client";

import {
  EMPTY_KNOWLEDGE_PROFILE_PRESET,
  KNOWLEDGE_PROFILE_PRESETS,
  type KnowledgeProfilePreset,
} from "@/lib/knowledgeProfilePresets";

type KnowledgeProfilePresetPickerProps = {
  search: string;
  onSearchChange: (value: string) => void;
  onChoosePreset: (preset: KnowledgeProfilePreset) => void;
  onClose: () => void;
};

export function KnowledgeProfilePresetPicker({
  search,
  onSearchChange,
  onChoosePreset,
  onClose,
}: KnowledgeProfilePresetPickerProps) {
  const normalizedSearch = search.trim().toLowerCase();
  const filteredPresets = normalizedSearch
    ? KNOWLEDGE_PROFILE_PRESETS.filter((preset) =>
        preset.name.toLowerCase().includes(normalizedSearch),
      )
    : KNOWLEDGE_PROFILE_PRESETS;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 p-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="knowledge-profile-preset-title"
        className="w-full max-w-2xl overflow-hidden rounded-xl bg-white shadow-2xl"
      >
        <div className="flex items-start justify-between gap-3 border-b border-slate-200 px-5 py-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              New
            </p>
            <h2
              id="knowledge-profile-preset-title"
              className="mt-1 text-lg font-semibold text-slate-950"
            >
              Choose a preset
            </h2>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-md text-slate-400 transition hover:bg-slate-100 hover:text-slate-800"
            aria-label="Close preset chooser"
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

        <div className="space-y-4 px-5 py-4">
          <button
            type="button"
            onClick={() => onChoosePreset(EMPTY_KNOWLEDGE_PROFILE_PRESET)}
            className="flex w-full items-center justify-between gap-3 rounded-lg border border-slate-300 bg-slate-900 px-4 py-3 text-left text-white shadow-sm transition hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-300"
          >
            <span className="min-w-0">
              <span className="block text-sm font-semibold">
                {EMPTY_KNOWLEDGE_PROFILE_PRESET.name}
              </span>
              <span className="mt-0.5 block text-xs leading-5 text-slate-300">
                {EMPTY_KNOWLEDGE_PROFILE_PRESET.description}
              </span>
            </span>
            <span className="shrink-0 rounded-full bg-white/10 px-2 py-1 text-[11px] font-semibold uppercase tracking-wide">
              Blank
            </span>
          </button>

          <label className="block">
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Search presets by name
            </span>
            <div className="relative mt-2">
              <input
                value={search}
                onChange={(event) => onSearchChange(event.target.value)}
                placeholder="e.g. biology teacher"
                className="h-10 w-full rounded-md border border-slate-200 bg-white pl-9 pr-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-slate-400 focus:ring-2 focus:ring-slate-200"
              />
              <svg
                aria-hidden="true"
                viewBox="0 0 24 24"
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
                fill="none"
                stroke="currentColor"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="1.8"
              >
                <circle cx="11" cy="11" r="7" />
                <path d="m20 20-3.5-3.5" />
              </svg>
            </div>
          </label>

          <div className="max-h-[48vh] overflow-auto pr-1">
            {filteredPresets.length > 0 ? (
              <div className="grid gap-2 sm:grid-cols-2">
                {filteredPresets.map((preset) => (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => onChoosePreset(preset)}
                    className="group rounded-lg border border-slate-200 bg-white p-3 text-left transition hover:border-slate-300 hover:bg-slate-50 hover:shadow-sm focus:outline-none focus:ring-2 focus:ring-slate-200"
                  >
                    <span className="block text-sm font-semibold text-slate-900">
                      {preset.name}
                    </span>
                    <span className="mt-1 block text-xs leading-5 text-slate-500">
                      {preset.description}
                    </span>
                    <span className="mt-2 inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400 group-hover:text-slate-700">
                      Use preset
                      <svg
                        aria-hidden="true"
                        viewBox="0 0 24 24"
                        className="h-3 w-3"
                        fill="none"
                        stroke="currentColor"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth="2"
                      >
                        <path d="M5 12h14" />
                        <path d="m13 6 6 6-6 6" />
                      </svg>
                    </span>
                  </button>
                ))}
              </div>
            ) : (
              <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
                No presets match that name.
              </div>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
