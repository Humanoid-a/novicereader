export type SelectionTool = "highlight" | "region";

export type NormalizedPdfRect = {
  pageNumber: number;

  /**
   * Normalized coordinates relative to rendered PDF page.
   * Values are 0 to 1.
   */
  x: number;
  y: number;
  width: number;
  height: number;
};

export type TextAnnotationChunk = {
  id: string;
  pageNumber: number;

  /**
   * Text contained in this chunk.
   * For now, this may be the full selected text copied onto each chunk,
   * but later we can improve it to line-level text extraction.
   */
  text: string;

  rect: NormalizedPdfRect;
};

export type TextAnnotationTarget = {
  type: "text";
  id: string;

  /**
   * Full raw selected text for AI/backend use.
   */
  text: string;

  /**
   * Structured chunks that allow the text highlight to be drawn back on the PDF.
   */
  chunks: TextAnnotationChunk[];

  createdAt: string;
};

export type RegionAnnotationTarget = {
  type: "region";
  id: string;
  pageNumber: number;
  rect: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  imageDataUrl?: string;
  createdAt: string;
};

export type AnnotationTarget = TextAnnotationTarget | RegionAnnotationTarget;

export type KnowledgePoint = {
  id: string;
  title: string;
  explanation: string;
};

export type ConversationMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
};

export type AiExplanationContent = {
  mainExplanation: string;
  knowledgePoints: KnowledgePoint[];
  followUpConversation: ConversationMessage[];
  relatedConcepts: string[];
};

export type AiAnnotation = {
  id: string;
  paperId: string;
  userId: string;
  target: AnnotationTarget;
  prompt: string;
  response: string;
  explanation: AiExplanationContent;
  createdAt: string;
};