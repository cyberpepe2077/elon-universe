import './load-env.js'
import { writeFile, mkdir } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { collectRss } from "./collectors/rss.js";
import { collectReddit } from "./collectors/reddit.js";
import { collectSecFilings } from "./collectors/sec.js";
import { deduplicateArticles, filterRecent } from "./utils/dedup.js";
import { scrapeArticles } from "./processors/scraper.js";
import { summarizeArticles } from "./processors/summarizer.js";
import type { ProcessedArticle } from "./types/index.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

async function saveResults(articles: ProcessedArticle[]) {
  const outputDir = join(__dirname, "../output");
  await mkdir(outputDir, { recursive: true });

  const date = new Date().toISOString().split("T")[0];
  const filePath = join(outputDir, `${date}.json`);

  await writeFile(filePath, JSON.stringify(articles, null, 2), "utf-8");
  console.log(`\n결과 저장: ${filePath}`);
}

function printSummary(articles: ProcessedArticle[]) {
  const byCategory = {
    tesla: articles.filter((a) => a.category === "tesla"),
    spacex: articles.filter((a) => a.category === "spacex"),
    xai: articles.filter((a) => a.category === "xai"),
  };

  console.log("\n==========================================");
  console.log("          ELON UNIVERSE 데일리 브리핑");
  console.log("==========================================\n");

  console.log("수집 요약:");
  console.log(`  Tesla:  ${byCategory.tesla.length}건`);
  console.log(`  SpaceX: ${byCategory.spacex.length}건`);
  console.log(`  xAI:    ${byCategory.xai.length}건`);

  for (const [category, items] of Object.entries(byCategory)) {
    if (items.length === 0) continue;
    console.log(`\n--- ${category.toUpperCase()} ---`);
    for (const a of items.slice(0, 5)) {
      const badge = a.importance === "high" ? "🔴" : a.importance === "medium" ? "🟡" : "⚪";
      console.log(`  ${badge} [${a.source}] ${a.titleKo}`);
      if (a.summaryKo) console.log(`     ${a.summaryKo.slice(0, 80)}...`);
    }
    if (items.length > 5) console.log(`  ... 외 ${items.length - 5}건`);
  }

  console.log("\n==========================================\n");
}

async function run() {
  console.log("파이프라인 시작...\n");

  // [1/3] 수집
  console.log("[1/3] 뉴스 수집 중...");
  const [rssArticles, redditArticles, secArticles] = await Promise.all([
    collectRss(),
    collectReddit(),
    collectSecFilings(),
  ]);

  const raw = [...rssArticles, ...redditArticles, ...secArticles];
  console.log(`뉴스 수집: 총 ${raw.length}건`);

  // [2/3] 정제 (중복 제거 + 최근 7일 필터)
  console.log("\n[2/4] 정제 중...");
  const refined = filterRecent(deduplicateArticles(raw), 7);
  console.log(`정제 후: ${refined.length}건`);

  if (refined.length === 0) {
    console.log("수집된 기사가 없습니다.");
    return;
  }

  // [3/4] 본문 스크래핑
  console.log("\n[3/3] 본문 스크래핑 중...");
  const scraped = await scrapeArticles(refined);
  const scrapedCount = scraped.filter((a) => a.contentFull).length;
  console.log(`스크래핑 완료: ${scrapedCount}/${scraped.length}건 본문 수집`);

  // AI 번역/요약
  console.log("\n[4/4] AI 번역/요약 중...");
  if (!process.env.GEMINI_API_KEY) {
    console.log("  GEMINI_API_KEY 미설정 — AI 단계 스킵");
    // 키 없으면 그대로 저장 (titleKo 등 비어있는 채로)
    const fallback = scraped.map((a) => ({
      ...a,
      titleKo: a.titleKo ?? a.title,
      summaryKo: a.summaryKo ?? a.content.slice(0, 150),
      importance: a.importance ?? ("low" as const),
    }));
    printSummary(fallback);
    await saveResults(fallback);
    return;
  }

  let processed: ProcessedArticle[];
  try {
    processed = await summarizeArticles(scraped);
    console.log(`번역 완료: ${processed.length}건`);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.log(`  AI 오류 (${msg.slice(0, 80)}) — fallback으로 저장`);
    processed = scraped.map((a) => ({
      ...a,
      titleKo: a.titleKo ?? a.title,
      summaryKo: a.summaryKo ?? a.content.slice(0, 150),
      importance: a.importance ?? ("low" as const),
    }));
  }

  printSummary(processed);
  await saveResults(processed);
}

run().catch(console.error);
