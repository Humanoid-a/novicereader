# TODO for Codex

Last inspected by Codex: 2026-05-16.

This file is the next-session handoff list. Read `PROJECT_BRIEF.md` first for
architecture and current model details.

## Current confirmed state

- Frontend, backend, models, services, and persistence layers have been inspected.
- TypeScript check passed with:
  `./node_modules/.bin/tsc --noEmit --incremental false`.
- No test or spec files were found by `rg --files -g '*test*' -g '*spec*'`.
- Auth is now JWT/registration-code based. The old `test-user-001` flow is not
  the normal app path.
- Paper question conversations are persisted. Document chat is not persisted.
- Paper analysis profile backend exists, but frontend does not use it yet.

## Highest priority next tasks

1. Normalize the annotation model contract.
   - Decide whether `AiAnnotation.target` is required compatibility data or
     truly optional.
   - Update TypeScript in `types/annotations.ts` to match the backend decision.
   - Update all helper functions to use one canonical `getAnnotationTargets()`
     path.
   - Audit `components/PdfViewerClient.tsx`, `app/reader/[paperId]/page.tsx`,
     `lib/localLibrary.ts`, and `lib/guestSession.ts`.

2. Finish multi-target annotation support.
   - Make hit testing, overlays, hover state, delete target, history previews,
     local persistence, and guest backup all operate over `targets[]`.
   - Backend already normalizes `target` and `targets[]`, but frontend/local/guest
     code still has single-target assumptions.
   - Decide how question linking should work when a question is asked about
     multiple selected targets.

3. Add backend smoke tests.
   - Use FastAPI `TestClient`.
   - Cover auth/register/login or provide a test auth helper.
   - Cover PDF upload, list papers, get paper metadata, get PDF file.
   - Cover annotation create/list/delete and target delete.
   - Cover `/api/explain`, `/api/explain/follow-up`, and `/api/ask` with
     `OPENAI_API_KEY` absent so placeholder paths are deterministic.
   - Cover soft-delete behavior when questions still reference an annotation
     target.

4. Add frontend or TypeScript smoke checks.
   - Keep `tsc --noEmit` as a quick contract check.
   - Consider adding lightweight tests for annotation target helpers once they
     are centralized.
   - Consider Playwright only after the core contracts stabilize.

## Backend development tasks

- Add persistent document chat or remove/merge the stateless `/api/chat` route.
  Current state:
  - `DocumentChatMessage` and `DocumentChatThread` models exist.
  - `/api/chat` returns a message but does not store history.
  - Question conversations already cover much of the real product need.
- Add document context extraction.
  - Extract abstract and useful text blocks from uploaded PDFs.
  - Store context blocks in `context.json` or the `document_contexts` table.
  - Feed abstract/summary/nearby chunks into `context_service.py`.
- Decide how paper analysis profiles should be regenerated or retried.
  - Current generation runs in the upload background task.
  - If OpenAI is unavailable, a placeholder profile is stored.
  - No explicit retry endpoint exists.
- Improve guest session cleanup.
  - `end_guest_session()` currently validates/updates the session but does not
    clearly delete guest papers, PDFs, annotations, conversations, or session
    records.
- Add stricter backend validation where useful.
  - Ensure posted annotation target IDs are nonempty.
  - Consider limiting `imageDataUrl` size or storing cropped images outside JSON.
  - Consider rejecting mismatched `paperId` inside request bodies where routes
    already scope by URL.

## Frontend development tasks

- Wire the paper analysis profile into the reader.
  - `lib/api.ts` already has `getPaperAnalysisProfile()`.
  - No UI currently uses `sectionSummaries`, `academicContext`, or
    `figureAnalyses`.
- Add profile/onboarding UI.
  - Backend has `PUT /api/users/me/knowledge-profile`.
  - Frontend has no update wrapper or page/control for editing knowledge profile.
- Improve selected annotation state handling.
  - State currently spans `currentSelection`, `selectedTargets`,
    `selectedAnnotation`, `overlappingTargetIds`, `questionTurns`,
    `activeConversation`, and guide/demo state.
  - Centralize selection transitions to avoid stale target/annotation pairs.
- Make local and guest behavior match backend behavior.
  - Local and guest deletion paths still assume a single `annotation.target`.
  - Local ask receives `targets` in the function type but only uses `target`.
  - Guest cloud calls support `targets[]`, but local backup mutation often does
    not.

## Type/model mismatch checklist

- `backend/app/models/annotation.py`
  - `AiAnnotation.target: Optional[AnnotationTarget] = None`
  - `AiAnnotation.targets: List[AnnotationTarget] = []`
- `types/annotations.ts`
  - `AiAnnotation.target: AnnotationTarget`
  - `AiAnnotation.targets?: AnnotationTarget[]`
- `components/PdfViewerClient.tsx`
  - Has `getAnnotationTargets()`, `getNewestAnnotationsForTargets()`, and
    `getAnnotationTargetInstances()`.
  - Still has many direct `annotation.target` uses.
- `lib/localLibrary.ts` and `lib/guestSession.ts`
  - `deleteLocalAnnotationTarget()` and `deleteGuestAnnotationTarget()` inspect
    only `annotation.target.id`.
- `types/paper.ts`
  - Omits backend `storageKey`.
- Backend chat models have no frontend TS equivalents.

## Suggested implementation order

1. Centralize annotation target helpers in a shared frontend module.
2. Update TypeScript annotation types to reflect the intended backend contract.
3. Replace direct `annotation.target` assumptions in viewer, reader, local, and
   guest code.
4. Add backend smoke tests for the current behavior.
5. Add or update local/guest tests or helper-level checks.
6. Add PDF text/context extraction.
7. Expose paper analysis in the reader UI.
8. Add knowledge profile editing UI.
9. Revisit document chat persistence after question conversations are stable.

## Useful commands

- TypeScript contract check:
  `./node_modules/.bin/tsc --noEmit --incremental false`
- Frontend build:
  `npm run build`
- Frontend lint:
  `npm run lint`
- Backend syntax check:
  `python -m py_compile backend/main.py backend/app/**/*.py`

## Notes for the next Codex session

- Read `PROJECT_BRIEF.md` before editing.
- This project uses Next `16.2.4`; follow `AGENTS.md` and read relevant local
  Next docs under `node_modules/next/dist/docs/` before changing Next-specific
  code.
- The worktree may already contain user changes and generated files. Do not
  revert unrelated files.
