export type Category = "tesla" | "spacex" | "xai";

export interface RawArticle {
  id: string;
  title: string;
  content: string;
  contentFull?: string;
  url: string;
  source: string;
  category: Category;
  publishedAt: Date;
  // AI fields (optional, populated by summarizer)
  titleKo?: string;
  summaryKo?: string;
  importance?: "high" | "medium" | "low";
}

export type ProcessedArticle = RawArticle &
  Required<Pick<RawArticle, "titleKo" | "summaryKo" | "importance">>;
