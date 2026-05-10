# NoviceReader Project Brief

NoviceReader is an AI-powered research paper PDF reading helper for beginners, especially high school students or people without deep background knowledge.

## Product goal

Users upload a research paper PDF, read it in a web viewer, highlight confusing text or select visual regions such as equations/figures/tables, and ask AI for beginner-friendly explanations. AI explanations should be saved as annotations so users can revisit them.

## Current frontend

- Next.js app
- Upload page at `/`
- Reader page at `/reader/[paperId]`
- PDF viewer displays full document in scrolling mode
- PDF-only zoom controls
- Right side panel with:
  - Highlight / Region selection mode
  - Compact selection preview
  - Explain selection button
  - AI response area
  - Compact bottom question box
- Text highlight selection stores structured text annotation targets:
  - full selected text
  - chunks
  - normalized rectangles per PDF page
- Region selection stores:
  - page number
  - normalized rectangle
  - cropped image data URL
- Saved annotations can appear as hoverable/clickable overlays on the PDF.
- Region and text annotations should restore the selected content and saved explanation when clicked.
- Delete annotation flow exists with confirmation.

## Current backend

- FastAPI backend
- Test user ID: `test-user-001`
- PDF upload endpoint stores PDFs per user and paper ID
- Paper metadata stored in JSON
- Annotations stored per paper
- User profile subsystem placeholder
- Document context subsystem placeholder
- Document chat subsystem placeholder
- Shared AI service handler using OpenAI Responses API, with placeholder fallback if no API key is configured

## Key data model ideas

User
- id
- displayName
- knowledgeProfile placeholder

Paper
- id
- userId
- originalFilename
- storedFilename
- contentType
- sizeBytes
- createdAt
- updatedAt
- fileUrl

AnnotationTarget
- Text target:
  - type: "text"
  - id
  - text
  - chunks[]
  - createdAt
- Region target:
  - type: "region"
  - id
  - pageNumber
  - rect
  - imageDataUrl
  - createdAt

AiAnnotation
- id
- paperId
- userId
- target
- prompt
- response
- explanation
- createdAt

AiExplanationContent
- mainExplanation
- knowledgePoints[]
- followUpConversation[]
- relatedConcepts[]

DocumentContext
- paperId
- userId
- blocks[]
- strategy
- tokenBudgetHint

## Important development notes

- Keep `backend/.env` out of Git.
- Keep `backend/.env.example`.
- Current local backend runs on port 8000.
- Current frontend runs on port 3000.
- `lib/api.ts` may use `window.location.hostname` so local and LAN devices call the correct backend host.
- Avoid `crypto.randomUUID()` directly in frontend; use a safe helper like `createId()` because some LAN/browser contexts may not support it.