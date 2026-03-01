import { writeFile, mkdir, access } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { aggregateDay } from "../processors/stock-aggregator.js";
import { computeDailyIndicators } from "../processors/daily-indicators.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const STOCK_DIR = join(__dirname, "../../output/stock");

export interface Candle {
  time: number; // Unix timestamp (seconds)
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface DayCandles {
  symbol: string;
  date: string; // YYYY-MM-DD (ET 기준)
  interval: "1m";
  candles: Candle[];
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

/** Unix timestamp → 미국 동부시간 YYYY-MM-DD */
function toEtDate(unixSec: number): string {
  return new Date(unixSec * 1000).toLocaleDateString("en-CA", {
    timeZone: "America/New_York",
  });
}

/** 해당 날짜의 장이 마감됐는지 확인 (ET 16:30 기준) */
function isMarketClosed(date: string): boolean {
  const now = new Date();
  const etNow = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(now);

  const get = (type: string) =>
    etNow.find((p) => p.type === type)?.value ?? "0";

  const etDateStr = `${get("year")}-${get("month")}-${get("day")}`;
  const etHour = parseInt(get("hour"), 10);
  const etMinute = parseInt(get("minute"), 10);

  // 과거 날짜는 무조건 마감
  if (date < etDateStr) return true;

  // 오늘 날짜면 20:30 이후여야 마감 (데이장 20:00 + 여유)
  if (date === etDateStr) return etHour > 20 || (etHour === 20 && etMinute >= 30);

  // 미래 날짜는 아직 마감 안 됨
  return false;
}

/** 최근 N일 커버를 위한 날짜 범위 (캘린더 10일 = 거래일 ~7일) */
function getRecentDateRange(): { from: string; to: string } {
  const etNow = new Date().toLocaleDateString("en-CA", {
    timeZone: "America/New_York",
  });
  const from = new Date(etNow + "T12:00:00Z");
  from.setDate(from.getDate() - 10);
  return { from: from.toISOString().slice(0, 10), to: etNow };
}

interface PolygonBar {
  t: number; // ms timestamp
  o: number; h: number; l: number; c: number; v: number;
}
interface PolygonResponse {
  results?: PolygonBar[];
  next_url?: string;
  error?: string;
}

async function fetchCandlesPolygon(apiKey: string): Promise<DayCandles[]> {
  const { from, to } = getRecentDateRange();
  const byDate = new Map<string, Candle[]>();

  let nextUrl: string | undefined =
    `https://api.polygon.io/v2/aggs/ticker/TSLA/range/1/minute/${from}/${to}` +
    `?adjusted=true&sort=asc&limit=50000&apiKey=${apiKey}`;

  while (nextUrl) {
    const res = await fetch(nextUrl, { headers: { "User-Agent": "Mozilla/5.0" } });
    if (!res.ok) throw new Error(`Polygon 요청 실패 (${res.status})`);

    const json = (await res.json()) as PolygonResponse;
    if (json.error) throw new Error(json.error);

    for (const r of json.results ?? []) {
      const date = toEtDate(Math.floor(r.t / 1000));
      if (!byDate.has(date)) byDate.set(date, []);
      byDate.get(date)!.push({
        time: Math.floor(r.t / 1000),
        open: r.o, high: r.h, low: r.l, close: r.c, volume: r.v,
      });
    }

    // 7일 분량은 1페이지(50,000 limit)에 들어오므로 사실상 실행 안 됨
    nextUrl = json.next_url ? `${json.next_url}&apiKey=${apiKey}` : undefined;
    if (nextUrl) await new Promise((r) => setTimeout(r, 2000));
  }

  return Array.from(byDate.entries())
    .map(([date, candles]) => ({
      symbol: "TSLA",
      date,
      interval: "1m" as const,
      candles: candles.sort((a, b) => a.time - b.time),
    }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

interface YahooQuote {
  open: (number | null)[];
  high: (number | null)[];
  low: (number | null)[];
  close: (number | null)[];
  volume: (number | null)[];
}

interface YahooResult {
  timestamp: number[];
  indicators: { quote: YahooQuote[] };
}

interface YahooResponse {
  chart: { result: YahooResult[] | null; error: unknown };
}

async function fetchCandles(range: string): Promise<DayCandles[]> {
  const url = `https://query2.finance.yahoo.com/v8/finance/chart/TSLA?range=${range}&interval=1m&includePrePost=true`;
  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0" },
  });

  if (!res.ok) throw new Error(`Yahoo Finance 요청 실패 (${res.status})`);

  const json = (await res.json()) as YahooResponse;
  const result = json.chart.result?.[0];
  if (!result) throw new Error("데이터 없음");

  const { timestamp, indicators } = result;
  const { open, high, low, close, volume } = indicators.quote[0];

  // 날짜별로 그룹핑 (ET 기준)
  const byDate = new Map<string, Candle[]>();
  for (let i = 0; i < timestamp.length; i++) {
    if (open[i] == null || close[i] == null) continue;
    const date = toEtDate(timestamp[i]);
    if (!byDate.has(date)) byDate.set(date, []);
    byDate.get(date)!.push({
      time: timestamp[i],
      open: open[i]!,
      high: high[i]!,
      low: low[i]!,
      close: close[i]!,
      volume: volume[i] ?? 0,
    });
  }

  return Array.from(byDate.entries())
    .map(([date, candles]) => ({
      symbol: "TSLA",
      date,
      interval: "1m" as const,
      candles: candles.sort((a, b) => a.time - b.time),
    }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

export interface StockCollectResult {
  saved: string[]; // 저장된 날짜 목록
  skipped: string[]; // 이미 존재해서 스킵한 날짜 목록
  error?: string;
}

/**
 * TSLA 1분봉 수집.
 * - 첫 실행: range=7d → 최대 7거래일치 백필
 * - 이후: 이미 저장된 날은 스킵
 */
export async function collectStockCandles(): Promise<StockCollectResult> {
  const dir = join(STOCK_DIR, "TSLA");
  await mkdir(dir, { recursive: true });

  const polygonKey = process.env.POLYGON_API_KEY;
  const source = polygonKey ? "Polygon" : "Yahoo Finance";
  console.log(`[stock] 수집 소스: ${source}`);

  let days: DayCandles[];
  try {
    days = polygonKey
      ? await fetchCandlesPolygon(polygonKey)
      : await fetchCandles("7d");
  } catch (e) {
    return { saved: [], skipped: [], error: `[${source}] ${String(e)}` };
  }

  const saved: string[] = [];
  const skipped: string[] = [];

  for (const day of days) {
    // 장 마감 전이면 저장하지 않음 (불완전한 데이터 방지)
    if (!isMarketClosed(day.date)) {
      skipped.push(`${day.date}(장중)`);
      continue;
    }

    const filePath = join(dir, `${day.date}.json`);
    if (await fileExists(filePath)) {
      skipped.push(day.date);
      continue;
    }
    await writeFile(filePath, JSON.stringify(day, null, 2), "utf-8");
    await aggregateDay(filePath);
    saved.push(day.date);
  }

  if (saved.length > 0) {
    await computeDailyIndicators("TSLA").catch((e) =>
      console.warn("[indicators] 재계산 실패:", String(e)),
    );
  }

  return { saved, skipped };
}
