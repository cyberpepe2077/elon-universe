import Parser from "rss-parser";
import type { Category, RawArticle } from "../types/index.js";

const parser = new Parser();

interface FeedConfig {
  url: string;
  source: string;
  category: Category;
}

const FEEDS: FeedConfig[] = [
  // Tesla
  {
    url: "https://electrek.co/feed/",
    source: "Electrek",
    category: "tesla",
  },
  {
    url: "https://www.teslarati.com/feed/",
    source: "Teslarati",
    category: "tesla",
  },
  // SpaceX
  {
    url: "https://www.nasaspaceflight.com/feed/",
    source: "NASASpaceFlight",
    category: "spacex",
  },
  {
    url: "https://spaceflightnow.com/feed/",
    source: "SpaceflightNow",
    category: "spacex",
  },
  // xAI / AI 공통
  {
    url: "https://techcrunch.com/feed/",
    source: "TechCrunch",
    category: "xai",
  },
  {
    url: "https://feeds.arstechnica.com/arstechnica/index",
    source: "Ars Technica",
    category: "xai",
  },
];

// 카테고리별 관련 키워드 필터
const KEYWORDS: Record<Category, string[]> = {
  tesla: ["tesla", "elon musk", "fsd", "cybertruck", "model s", "model 3", "model x", "model y", "powerwall", "megapack"],
  spacex: ["spacex", "starship", "falcon", "starlink", "elon musk", "rocket", "launch"],
  xai: ["xai", "grok", "elon musk", "x.ai", "artificial intelligence", "llm"],
};

function isRelevant(text: string, category: Category): boolean {
  const lower = text.toLowerCase();
  return KEYWORDS[category].some((kw) => lower.includes(kw));
}

export async function collectRss(limitPerFeed = 10): Promise<RawArticle[]> {
  const articles: RawArticle[] = [];

  await Promise.allSettled(
    FEEDS.map(async ({ url, source, category }) => {
      try {
        const feed = await parser.parseURL(url);
        const items = feed.items.slice(0, limitPerFeed);

        for (const item of items) {
          const title = item.title ?? "";
          const content = item.contentSnippet ?? item.content ?? "";

          if (!isRelevant(title + " " + content, category)) continue;

          articles.push({
            id: item.guid ?? item.link ?? `${source}-${Date.now()}`,
            title,
            content: content.slice(0, 1000), // 토큰 절약을 위해 1000자 제한
            url: item.link ?? "",
            source,
            category,
            publishedAt: item.pubDate ? new Date(item.pubDate) : new Date(),
          });
        }
        console.log(`[RSS] ${source}: ${articles.length}개 수집`);
      } catch (err) {
        console.error(`[RSS] ${source} 실패:`, err instanceof Error ? err.message : err);
      }
    })
  );

  return articles;
}
