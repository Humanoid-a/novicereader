import { createId } from "@/lib/id";
import type {
  AiAnnotation,
  AiExplanationContent,
  AnnotationTarget,
  FollowUpExplanationItem,
} from "@/types/annotation";
import type { PaperRecord, PaperWithUrls } from "@/types/paper";
import type { QuestionConversation } from "@/types/questions";

const LOCAL_DB_NAME = "novicereader_local_library";
const LOCAL_DB_VERSION = 1;
const LOCAL_PAPER_PREFIX = "local-";

type LocalPaperRecord = PaperRecord & {
  fileBlob: Blob;
};

type LocalAnnotationRecord = {
  paperId: string;
  annotations: AiAnnotation[];
  updatedAt: string;
};

type LocalConversationRecord = {
  paperId: string;
  conversations: QuestionConversation[];
  updatedAt: string;
};

function nowIso() {
  return new Date().toISOString();
}

function isPdfFile(file: File) {
  return file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
}

function openLocalDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = window.indexedDB.open(LOCAL_DB_NAME, LOCAL_DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;

      if (!db.objectStoreNames.contains("papers")) {
        db.createObjectStore("papers", { keyPath: "id" });
      }

      if (!db.objectStoreNames.contains("annotations")) {
        db.createObjectStore("annotations", { keyPath: "paperId" });
      }

      if (!db.objectStoreNames.contains("conversations")) {
        db.createObjectStore("conversations", { keyPath: "paperId" });
      }
    };

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
  });
}

function runStoreRequest<T>(
  storeName: string,
  mode: IDBTransactionMode,
  callback: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return openLocalDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const transaction = db.transaction(storeName, mode);
        const request = callback(transaction.objectStore(storeName));

        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve(request.result);
        transaction.oncomplete = () => db.close();
        transaction.onerror = () => {
          db.close();
          reject(transaction.error);
        };
      }),
  );
}

function localPaperToPaperWithUrl(paper: LocalPaperRecord): PaperWithUrls {
  return {
    id: paper.id,
    userId: paper.userId,
    originalFilename: paper.originalFilename,
    storedFilename: paper.storedFilename,
    contentType: paper.contentType,
    sizeBytes: paper.sizeBytes,
    createdAt: paper.createdAt,
    updatedAt: paper.updatedAt,
    fileUrl: URL.createObjectURL(paper.fileBlob),
  };
}

function buildLocalExplanation(
  target: AnnotationTarget,
  prompt: string,
): AiExplanationContent {
  const selectedPreview =
    target.type === "text"
      ? target.text.replace(/\s+/g, " ").trim().slice(0, 520)
      : `the selected region on page ${target.pageNumber}`;
  const mainExplanation =
    "Local-only note:\n\n"
    + "This paper is stored on this computer, so cloud AI explanation is not "
    + "available for this selection yet. The selection is saved locally.\n\n"
    + `Selected content: ${selectedPreview}`;

  return {
    mainExplanation:
      prompt.trim().length > 0
        ? `${mainExplanation}\n\nPrompt: ${prompt.trim()}`
        : mainExplanation,
    knowledgePoints: [],
    followUpConversation: [],
    relatedConcepts:
      target.type === "text"
        ? ["What does this selected text mean?", "Which terms need background?"]
        : ["What should I notice in this selected region?"],
    followUpExplanations: [],
  };
}

function buildLocalFollowUpResponse(prompt: string) {
  return (
    "Local-only follow-up:\n\n"
    + `You asked about "${prompt}". This follow-up is saved locally. Delete `
    + "cloud files to free space if you want future uploads to use cloud AI."
  );
}

function buildLocalQuestionAnswer(message: string, target?: AnnotationTarget | null) {
  const reference =
    target?.type === "text"
      ? `\n\nReferenced text: ${target.text.replace(/\s+/g, " ").trim().slice(0, 420)}`
      : target?.type === "region"
        ? `\n\nReferenced region: page ${target.pageNumber}.`
        : "";

  return (
    "Local-only answer:\n\n"
    + "This paper is stored on this computer, so cloud AI is not available for "
    + "this question yet. Your question is saved locally.\n\n"
    + `Question: ${message}${reference}`
  );
}

export function isLocalPaperId(paperId: string) {
  return paperId.startsWith(LOCAL_PAPER_PREFIX);
}

export async function uploadLocalPaper(
  file: File,
  userId: string,
): Promise<PaperWithUrls> {
  if (!isPdfFile(file)) {
    throw new Error("Only PDF files are allowed.");
  }

  const timestamp = nowIso();
  const paper: LocalPaperRecord = {
    id: `${LOCAL_PAPER_PREFIX}${createId()}`,
    userId,
    originalFilename: file.name || "local-paper.pdf",
    storedFilename: file.name || "local-paper.pdf",
    contentType: file.type || "application/pdf",
    sizeBytes: file.size,
    createdAt: timestamp,
    updatedAt: timestamp,
    fileBlob: file,
  };

  await runStoreRequest<IDBValidKey>("papers", "readwrite", (store) =>
    store.put(paper),
  );
  await syncLocalPaperAnnotations(paper.id, []);
  await syncLocalPaperConversations(paper.id, []);

  return localPaperToPaperWithUrl(paper);
}

export async function listLocalPapers(userId: string): Promise<PaperWithUrls[]> {
  const papers = await runStoreRequest<LocalPaperRecord[]>(
    "papers",
    "readonly",
    (store) => store.getAll(),
  );

  return papers
    .filter((paper) => paper.userId === userId)
    .map(localPaperToPaperWithUrl);
}

export async function getLocalPaper(paperId: string): Promise<PaperWithUrls> {
  const paper = await runStoreRequest<LocalPaperRecord | undefined>(
    "papers",
    "readonly",
    (store) => store.get(paperId),
  );

  if (!paper) {
    throw new Error("Local paper not found.");
  }

  return localPaperToPaperWithUrl(paper);
}

export async function deleteLocalPaper(paperId: string) {
  await runStoreRequest<undefined>("papers", "readwrite", (store) =>
    store.delete(paperId),
  );
  await runStoreRequest<undefined>("annotations", "readwrite", (store) =>
    store.delete(paperId),
  );
  await runStoreRequest<undefined>("conversations", "readwrite", (store) =>
    store.delete(paperId),
  );

  return { success: true, deletedPaperId: paperId };
}

async function readLocalAnnotations(paperId: string): Promise<AiAnnotation[]> {
  const record = await runStoreRequest<LocalAnnotationRecord | undefined>(
    "annotations",
    "readonly",
    (store) => store.get(paperId),
  );

  return record?.annotations ?? [];
}

export async function listLocalAnnotations(paperId: string): Promise<AiAnnotation[]> {
  const annotations = await readLocalAnnotations(paperId);

  return annotations.filter((annotation) => !annotation.isDeleted);
}

async function syncLocalPaperAnnotations(
  paperId: string,
  annotations: AiAnnotation[],
) {
  await runStoreRequest<IDBValidKey>("annotations", "readwrite", (store) =>
    store.put({
      paperId,
      annotations,
      updatedAt: nowIso(),
    } satisfies LocalAnnotationRecord),
  );
}

export async function createLocalPaperAnnotation(
  paperId: string,
  annotation: AiAnnotation,
): Promise<AiAnnotation> {
  const annotations = await readLocalAnnotations(paperId);
  const nextAnnotations = [...annotations, annotation];

  await syncLocalPaperAnnotations(paperId, nextAnnotations);

  return annotation;
}

export async function deleteLocalAnnotationTarget({
  paperId,
  targetId,
}: {
  paperId: string;
  targetId: string;
}) {
  const annotations = await readLocalAnnotations(paperId);
  const conversations = await listLocalConversations(paperId);
  const deletedAnnotationIds = annotations
    .filter(
      (annotation) => !annotation.isDeleted && annotation.target.id === targetId,
    )
    .map((annotation) => annotation.id);
  const hasLinkedConversation = conversations.some((conversation) =>
    conversation.turns.some(
      (turn) => turn.linkedSelection?.annotationTargetId === targetId,
    ),
  );

  if (hasLinkedConversation) {
    const timestamp = nowIso();

    await syncLocalPaperAnnotations(
      paperId,
      annotations.map((annotation) =>
        annotation.target.id === targetId
          ? {
              ...annotation,
              isDeleted: true,
              deletedAt: timestamp,
            }
          : annotation,
      ),
    );
  } else {
    await syncLocalPaperAnnotations(
      paperId,
      annotations.filter((annotation) => annotation.target.id !== targetId),
    );
  }

  return {
    success: true,
    deletedTargetId: targetId,
    deletedAnnotationIds,
  };
}

export async function explainLocalSelection({
  target,
  prompt,
}: {
  target: AnnotationTarget;
  prompt: string;
}): Promise<{ explanation: AiExplanationContent }> {
  return {
    explanation: buildLocalExplanation(target, prompt),
  };
}

export async function explainLocalFollowUpConcept({
  paperId,
  annotationId,
  followUpPoint,
}: {
  paperId: string;
  annotationId: string;
  followUpPoint: string;
}): Promise<{
  explanation: AiExplanationContent;
  followUp: FollowUpExplanationItem;
}> {
  const timestamp = nowIso();
  const followUp: FollowUpExplanationItem = {
    id: createId(),
    prompt: followUpPoint,
    response: buildLocalFollowUpResponse(followUpPoint),
    createdAt: timestamp,
    updatedAt: timestamp,
  };
  const annotations = await readLocalAnnotations(paperId);
  const updatedAnnotations = annotations.map((annotation) =>
    annotation.id === annotationId
      ? {
          ...annotation,
          explanation: {
            ...annotation.explanation,
            followUpExplanations: [
              ...(annotation.explanation.followUpExplanations ?? []).filter(
                (savedFollowUp) => savedFollowUp.prompt !== followUpPoint,
              ),
              followUp,
            ],
          },
        }
      : annotation,
  );

  await syncLocalPaperAnnotations(paperId, updatedAnnotations);

  return {
    explanation: {
      mainExplanation: followUp.response ?? "",
      knowledgePoints: [],
      followUpConversation: [],
      relatedConcepts: [],
      followUpExplanations: [],
    },
    followUp,
  };
}

export async function listLocalConversations(
  paperId: string,
): Promise<QuestionConversation[]> {
  const record = await runStoreRequest<LocalConversationRecord | undefined>(
    "conversations",
    "readonly",
    (store) => store.get(paperId),
  );

  return record?.conversations ?? [];
}

async function syncLocalPaperConversations(
  paperId: string,
  conversations: QuestionConversation[],
) {
  await runStoreRequest<IDBValidKey>("conversations", "readwrite", (store) =>
    store.put({
      paperId,
      conversations,
      updatedAt: nowIso(),
    } satisfies LocalConversationRecord),
  );
}

export async function askLocalAiQuestion({
  paperId,
  message,
  conversationId,
  annotationId,
  target,
  annotationExplanation,
}: {
  paperId: string;
  message: string;
  conversationId?: string | null;
  annotationId?: string | null;
  target?: AnnotationTarget | null;
  annotationExplanation?: string | null;
}) {
  const conversations = await listLocalConversations(paperId);
  const timestamp = nowIso();
  const existingConversation = conversationId
    ? conversations.find((conversation) => conversation.id === conversationId)
    : null;
  const conversation =
    existingConversation ??
    ({
      id: createId(),
      paperId,
      userId: "local",
      title: "Local paper questions",
      turns: [],
      createdAt: timestamp,
      updatedAt: timestamp,
    } satisfies QuestionConversation);
  const linkedSelection = target
    ? {
        annotationId: annotationId ?? null,
        annotationTargetId: target.id,
        target,
        annotationExplanation: annotationExplanation ?? null,
      }
    : null;
  const turn = {
    id: createId(),
    conversationId: conversation.id,
    paperId,
    userId: conversation.userId,
    userMessage: message,
    aiResponse: buildLocalQuestionAnswer(message, target),
    linkedSelection,
    createdAt: timestamp,
  };
  const updatedConversation: QuestionConversation = {
    ...conversation,
    turns: [...conversation.turns, turn],
    updatedAt: timestamp,
  };
  const nextConversations = existingConversation
    ? conversations.map((currentConversation) =>
        currentConversation.id === updatedConversation.id
          ? updatedConversation
          : currentConversation,
      )
    : [...conversations, updatedConversation];

  await syncLocalPaperConversations(paperId, nextConversations);

  return {
    answer: turn.aiResponse,
    turn,
    conversation: updatedConversation,
  };
}
