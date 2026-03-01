import { JSDOM } from "jsdom";
import { Readability } from "@mozilla/readability";
import type { RawArticle } from "../types/index.js";

const CONCURRENCY = 5;
const TIMEOUT_MS = 10_000;

async function fetchFullContent(url: string): Promise<string | undefined> {
  if (url.includes("reddit.com")) return undefined;

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

    const res = await fetch(url, {
      signal: controller.signal,
      headers: { "User-Agent": "Mozilla/5.0 (compatible; ElonUniverseBot/1.0)" },
    });
    clearTimeout(timer);

    if (!res.ok) return undefined;

    const html = await res.text();
    const dom = new JSDOM(html, { url });
    const article = new Readability(dom.window.document).parse();

    return article?.textContent?.trim() || undefined;
  } catch {
    return undefined;
  }
}

export async function scrapeArticles(articles: RawArticle[]): Promise<RawArticle[]> {
  const results: RawArticle[] = [];
  let done = 0;

  for (let i = 0; i < articles.length; i += CONCURRENCY) {
    const batch = articles.slice(i, i + CONCURRENCY);
    const scraped = await Promise.all(
      batch.map(async (article) => {
        const contentFull = await fetchFullContent(article.url);
        return contentFull ? { ...article, contentFull } : article;
      })
    );
    results.push(...scraped);
    done += batch.length;
    process.stdout.write(`\r  스크래핑: ${done}/${articles.length}건`);
  }

  return results;
}
