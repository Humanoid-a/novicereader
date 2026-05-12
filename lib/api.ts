import type { PaperWithUrls } from "@/types/paper";
import type {
  AiAnnotation,
  AnnotationTarget,
  AiExplanationContent,
  FollowUpExplanationItem,
} from "@/types/annotation";
import type { AskQuestionResponse, QuestionConversation } from "@/types/questions";
import type { AuthToken, UserProfile } from "@/types/user";
import { getConfiguredApiBaseUrl } from "@/lib/deploymentConfig";

export function getApiBaseUrl() {
  return getConfiguredApiBaseUrl();
}
export const AUTH_TOKEN_STORAGE_KEY = "novicereader_access_token";

export function getStoredAuthToken() {
  if (typeof window === "undefined") {
    return null;
  }

  return window.localStorage.getItem(AUTH_TOKEN_STORAGE_KEY);
}

export function setStoredAuthSession(session: AuthToken) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(AUTH_TOKEN_STORAGE_KEY, session.accessToken);
}

export function clearStoredAuthSession() {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.removeItem(AUTH_TOKEN_STORAGE_KEY);
}

export function getAuthHeaders(): Record<string, string> {
  const token = getStoredAuthToken();

  if (!token) {
    return {};
  }

  return {
    Authorization: `Bearer ${token}`,
  };
}

export async function registerUser({
  username,
  password,
  registrationCode,
  displayName,
}: {
  username: string;
  password: string;
  registrationCode: string;
  displayName?: string;
}): Promise<AuthToken> {
  const response = await fetch(`${getApiBaseUrl()}/api/auth/register`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      username,
      password,
      registrationCode,
      displayName: displayName || null,
    }),
  });

  if (!response.ok) {
    throw new Error(await getErrorMessage(response, "Failed to register"));
  }

  const session = (await response.json()) as AuthToken;
  setStoredAuthSession(session);

  return session;
}

export async function loginUser({
  username,
  password,
}: {
  username: string;
  password: string;
}): Promise<AuthToken> {
  const response = await fetch(`${getApiBaseUrl()}/api/auth/login`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      username,
      password,
    }),
  });

  if (!response.ok) {
    throw new Error(await getErrorMessage(response, "Failed to log in"));
  }

  const session = (await response.json()) as AuthToken;
  setStoredAuthSession(session);

  return session;
}

export async function getCurrentUser(): Promise<UserProfile> {
  const response = await fetch(`${getApiBaseUrl()}/api/auth/me`, {
    headers: getAuthHeaders(),
  });

  if (!response.ok) {
    throw new Error("Not authenticated");
  }

  return response.json();
}

async function getErrorMessage(response: Response, fallback: string) {
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

function normalizePaperFileUrl(paper: PaperWithUrls): PaperWithUrls {
  if (typeof window === "undefined") {
    return paper;
  }

  if (!paper.fileUrl) {
    return paper;
  }

  const fileUrl = new URL(paper.fileUrl, getApiBaseUrl());

  if (
    fileUrl.hostname === "localhost" ||
    fileUrl.hostname === "127.0.0.1" ||
    fileUrl.hostname === "0.0.0.0"
  ) {
    const apiBaseUrl = new URL(getApiBaseUrl());

    fileUrl.protocol = apiBaseUrl.protocol;
    fileUrl.hostname = apiBaseUrl.hostname;
    fileUrl.port = apiBaseUrl.port;
  }

  return {
    ...paper,
    fileUrl: fileUrl.toString(),
  };
}

export async function explainSelection({
  paperId,
  target,
  prompt,
}: {
  paperId: string;
  target: AnnotationTarget;
  prompt: string;
}): Promise<{ explanation: AiExplanationContent }> {
  const response = await fetch(`${getApiBaseUrl()}/api/explain`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...getAuthHeaders(),
    },
    body: JSON.stringify({
      paperId,
      target,
      prompt,
    }),
  });

  if (!response.ok) {
    throw new Error("Failed to explain selection");
  }

  return response.json();
}

export async function explainFollowUpConcept({
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
  const response = await fetch(`${getApiBaseUrl()}/api/explain/follow-up`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...getAuthHeaders(),
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
    throw new Error("Failed to explain follow-up point");
  }

  return response.json();
}

export async function askAiQuestion({
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
}): Promise<AskQuestionResponse> {
  const response = await fetch(`${getApiBaseUrl()}/api/ask`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...getAuthHeaders(),
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
    throw new Error("Failed to ask AI question");
  }

  return response.json();
}

export async function listPaperQuestions(
  paperId: string
): Promise<AskQuestionResponse["turn"][]> {
  const response = await fetch(
    `${getApiBaseUrl()}/api/papers/${paperId}/questions`,
    {
      headers: getAuthHeaders(),
    }
  );

  if (!response.ok) {
    throw new Error("Failed to load question history");
  }

  return response.json();
}

export async function listPaperConversations(
  paperId: string
): Promise<QuestionConversation[]> {
  const response = await fetch(
    `${getApiBaseUrl()}/api/papers/${paperId}/conversations`,
    {
      headers: getAuthHeaders(),
    }
  );

  if (!response.ok) {
    throw new Error("Failed to load conversation history");
  }

  return response.json();
}

export async function uploadPaper(file: File): Promise<PaperWithUrls> {
  const formData = new FormData();
  formData.append("file", file);

  const response = await fetch(
    `${getApiBaseUrl()}/api/papers`,
    {
      method: "POST",
      headers: getAuthHeaders(),
      body: formData,
    }
  );

  if (!response.ok) {
    let message = "Failed to upload PDF";

    try {
      const errorBody = await response.json();

      if (typeof errorBody.detail === "string") {
        message = errorBody.detail;
      }
    } catch {
      // Keep the default upload error when the backend does not return JSON.
    }

    throw new Error(message);
  }

  return normalizePaperFileUrl(await response.json());
}

export async function listPapers(): Promise<PaperWithUrls[]> {
  const response = await fetch(
    `${getApiBaseUrl()}/api/papers`,
    {
      headers: getAuthHeaders(),
    }
  );

  if (!response.ok) {
    throw new Error("Failed to load papers");
  }

  const papers = (await response.json()) as PaperWithUrls[];

  return papers.map(normalizePaperFileUrl);
}

export async function getPaper(paperId: string): Promise<PaperWithUrls> {
  const response = await fetch(
    `${getApiBaseUrl()}/api/papers/${paperId}`,
    {
      headers: getAuthHeaders(),
    }
  );

  if (!response.ok) {
    throw new Error("Failed to load paper");
  }

  return normalizePaperFileUrl(await response.json());
}

export async function deletePaper(
  paperId: string
): Promise<{ success: boolean; deletedPaperId: string }> {
  const response = await fetch(
    `${getApiBaseUrl()}/api/papers/${paperId}/delete`,
    {
      method: "POST",
      headers: getAuthHeaders(),
    }
  );

  if (!response.ok) {
    throw new Error("Failed to delete paper");
  }

  return response.json();
}

export async function listPaperAnnotations(
  paperId: string
): Promise<AiAnnotation[]> {
  const response = await fetch(
    `${getApiBaseUrl()}/api/papers/${paperId}/annotations`,
    {
      headers: getAuthHeaders(),
    }
  );

  if (!response.ok) {
    throw new Error("Failed to load annotations");
  }

  return response.json();
}

export async function createPaperAnnotation(
  paperId: string,
  annotation: AiAnnotation
): Promise<AiAnnotation> {
  const response = await fetch(
    `${getApiBaseUrl()}/api/papers/${paperId}/annotations`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...getAuthHeaders(),
      },
      body: JSON.stringify(annotation),
    }
  );

  if (!response.ok) {
    throw new Error("Failed to save annotation");
  }

  return response.json();
}

export async function deletePaperAnnotation({
  paperId,
  annotationId,
}: {
  paperId: string;
  annotationId: string;
}): Promise<{ success: boolean; deletedAnnotationId: string }> {
  const response = await fetch(
    `${getApiBaseUrl()}/api/papers/${paperId}/annotations/${annotationId}`,
    {
      method: "DELETE",
      headers: getAuthHeaders(),
    }
  );

  if (!response.ok) {
    throw new Error("Failed to delete annotation");
  }

  return response.json();
}

export async function deletePaperAnnotationTarget({
  paperId,
  targetId,
}: {
  paperId: string;
  targetId: string;
}): Promise<{
  success: boolean;
  deletedTargetId: string;
  deletedAnnotationIds: string[];
}> {
  const response = await fetch(
    `${getApiBaseUrl()}/api/papers/${paperId}/annotations/targets/${targetId}`,
    {
      method: "DELETE",
      headers: getAuthHeaders(),
    }
  );

  if (!response.ok) {
    throw new Error("Failed to delete annotation target");
  }

  return response.json();
}
