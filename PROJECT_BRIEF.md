# NoviceReader Project Brief

Last inspected by Codex: 2026-05-16.

NoviceReader is an AI-powered research paper PDF reading helper for beginners,
especially high school students or people without deep background knowledge.

## Product goal

Users upload a research paper PDF, read it in a web viewer, highlight confusing
text or select visual regions such as equations, figures, and tables, then ask
AI for beginner-friendly explanations. AI explanations should be saved as
annotations so users can revisit them and continue asking questions from that
local context.

## Current frontend architecture

- Next.js app router project using Next `16.2.4`, React `19.2.4`, TypeScript,
  `react-pdf`, and `pdfjs-dist`.
- Upload/dashboard page: `app/page.tsx`.
- Reader redirect page: `app/reader/page.tsx`.
- Reader workspace: `app/reader/[paperId]/page.tsx`.
- PDF viewer split:
  - `components/PdfViewer.tsx` dynamically imports the client viewer.
  - `components/PdfViewerClient.tsx` renders the scrollable PDF, text layer,
    annotation overlays, region selection, zoom behavior, and target reveal.
- API/persistence wrappers live in `lib/`:
  - `lib/api.ts` for authenticated backend calls.
  - `lib/guestSession.ts` for guest cloud session plus IndexedDB backup.
  - `lib/localLibrary.ts` for fully local IndexedDB fallback.
  - `lib/deploymentConfig.ts` derives the backend URL from deployment settings
    and `window.location.hostname` for local/LAN usage.
  - `lib/id.ts` provides `createId()` as a safe frontend ID helper.
- Shared TypeScript models live in `types/`.
- Main reader UI currently supports:
  - highlight and region selection modes
  - multi-target selections for explanations
  - saved annotation overlays
  - annotation history/version navigation
  - delete annotation flow with confirmation
  - follow-up concept explanation
  - paper question conversations linked to an annotation target
  - a reader guide/demo flow

## Current backend architecture

- FastAPI backend entrypoint: `backend/main.py`.
- Routers:
  - `backend/app/routes/users.py`: registration, login, current user,
    knowledge profile update, token usage.
  - `backend/app/routes/papers.py`: upload/list/read/delete/PDF file.
  - `backend/app/routes/annotations.py`: annotation list/create/delete.
  - `backend/app/routes/ai.py`: explain, follow-up explain, ask, stateless chat.
  - `backend/app/routes/guest.py`: guest sessions and guest-scoped versions of
    paper, annotation, explain, and ask routes.
- Services:
  - `paper_service.py`: upload, metadata, storage limit, deletion, background
    paper analysis kickoff.
  - `annotation_service.py`: annotation persistence, soft-delete when questions
    still reference targets, follow-up upsert.
  - `question_service.py`: persisted paper question conversations.
  - `ai_service.py`: OpenAI Responses API integration plus placeholder fallback.
  - `context_service.py`: builds prompt context from metadata, selected targets,
    and any saved abstract/summary/nearby blocks.
  - `paper_analysis_service.py`: optional AI-generated paper profile.
  - `user_service.py`: JWT auth, registration, knowledge profile summary.
  - `guest_service.py`: creates guest users/sessions and scopes guest papers.
- Storage abstraction:
  - JSON/local filesystem by default.
  - Optional Postgres via `DATABASE_URL`.
  - Optional S3 PDF storage via `PDF_STORAGE_BACKEND=s3`.
  - Storage implementation is in `backend/app/storage/data_store.py`,
    `pdf_storage.py`, and `paths.py`.

## Current auth and user model state

- The old brief note about a fixed `test-user-001` is stale for normal app
  flows. Authenticated routes now require a bearer JWT.
- Registration requires `REGISTRATION_CODE`.
- Passwords are hashed with `pwdlib[argon2]`.
- JWT settings are controlled by `AUTH_SECRET_KEY`, `AUTH_ALGORITHM`, and
  `ACCESS_TOKEN_EXPIRE_MINUTES`.
- Guest mode creates a backend guest user such as `guest-...` and stores session
  ID/token in browser storage.
- User knowledge profile storage/update exists on the backend, but there is no
  full frontend profile or onboarding editor yet.

## Current AI and context state

- AI calls use the OpenAI Responses API through the `openai` Python package.
- `OPENAI_API_KEY` absent means explanation, follow-up, question, chat, and paper
  analysis flows return placeholder content instead of failing hard.
- AI features currently include:
  - saved annotation explanation
  - saved follow-up explanation
  - persisted question answering conversations
  - stateless `/api/chat`
  - paper analysis profile generation
  - token usage recording
- The backend can attach the original PDF as an OpenAI `input_file`.
- Region selections can send cropped image data URLs as `input_image`.
- Document context extraction is still shallow. It contains metadata and selected
  targets, and it preserves future block types (`abstract`, `summary`,
  `nearby_text`, `user_profile`) if they exist, but no PDF text/abstract/chunk
  extraction pipeline is currently populating them.
- Paper analysis profiles are generated in the background after upload when
  OpenAI is configured, or stored as placeholders otherwise. Frontend has a
  `getPaperAnalysisProfile()` wrapper but no visible UI consuming it yet.

## Key data models

User
- `id`
- `username`
- `displayName`
- `knowledgeProfile`
- `createdAt`
- `updatedAt`

Paper
- `id`
- `userId`
- `originalFilename`
- `storedFilename`
- `storageKey` on backend
- `analysisProfileId`
- `contentType`
- `sizeBytes`
- `createdAt`
- `updatedAt`
- `fileUrl` on API responses

AnnotationTarget
- Text target:
  - `type: "text"`
  - `id`
  - `text`
  - `chunks[]`
  - `createdAt`
- Region target:
  - `type: "region"`
  - `id`
  - `pageNumber`
  - `rect`
  - `imageDataUrl`
  - `createdAt`

AiAnnotation
- `id`
- `paperId`
- `userId`
- `target`
- `targets[]`
- `prompt`
- `response`
- `explanation`
- `versions[]`
- `createdAt`
- `isDeleted`
- `deletedAt`

AiExplanationContent
- `mainExplanation`
- `knowledgePoints[]`
- `followUpConversation[]`
- `relatedConcepts[]`
- `followUpExplanations[]`

QuestionConversation
- `id`
- `paperId`
- `userId`
- `title`
- `turns[]`
- `createdAt`
- `updatedAt`

DocumentContext
- `paperId`
- `userId`
- `blocks[]`
- `strategy`
- `tokenBudgetHint`

PaperAnalysisProfile
- `id`
- `paperId`
- `userId`
- `status`
- `sectionSummaries[]`
- `academicContext`
- `figureAnalyses[]`
- `generationNotes[]`
- `createdAt`
- `updatedAt`

## Known contract mismatches and risks

- Backend `AiAnnotation.target` is optional and `targets[]` is the newer
  selected-content list. TypeScript still requires `target` and makes `targets`
  optional. Several frontend paths still assume `annotation.target` always
  exists.
- `components/PdfViewerClient.tsx` has helper code for multi-target annotations,
  but many lower-level hit testing, overlay, and filtering paths still operate
  on `annotation.target`.
- `lib/localLibrary.ts` and `lib/guestSession.ts` target deletion paths check
  `annotation.target.id`, so multi-target deletion can diverge from backend
  behavior.
- Backend ask/explain requests accept `targets[]`, but persisted
  `QuestionLinkedSelection` stores one `target` and one `annotationTargetId`.
- Backend `PaperRecord` includes `storageKey`; TypeScript `PaperRecord` omits it.
  This is usually harmless because the frontend does not use it, but the API
  contract is not exact.
- `types/paperAnalysis.ts` matches backend paper analysis models, but the data is
  currently unused in the UI.
- `DocumentChatMessage` and `DocumentChatThread` exist in backend models, but
  there is no matching frontend model or persistence route for document chat.

## Important development notes

- Keep `backend/.env` out of Git.
- Keep `backend/.env.example`, `backend/.env.local.example`, and
  `backend/.env.deploy.example`.
- Current local backend runs on port `8000`.
- Current frontend runs on port `3000`.
- `lib/api.ts` and `lib/deploymentConfig.ts` intentionally support LAN devices by
  deriving the backend host from the browser hostname when no explicit
  `NEXT_PUBLIC_API_BASE_URL` is set.
- Avoid `crypto.randomUUID()` directly in frontend. Use `createId()` from
  `lib/id.ts`.
- This repo may have a dirty worktree. Do not revert unrelated user changes.
- There are currently no discovered test files. Last read-only TypeScript smoke
  check run by Codex passed:
  `./node_modules/.bin/tsc --noEmit --incremental false`.
