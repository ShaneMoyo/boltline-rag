export type Source = {
  sourcePath: string;
  chunkIndex: number;
  score: number;
  text: string;
};

export type AskResponse = {
  answer: string;
  sources: Source[];
  /** Present when the exchange was saved to conversation history. */
  conversationId?: string;
};
