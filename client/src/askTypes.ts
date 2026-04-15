export type Source = {
  sourcePath: string;
  chunkIndex: number;
  score: number;
  text: string;
};

export type AskResponse = {
  answer: string;
  sources: Source[];
};
