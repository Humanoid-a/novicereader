import { getConfiguredApiBaseUrl } from "@/lib/deploymentConfig";
import type {
  AiAnnotation,
  AiExplanationContent,
  AnnotationTarget,
  FollowUpExplanationItem,
} from "@/types/annotation";
import type { PaperRecord, PaperWithUrls } from "@/types/paper";
import type { QuestionConversation } from "@/types/questions";
import type { UserProfile } from "@/types/user";

const GUEST_DB_NAME = "novicereader_guest";
const GUEST_DB_VERSION = 2;
const GUEST_MODE_STORAGE_KEY = "novicereader_guest_mode";
const GUEST_SERVER_SESSION_STORAGE_KEY = "novicereader_guest_server_session";
const GUEST_USER_ID = "guest-local";

type GuestPaperRecord = PaperRecord & {
  fileUrl?: string;
  fileBlob: Blob;
};

type GuestServerSession = {
  sessionId: string;
  sessionToken: string;
};

type GuestAnnotationRecord = {
  paperId: string;
  annotations: AiAnnotation[];
  updatedAt: string;
};

type GuestConversationRecord = {
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

function getApiBaseUrl() {
  return getConfiguredApiBaseUrl();
}

function getStoredGuestServerSession(): GuestServerSession | null {
  if (typeof window === "undefined") {
    return null;
  }

  const rawSession = window.localStorage.getItem(
    GUEST_SERVER_SESSION_STORAGE_KEY,
  );

  if (!rawSession) {
    return null;
  }

  try {
    const session = JSON.parse(rawSession) as GuestServerSession;

    if (session.sessionId && session.sessionToken) {
      return session;
    }
  } catch {
    window.localStorage.removeItem(GUEST_SERVER_SESSION_STORAGE_KEY);
  }

  return null;
}

function setStoredGuestServerSession(session: GuestServerSession) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(
    GUEST_SERVER_SESSION_STORAGE_KEY,
    JSON.stringify(session),
  );
}

function getGuestSessionHeaders(session: GuestServerSession) {
  return {
    "X-Guest-Session-Id": session.sessionId,
    "X-Guest-Session-Token": session.sessionToken,
  };
}

function requireGuestServerSession(): GuestServerSession {
  const session = getStoredGuestServerSession();

  if (!session) {
    throw new Error("Guest session has ended.");
  }

  return session;
}

async function getGuestErrorMessage(response: Response, fallback: string) {
  try {
    const errorBody = await response.json();

    if (typeof errorBody.detail === "string") {
      return errorBody.detail;
    }
  } catch {
    // Keep the fallback message when the backend does not return JSON.
  }

  return fallback;
}

async function ensureGuestServerSession(): Promise<GuestServerSession> {
  const storedSession = getStoredGuestServerSession();

  if (storedSession) {
    return storedSession;
  }

  const response = await fetch(`${getApiBaseUrl()}/api/guest/session`, {
    method: "POST",
  });

  if (!response.ok) {
    throw new Error("Failed to create guest session.");
  }

  const session = (await response.json()) as GuestServerSession;
  setStoredGuestServerSession(session);

  return session;
}

function openGuestDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = window.indexedDB.open(GUEST_DB_NAME, GUEST_DB_VERSION);

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
  return openGuestDb().then(
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

function guestPaperToPaperWithUrl(paper: GuestPaperRecord): PaperWithUrls {
  return {
    id: paper.id,
    userId: paper.userId,
    originalFilename: paper.originalFilename,
    storedFilename: paper.storedFilename,
    contentType: paper.contentType,
    sizeBytes: paper.sizeBytes,
    createdAt: paper.createdAt,
    updatedAt: paper.updatedAt,
    fileUrl: paper.fileUrl || URL.createObjectURL(paper.fileBlob),
  };
}

export function isGuestSessionActive() {
  if (typeof window === "undefined") {
    return false;
  }

  return window.localStorage.getItem(GUEST_MODE_STORAGE_KEY) === "true";
}

export function startGuestSession() {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(GUEST_MODE_STORAGE_KEY, "true");
}

export function endGuestSessionMode() {
  if (typeof window === "undefined") {
    return;
  }

  window.sessionStorage.removeItem(GUEST_MODE_STORAGE_KEY);
  window.localStorage.removeItem(GUEST_MODE_STORAGE_KEY);
}

export async function endGuestServerSession() {
  const session = getStoredGuestServerSession();

  if (session) {
    await fetch(`${getApiBaseUrl()}/api/guest/session/end`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(session),
    }).catch(() => {
      // The local backup remains available even if the server cleanup check fails.
    });
  }

  endGuestSessionMode();
}

export function getGuestUserProfile(): UserProfile {
  const timestamp = nowIso();

  return {
    id: GUEST_USER_ID,
    username: "guest",
    displayName: "Guest",
    knowledgeProfile: {
      educationLevel: "high_school",
      assumedFromEmptyOnboarding: true,
      backgroundSummary:
        "Guest local session. Assume a curious high-school student who may need research paper concepts explained from first principles.",
      knownCourses: [],
      knownConcepts: [],
      knownDomains: [],
      learningGoals: [],
      weakAreas: [],
      explanationPreference: "beginner-friendly",
      explanationDepth: "gentle",
    },
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

export async function uploadGuestPaper(file: File): Promise<PaperWithUrls> {
  if (!isPdfFile(file)) {
    throw new Error("Only PDF files are allowed.");
  }

  const session = await ensureGuestServerSession();
  const formData = new FormData();
  formData.append("file", file);

  const response = await fetch(`${getApiBaseUrl()}/api/guest/papers`, {
    method: "POST",
    headers: getGuestSessionHeaders(session),
    body: formData,
  });

  if (!response.ok) {
    throw new Error(
      await getGuestErrorMessage(
        response,
        "Failed to upload guest PDF.",
      ),
    );
  }

  const uploadedPaper = (await response.json()) as PaperWithUrls;
  const timestamp = nowIso();
  const paper: GuestPaperRecord = {
    id: uploadedPaper.id,
    userId: uploadedPaper.userId,
    originalFilename: uploadedPaper.originalFilename,
    storedFilename: uploadedPaper.storedFilename,
    contentType: uploadedPaper.contentType,
    sizeBytes: uploadedPaper.sizeBytes,
    createdAt: uploadedPaper.createdAt || timestamp,
    updatedAt: uploadedPaper.updatedAt || timestamp,
    fileUrl: uploadedPaper.fileUrl,
    fileBlob: file,
  };

  await runStoreRequest<IDBValidKey>("papers", "readwrite", (store) =>
    store.put(paper),
  );
  await syncGuestPaperAnnotations(paper.id, []);
  await syncGuestPaperConversations(paper.id, []);

  return uploadedPaper;
}

export async function listGuestPapers(): Promise<PaperWithUrls[]> {
  const localPapers = await runStoreRequest<GuestPaperRecord[]>(
    "papers",
    "readonly",
    (store) => store.getAll(),
  );
  const session = getStoredGuestServerSession();

  if (!session) {
    return localPapers.map(guestPaperToPaperWithUrl);
  }

  try {
    const response = await fetch(`${getApiBaseUrl()}/api/guest/papers`, {
      headers: getGuestSessionHeaders(session),
    });

    if (!response.ok) {
      throw new Error("Failed to load cloud guest papers.");
    }

    return response.json();
  } catch {
    return localPapers.map(guestPaperToPaperWithUrl);
  }
}

export async function getGuestPaper(paperId: string): Promise<PaperWithUrls> {
  const localPaper = await runStoreRequest<GuestPaperRecord | undefined>(
    "papers",
    "readonly",
    (store) => store.get(paperId),
  );
  const session = getStoredGuestServerSession();

  if (session) {
    try {
      const response = await fetch(`${getApiBaseUrl()}/api/guest/papers/${paperId}`, {
        headers: getGuestSessionHeaders(session),
      });

      if (response.ok) {
        return response.json();
      }
    } catch {
      // Fall back to the local backup below.
    }
  }

  if (!localPaper) {
    throw new Error("Guest paper not found.");
  }

  return guestPaperToPaperWithUrl(localPaper);
}

export async function deleteGuestPaper(paperId: string) {
  const session = getStoredGuestServerSession();

  if (session) {
    await fetch(`${getApiBaseUrl()}/api/guest/papers/${paperId}/delete`, {
      method: "POST",
      headers: getGuestSessionHeaders(session),
    }).catch(() => {
      // Local deletion should still succeed if the cloud request fails.
    });
  }

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

export async function listGuestAnnotations(
  paperId: string,
): Promise<AiAnnotation[]> {
  const localAnnotations = await readGuestAnnotations(paperId);
  const session = getStoredGuestServerSession();

  if (!session) {
    return localAnnotations.filter((annotation) => !annotation.isDeleted);
  }

  try {
    const response = await fetch(
      `${getApiBaseUrl()}/api/guest/papers/${paperId}/annotations`,
      {
        headers: getGuestSessionHeaders(session),
      },
    );

    if (!response.ok) {
      throw new Error("Failed to load cloud annotations.");
    }

    const annotations = (await response.json()) as AiAnnotation[];
    await syncGuestPaperAnnotations(paperId, annotations);

    return annotations;
  } catch {
    return localAnnotations.filter((annotation) => !annotation.isDeleted);
  }
}

async function readGuestAnnotations(paperId: string): Promise<AiAnnotation[]> {
  const record = await runStoreRequest<GuestAnnotationRecord | undefined>(
    "annotations",
    "readonly",
    (store) => store.get(paperId),
  );

  return record?.annotations ?? [];
}

export async function syncGuestPaperAnnotations(
  paperId: string,
  annotations: AiAnnotation[],
) {
  await runStoreRequest<IDBValidKey>("annotations", "readwrite", (store) =>
    store.put({
      paperId,
      annotations,
      updatedAt: nowIso(),
    } satisfies GuestAnnotationRecord),
  );
}

export async function createGuestPaperAnnotation(
  paperId: string,
  annotation: AiAnnotation,
): Promise<AiAnnotation> {
  const session = requireGuestServerSession();
  const response = await fetch(
    `${getApiBaseUrl()}/api/guest/papers/${paperId}/annotations`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...getGuestSessionHeaders(session),
      },
      body: JSON.stringify(annotation),
    },
  );

  if (!response.ok) {
    throw new Error(await getGuestErrorMessage(response, "Failed to save annotation"));
  }

  const savedAnnotation = (await response.json()) as AiAnnotation;
  const annotations = await readGuestAnnotations(paperId);
  const nextAnnotations = [...annotations, savedAnnotation];

  await syncGuestPaperAnnotations(paperId, nextAnnotations);

  return savedAnnotation;
}

export async function deleteGuestAnnotationTarget({
  paperId,
  targetId,
}: {
  paperId: string;
  targetId: string;
}) {
  const session = getStoredGuestServerSession();
  const annotations = await readGuestAnnotations(paperId);
  const conversations = await listGuestConversations(paperId);
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

  if (session) {
    await fetch(
      `${getApiBaseUrl()}/api/guest/papers/${paperId}/annotations/targets/${targetId}`,
      {
        method: "DELETE",
        headers: getGuestSessionHeaders(session),
      },
    ).catch(() => {
      // Local backup deletion still proceeds if the cloud request fails.
    });
  }

  if (hasLinkedConversation) {
    const timestamp = nowIso();

    await syncGuestPaperAnnotations(
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
    await syncGuestPaperAnnotations(
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

export async function explainGuestSelection({
  target,
  prompt,
  paperId,
}: {
  paperId: string;
  target: AnnotationTarget;
  prompt: string;
}): Promise<{ explanation: AiExplanationContent }> {
  const session = requireGuestServerSession();
  const response = await fetch(`${getApiBaseUrl()}/api/guest/explain`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...getGuestSessionHeaders(session),
    },
    body: JSON.stringify({
      paperId,
      target,
      prompt,
    }),
  });

  if (!response.ok) {
    throw new Error(await getGuestErrorMessage(response, "Failed to explain selection"));
  }

  return response.json();
}

export async function explainGuestFollowUpConcept({
  paperId,
  annotationId,
  target,
  annotationPrompt,
  annotationExplanation,
  followUpPoint,
}: {
  paperId: string;
  annotationId: string;
  target: AnnotationTarget;
  annotationPrompt: string;
  annotationExplanation: string;
  followUpPoint: string;
}): Promise<{
  explanation: AiExplanationContent;
  followUp: FollowUpExplanationItem;
}> {
  const session = requireGuestServerSession();
  const response = await fetch(`${getApiBaseUrl()}/api/guest/explain/follow-up`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...getGuestSessionHeaders(session),
    },
    body: JSON.stringify({
      paperId,
      annotationId,
      target,
      annotationPrompt,
      annotationExplanation,
      followUpPoint,
    }),
  });

  if (!response.ok) {
    throw new Error(await getGuestErrorMessage(response, "Failed to explain follow-up point"));
  }

  const result = (await response.json()) as {
    explanation: AiExplanationContent;
    followUp: FollowUpExplanationItem;
  };
  const annotations = await readGuestAnnotations(paperId);
  const updatedAnnotations = annotations.map((annotation) => {
    if (annotation.id !== annotationId) {
      return annotation;
    }

    return {
      ...annotation,
      explanation: {
        ...annotation.explanation,
        followUpExplanations: [
          ...(annotation.explanation.followUpExplanations ?? []).filter(
            (savedFollowUp) => savedFollowUp.prompt !== followUpPoint,
          ),
          result.followUp,
        ],
      },
    };
  });

  await syncGuestPaperAnnotations(paperId, updatedAnnotations);

  return result;
}

export async function listGuestConversations(
  paperId: string,
): Promise<QuestionConversation[]> {
  const record = await runStoreRequest<GuestConversationRecord | undefined>(
    "conversations",
    "readonly",
    (store) => store.get(paperId),
  );
  const localConversations = record?.conversations ?? [];
  const session = getStoredGuestServerSession();

  if (!session) {
    return localConversations;
  }

  try {
    const response = await fetch(
      `${getApiBaseUrl()}/api/guest/papers/${paperId}/conversations`,
      {
        headers: getGuestSessionHeaders(session),
      },
    );

    if (!response.ok) {
      throw new Error("Failed to load cloud conversations.");
    }

    const conversations = (await response.json()) as QuestionConversation[];
    await syncGuestPaperConversations(paperId, conversations);

    return conversations;
  } catch {
    return localConversations;
  }
}

export async function syncGuestPaperConversations(
  paperId: string,
  conversations: QuestionConversation[],
) {
  await runStoreRequest<IDBValidKey>("conversations", "readwrite", (store) =>
    store.put({
      paperId,
      conversations,
      updatedAt: nowIso(),
    } satisfies GuestConversationRecord),
  );
}

export async function askGuestAiQuestion({
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
  const session = requireGuestServerSession();
  const response = await fetch(`${getApiBaseUrl()}/api/guest/ask`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...getGuestSessionHeaders(session),
    },
    body: JSON.stringify({
      paperId,
      message,
      conversationId: conversationId ?? null,
      annotationId: annotationId ?? null,
      target: target ?? null,
      annotationExplanation: annotationExplanation ?? null,
    }),
  });

  if (!response.ok) {
    throw new Error(await getGuestErrorMessage(response, "Failed to ask AI question"));
  }

  const result = (await response.json()) as {
    answer: string;
    turn: QuestionConversation["turns"][number];
    conversation: QuestionConversation;
  };
  const conversations = await listGuestConversations(paperId);
  const nextConversations = conversations.some(
    (conversation) => conversation.id === result.conversation.id,
  )
    ? conversations.map((conversation) =>
        conversation.id === result.conversation.id
          ? result.conversation
          : conversation,
      )
    : [...conversations, result.conversation];

  await syncGuestPaperConversations(paperId, nextConversations);

  return result;
}
