import type { Source } from "./askTypes.ts";

export type ConversationListItem = {
  id: string;
  title: string;
  updatedAt: string;
};

export type ConversationTurn = {
  id: string;
  createdAt: string;
  question: string;
  answer: string;
  topK: number;
  sources: Source[];
};

export type Conversation = {
  id: string;
  title: string;
  updatedAt: string;
  turns: ConversationTurn[];
};
