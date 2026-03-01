import Parser from "rss-parser";
import type { Category, RawArticle } from "../types/index.js";

// rss-parser에 커스텀 헤더를 주입하기 위해 직접 fetch 후 파싱
const parser = new Parser();

interface SubredditConfig {
  name: string;
  category: Category;
}

const SUBREDDITS: SubredditConfig[] = [
  { name: "teslamotors", category: "tesla" },
  { name: "TeslaInvestorsClub", category: "tesla" },
  { name: "spacex", category: "spacex" },
  { name: "grok", category: "xai" },
];

// 브라우저처럼 보이는 헤더로 403 우회
const HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
  Accept: "application/rss+xml, application/xml, text/xml, */*",
  "Accept-Language": "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7",
};

export async function collectReddit(limitPerSub = 10): Promise<RawArticle[]> {
  const articles: RawArticle[] = [];

  await Promise.allSettled(
    SUBREDDITS.map(async ({ name, category }) => {
      try {
        const url = `https://www.reddit.com/r/${name}/hot.rss?limit=${limitPerSub}`;

        // 직접 fetch → rss-parser로 파싱
        const res = await fetch(url, { headers: HEADERS });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);

        const xml = await res.text();
        const feed = await parser.parseString(xml);
        const items = feed.items.slice(0, limitPerSub);

        let count = 0;
        for (const item of items) {
          const title = item.title ?? "";
          const content = item.contentSnippet ?? item.content ?? "";

          articles.push({
            id: `reddit-${item.guid ?? item.link ?? title}`,
            title,
            content: content.slice(0, 1000),
            url: item.link ?? "",
            source: `r/${name}`,
            category,
            publishedAt: item.pubDate ? new Date(item.pubDate) : new Date(),
          });
          count++;
        }

        console.log(`[Reddit] r/${name}: ${count}개 수집`);
      } catch (err) {
        console.error(
          `[Reddit] r/${name} 실패:`,
          err instanceof Error ? err.message : err
        );
      }
    })
  );

  return articles;
}
