import type { PaperWithUrls } from "@/types/paper";
import type {
  AiAnnotation,
  AnnotationTarget,
  AiExplanationContent,
} from "@/types/annotation";

export function getApiBaseUrl() {
  if (typeof window === "undefined") {
    return "http://localhost:8000";
  }

  return `http://${window.location.hostname}:8000`;
}
export const TEST_USER_ID = "test-user-001";

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
    },
    body: JSON.stringify({
      paperId,
      userId: TEST_USER_ID,
      target,
      prompt,
    }),
  });

  if (!response.ok) {
    throw new Error("Failed to explain selection");
  }

  return response.json();
}

export async function uploadPaper(file: File): Promise<PaperWithUrls> {
  const formData = new FormData();
  formData.append("file", file);

  const response = await fetch(
    `${getApiBaseUrl()}/api/papers?user_id=${TEST_USER_ID}`,
    {
      method: "POST",
      body: formData,
    }
  );

  if (!response.ok) {
    throw new Error("Failed to upload PDF");
  }

  return normalizePaperFileUrl(await response.json());
}

export async function getPaper(paperId: string): Promise<PaperWithUrls> {
  const response = await fetch(
    `${getApiBaseUrl()}/api/papers/${paperId}?user_id=${TEST_USER_ID}`
  );

  if (!response.ok) {
    throw new Error("Failed to load paper");
  }

  return normalizePaperFileUrl(await response.json());
}

export async function listPaperAnnotations(
  paperId: string
): Promise<AiAnnotation[]> {
  const response = await fetch(
    `${getApiBaseUrl()}/api/papers/${paperId}/annotations?user_id=${TEST_USER_ID}`
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
    `${getApiBaseUrl()}/api/papers/${paperId}/annotations?user_id=${TEST_USER_ID}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
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
    `${getApiBaseUrl()}/api/papers/${paperId}/annotations/${annotationId}?user_id=${TEST_USER_ID}`,
    {
      method: "DELETE",
    }
  );

  if (!response.ok) {
    throw new Error("Failed to delete annotation");
  }

  return response.json();
}
