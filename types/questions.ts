import type { AnnotationTarget } from "@/types/annotation";

export type QuestionLinkedSelection = {
  annotationId?: string | null;
  annotationTargetId: string;
  target: AnnotationTarget;
  annotationExplanation?: string | null;
};

export type QuestionAnswerTurn = {
  id: string;
  conversationId: string;
  paperId: string;
  userId: string;
  userMessage: string;
  aiResponse: string;
  linkedSelection?: QuestionLinkedSelection | null;
  createdAt: string;
};

export type QuestionConversation = {
  id: string;
  paperId: string;
  userId: string;
  title: string;
  turns: QuestionAnswerTurn[];
  createdAt: string;
  updatedAt: string;
};

export type AskQuestionResponse = {
  answer: string;
  turn: QuestionAnswerTurn;
  conversation: QuestionConversation;
};
