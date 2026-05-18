import { AppMenu } from "@/components/AppMenu";
import Link from "next/link";

export default function HelpPage() {
  return (
    <main className="min-h-screen bg-slate-100">
      <header className="flex items-center gap-2 border-b bg-white px-4 py-2">
        <AppMenu />
        <div>
          <h1 className="text-base font-semibold text-slate-950">
            NoviceReader Help
          </h1>
          <p className="text-xs text-slate-500">
            Quick reference for reading papers with annotations.
          </p>
        </div>
      </header>

      <section className="mx-auto max-w-3xl px-5 py-8">
        <div className="space-y-4 rounded-lg border border-slate-200 bg-white p-5">
          <div>
            <h2 className="text-sm font-semibold text-slate-950">
              Getting Started
            </h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              Upload a PDF from the home page, then highlight text or select a
              region in the reader to ask for beginner-friendly explanations.
            </p>
          </div>

          <div>
            <h2 className="text-sm font-semibold text-slate-950">
              Reader Tools
            </h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              Use the floating toolbox next to the PDF to switch between text
              highlighting and region selection. Saved annotations and
              conversations are available from the right panel.
            </p>
          </div>

          <div>
            <h2 className="text-sm font-semibold text-slate-950">
              Knowledge Profiles
            </h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              Knowledge profiles tell NoviceReader what you already know, which
              domains you are comfortable with, and which areas feel weak. The
              selected profile is sent with explanation, summary, and question
              requests so AI responses can use the right level of detail.
            </p>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              You can create multiple profiles from presets or an empty profile,
              then switch between them from the reader profile menu. Profiles
              are saved locally for the current account or guest session.
            </p>
          </div>

          <Link
            href="/"
            className="inline-flex rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white transition hover:bg-slate-700"
          >
            Back to home
          </Link>
        </div>
      </section>
    </main>
  );
}
