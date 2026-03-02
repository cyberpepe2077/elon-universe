import './load-env.js'
import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { readdir, readFile, unlink } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync } from "node:fs";
import { spawn } from "node:child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUTPUT_DIR = join(__dirname, "../../pipeline/output");
const STOCK_DIR = join(__dirname, "../../pipeline/output/stock");
const REPO_ROOT = join(__dirname, "../../..");

type Category = "tesla" | "spacex" | "xai";

interface Article {
  id: string;
  title: string;
  content: string;
  contentFull?: string;
  url: string;
  source: string;
  category: Category;
  publishedAt: string;
  titleKo?: string;
  summaryKo?: string;
  importance?: "high" | "medium" | "low";
}

async function getLatestArticles(): Promise<Article[]> {
  try {
    const files = await readdir(OUTPUT_DIR);
    const jsonFiles = files.filter((f) => f.endsWith(".json")).sort().reverse();

    if (jsonFiles.length === 0) return [];

    const latest = jsonFiles[0];
    const raw = await readFile(join(OUTPUT_DIR, latest), "utf-8");
    return JSON.parse(raw) as Article[];
  } catch {
    return [];
  }
}

// ── 어드민 실행 상태 (in-memory) ──────────────────────────────────────────
const MAX_LOG = 300;
let pipelineRunning = false;
let stockRunning = false;
let backfillRunning = false;
let indicatorsRunning = false;
let earningsRunning = false;
let optionsRunning = false;
let exportRunning = false;
const pipelineLog: string[] = [];
const stockLog: string[] = [];
const backfillLog: string[] = [];
const indicatorsLog: string[] = [];
const earningsLog: string[] = [];
const optionsLog: string[] = [];
const exportLog: string[] = [];

function appendLog(lines: string[], data: Buffer) {
  const newLines = data.toString().split("\n").filter((l) => l.trim());
  lines.push(...newLines);
  if (lines.length > MAX_LOG) lines.splice(0, lines.length - MAX_LOG);
}

// ── App ───────────────────────────────────────────────────────────────────
const app = new Hono();

app.use("/api/*", cors());

app.get("/api/articles", async (c) => {
  const category = c.req.query("category") as Category | undefined;
  const articles = await getLatestArticles();

  const filtered = category
    ? articles.filter((a) => a.category === category)
    : articles;

  return c.json({ articles: filtered, total: filtered.length });
});

app.get("/api/stock/:symbol", async (c) => {
  const symbol = c.req.param("symbol").toUpperCase();
  const range = c.req.query("range") ?? "3mo";
  const interval = c.req.query("interval") ?? "1d";

  try {
    const url = `https://query2.finance.yahoo.com/v8/finance/chart/${symbol}?range=${range}&interval=${interval}`;
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0" },
    });
    if (!res.ok) return c.json({ error: "Yahoo Finance 요청 실패" }, 502);

    const data = await res.json() as {
      chart: {
        result: Array<{
          timestamp: number[];
          meta: { regularMarketPrice: number; previousClose: number; symbol: string };
          indicators: { quote: Array<{ open: number[]; high: number[]; low: number[]; close: number[]; volume: number[] }> };
        }> | null;
        error: unknown;
      };
    };

    if (!data.chart.result) return c.json({ error: "데이터 없음" }, 404);

    const result = data.chart.result[0];
    const { timestamp, meta, indicators } = result;
    const { open, high, low, close, volume } = indicators.quote[0];

    const candles = timestamp
      .map((t, i) => ({
        time: t,
        open: open[i],
        high: high[i],
        low: low[i],
        close: close[i],
        volume: volume[i],
      }))
      .filter((c) => c.open != null && c.close != null);

    return c.json({
      symbol: meta.symbol,
      price: meta.regularMarketPrice,
      previousClose: meta.previousClose,
      candles,
    });
  } catch {
    return c.json({ error: "서버 오류" }, 500);
  }
});

// 저장된 1분봉 날짜 목록 (candle count 포함)
app.get("/api/stock/:symbol/dates", async (c) => {
  const symbol = c.req.param("symbol").toUpperCase();
  const dir = join(STOCK_DIR, symbol);
  try {
    const files = await readdir(dir);
    const jsonFiles = files.filter((f) => f.endsWith(".json") && !f.endsWith("_agg.json")).sort().reverse();

    const dates = await Promise.all(
      jsonFiles.map(async (f) => {
        const date = f.replace(".json", "");
        try {
          const raw = await readFile(join(dir, f), "utf-8");
          const parsed = JSON.parse(raw) as { candles: unknown[] };
          return { date, count: parsed.candles.length };
        } catch {
          return { date, count: 0 };
        }
      }),
    );

    return c.json({ symbol, dates });
  } catch {
    return c.json({ symbol, dates: [] });
  }
});

// 특정 날짜의 1분봉 데이터
app.get("/api/stock/:symbol/candles", async (c) => {
  const symbol = c.req.param("symbol").toUpperCase();
  const date = c.req.query("date");
  if (!date) return c.json({ error: "date 파라미터 필요 (YYYY-MM-DD)" }, 400);

  const filePath = join(STOCK_DIR, symbol, `${date}.json`);
  if (!existsSync(filePath)) {
    return c.json({ error: `${date} 데이터 없음` }, 404);
  }

  try {
    const raw = await readFile(filePath, "utf-8");
    return c.json(JSON.parse(raw));
  } catch {
    return c.json({ error: "파일 읽기 실패" }, 500);
  }
});

// 저장된 전체 1분봉 (날짜 순 연결)
app.get("/api/stock/:symbol/candles/all", async (c) => {
  const symbol = c.req.param("symbol").toUpperCase();
  const dir = join(STOCK_DIR, symbol);
  try {
    const files = await readdir(dir);
    const jsonFiles = files.filter((f) => f.endsWith(".json")).sort();

    const allCandles: unknown[] = [];
    for (const f of jsonFiles) {
      try {
        const raw = await readFile(join(dir, f), "utf-8");
        const parsed = JSON.parse(raw) as { candles: unknown[] };
        allCandles.push(...parsed.candles);
      } catch { /* skip broken file */ }
    }

    return c.json({ symbol, candles: allCandles });
  } catch {
    return c.json({ symbol, candles: [] });
  }
});

// 특정 날짜의 집계 데이터 (5m/15m/30m/1h)
app.get("/api/stock/:symbol/agg", async (c) => {
  const symbol = c.req.param("symbol").toUpperCase();
  const date = c.req.query("date");
  if (!date) return c.json({ error: "date 파라미터 필요 (YYYY-MM-DD)" }, 400);

  const filePath = join(STOCK_DIR, symbol, `${date}_agg.json`);
  if (!existsSync(filePath)) return c.json({ error: `${date} 집계 데이터 없음` }, 404);

  try {
    return c.json(JSON.parse(await readFile(filePath, "utf-8")));
  } catch {
    return c.json({ error: "파일 읽기 실패" }, 500);
  }
});

// 일봉 기술적 지표 (RSI, MACD, BB, SMA, EMA, OBV, ATR)
app.get("/api/stock/:symbol/indicators", async (c) => {
  const symbol = c.req.param("symbol").toUpperCase();
  const filePath = join(STOCK_DIR, symbol, "indicators.json");
  if (!existsSync(filePath)) {
    return c.json(
      { error: "지표 데이터 없음. compute:indicators 실행 필요" },
      404,
    );
  }
  try {
    return c.json(JSON.parse(await readFile(filePath, "utf-8")));
  } catch {
    return c.json({ error: "파일 읽기 실패" }, 500);
  }
});

// 옵션 체인 — 파이프라인(collect:options)이 수집한 options.json 서빙
app.get("/api/stock/:symbol/options", async (c) => {
  const symbol = c.req.param("symbol").toUpperCase();
  const filePath = join(STOCK_DIR, symbol, "options.json");
  if (!existsSync(filePath)) {
    return c.json(
      { error: "옵션 데이터 없음. collect:options 실행 필요" },
      404,
    );
  }
  try {
    return c.json(JSON.parse(await readFile(filePath, "utf-8")));
  } catch {
    return c.json({ error: "파일 읽기 실패" }, 500);
  }
});

// 분기 실적 — 파이프라인(collect:earnings)이 수집한 earnings.json 서빙
app.get("/api/stock/:symbol/earnings", async (c) => {
  const symbol = c.req.param("symbol").toUpperCase();
  const filePath = join(STOCK_DIR, symbol, "earnings.json");
  if (!existsSync(filePath)) {
    return c.json(
      { error: "실적 데이터 없음. collect:earnings 실행 필요" },
      404,
    );
  }
  try {
    return c.json(JSON.parse(await readFile(filePath, "utf-8")));
  } catch {
    return c.json({ error: "파일 읽기 실패" }, 500);
  }
});

app.get("/api/articles/dates", async (c) => {
  try {
    const files = await readdir(OUTPUT_DIR);
    const dates = files
      .filter((f) => f.endsWith(".json"))
      .map((f) => f.replace(".json", ""))
      .sort()
      .reverse();
    return c.json({ dates });
  } catch {
    return c.json({ dates: [] });
  }
});

// ── 어드민 제어 ────────────────────────────────────────────────────────────

app.get("/api/admin/config", (c) => {
  return c.json({ polygonKeyConfigured: !!process.env.POLYGON_API_KEY });
});

app.get("/api/admin/status", (c) => {
  return c.json({
    pipeline: { running: pipelineRunning, log: [...pipelineLog] },
    stock: { running: stockRunning, log: [...stockLog] },
    backfill: { running: backfillRunning, log: [...backfillLog] },
    indicators: { running: indicatorsRunning, log: [...indicatorsLog] },
    earnings: { running: earningsRunning, log: [...earningsLog] },
    options: { running: optionsRunning, log: [...optionsLog] },
    export: { running: exportRunning, log: [...exportLog] },
  });
});

function triggerExport(reason: string) {
  if (exportRunning) {
    exportLog.push(`[자동] ${reason} 완료 → 내보내기 이미 실행 중, 스킵`);
    return;
  }
  exportRunning = true;
  exportLog.length = 0;
  exportLog.push(`[자동] ${reason} 완료 → 내보내기 시작`);

  const proc = spawn(
    "pnpm",
    ["--filter", "pipeline", "run", "export:static"],
    { cwd: REPO_ROOT, shell: true },
  );
  proc.stdout?.on("data", (d: Buffer) => appendLog(exportLog, d));
  proc.stderr?.on("data", (d: Buffer) => appendLog(exportLog, d));
  proc.on("close", (code) => {
    exportRunning = false;
    exportLog.push(`--- 완료 (exit ${String(code)}) ---`);
  });
}

app.post("/api/admin/run/pipeline", (c) => {
  if (pipelineRunning || stockRunning) {
    return c.json({ error: "이미 실행 중" }, 409);
  }

  pipelineRunning = true;
  pipelineLog.length = 0;

  const proc = spawn("pnpm", ["pipeline"], { cwd: REPO_ROOT, shell: true });
  proc.stdout?.on("data", (d: Buffer) => appendLog(pipelineLog, d));
  proc.stderr?.on("data", (d: Buffer) => appendLog(pipelineLog, d));
  proc.on("close", (code) => {
    pipelineRunning = false;
    pipelineLog.push(`--- 완료 (exit ${String(code)}) ---`);
    if (code === 0) triggerExport("뉴스 수집");
  });

  return c.json({ started: true });
});

app.post("/api/admin/run/stock", (c) => {
  if (pipelineRunning || stockRunning) {
    return c.json({ error: "이미 실행 중" }, 409);
  }

  stockRunning = true;
  stockLog.length = 0;

  const proc = spawn(
    "pnpm",
    ["--filter", "pipeline", "run", "collect:stock"],
    { cwd: REPO_ROOT, shell: true },
  );
  proc.stdout?.on("data", (d: Buffer) => appendLog(stockLog, d));
  proc.stderr?.on("data", (d: Buffer) => appendLog(stockLog, d));
  proc.on("close", (code) => {
    stockRunning = false;
    stockLog.push(`--- 완료 (exit ${String(code)}) ---`);
    if (code === 0) triggerExport("주식 수집");
  });

  return c.json({ started: true });
});

app.post("/api/admin/run/indicators", (c) => {
  if (indicatorsRunning) return c.json({ error: "이미 실행 중" }, 409);

  indicatorsRunning = true;
  indicatorsLog.length = 0;

  const proc = spawn(
    "pnpm",
    ["--filter", "pipeline", "run", "compute:indicators"],
    { cwd: REPO_ROOT, shell: true },
  );
  proc.stdout?.on("data", (d: Buffer) => appendLog(indicatorsLog, d));
  proc.stderr?.on("data", (d: Buffer) => appendLog(indicatorsLog, d));
  proc.on("close", (code) => {
    indicatorsRunning = false;
    indicatorsLog.push(`--- 완료 (exit ${String(code)}) ---`);
    if (code === 0) triggerExport("지표 계산");
  });

  return c.json({ started: true });
});

app.post("/api/admin/run/earnings", (c) => {
  if (earningsRunning) return c.json({ error: "이미 실행 중" }, 409);

  earningsRunning = true;
  earningsLog.length = 0;

  const proc = spawn(
    "pnpm",
    ["--filter", "pipeline", "run", "collect:earnings"],
    { cwd: REPO_ROOT, shell: true },
  );
  proc.stdout?.on("data", (d: Buffer) => appendLog(earningsLog, d));
  proc.stderr?.on("data", (d: Buffer) => appendLog(earningsLog, d));
  proc.on("close", (code) => {
    earningsRunning = false;
    earningsLog.push(`--- 완료 (exit ${String(code)}) ---`);
    if (code === 0) triggerExport("실적 수집");
  });

  return c.json({ started: true });
});

app.post("/api/admin/run/options", (c) => {
  if (optionsRunning) return c.json({ error: "이미 실행 중" }, 409);

  optionsRunning = true;
  optionsLog.length = 0;

  const proc = spawn(
    "pnpm",
    ["--filter", "pipeline", "run", "collect:options"],
    { cwd: REPO_ROOT, shell: true },
  );
  proc.stdout?.on("data", (d: Buffer) => appendLog(optionsLog, d));
  proc.stderr?.on("data", (d: Buffer) => appendLog(optionsLog, d));
  proc.on("close", (code) => {
    optionsRunning = false;
    optionsLog.push(`--- 완료 (exit ${String(code)}) ---`);
    if (code === 0) triggerExport("옵션 수집");
  });

  return c.json({ started: true });
});

app.post("/api/admin/run/export", (c) => {
  if (exportRunning) return c.json({ error: "이미 실행 중" }, 409);

  exportRunning = true;
  exportLog.length = 0;

  const proc = spawn(
    "pnpm",
    ["--filter", "pipeline", "run", "export:static"],
    { cwd: REPO_ROOT, shell: true },
  );
  proc.stdout?.on("data", (d: Buffer) => appendLog(exportLog, d));
  proc.stderr?.on("data", (d: Buffer) => appendLog(exportLog, d));
  proc.on("close", (code) => {
    exportRunning = false;
    exportLog.push(`--- 완료 (exit ${String(code)}) ---`);
  });

  return c.json({ started: true });
});

app.post("/api/admin/run/backfill", async (c) => {
  if (pipelineRunning || stockRunning || backfillRunning) {
    return c.json({ error: "이미 실행 중" }, 409);
  }
  if (!process.env.POLYGON_API_KEY) {
    return c.json({ error: "POLYGON_API_KEY 환경변수가 설정되지 않았습니다." }, 400);
  }

  const body = await c.req.json<{ from?: string; to?: string }>();
  const { from, to } = body;
  if (!from || !to) return c.json({ error: "from, to 필드 필요 (YYYY-MM-DD)" }, 400);

  backfillRunning = true;
  backfillLog.length = 0;

  const proc = spawn(
    "pnpm",
    ["--filter", "pipeline", "run", "backfill:stock", "--", `--from=${from}`, `--to=${to}`],
    { cwd: REPO_ROOT, shell: true, env: process.env },
  );
  proc.stdout?.on("data", (d: Buffer) => appendLog(backfillLog, d));
  proc.stderr?.on("data", (d: Buffer) => appendLog(backfillLog, d));
  proc.on("close", (code) => {
    backfillRunning = false;
    backfillLog.push(`--- 완료 (exit ${String(code)}) ---`);
    if (code === 0) triggerExport("백필");
  });

  return c.json({ started: true });
});

app.post("/api/admin/cleanup/articles", async (c) => {
  const body = await c.req.json<{ keepDays?: number }>().catch(() => ({} as { keepDays?: number }));
  const keepDays = Math.max(1, typeof body.keepDays === "number" ? body.keepDays : 7);

  try {
    const files = await readdir(OUTPUT_DIR);
    const jsonFiles = files
      .filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f))
      .sort()
      .reverse();

    const toKeep = jsonFiles.slice(0, keepDays);
    const toDelete = jsonFiles.slice(keepDays);

    await Promise.all(toDelete.map((f) => unlink(join(OUTPUT_DIR, f))));

    return c.json({
      deleted: toDelete.map((f) => f.replace(".json", "")),
      kept: toKeep.map((f) => f.replace(".json", "")),
    });
  } catch {
    return c.json({ error: "정리 실패" }, 500);
  }
});

// ─────────────────────────────────────────────────────────────────────────
const PORT = 3000;
console.log(`API 서버 시작: http://localhost:${PORT}`);

serve({ fetch: app.fetch, port: PORT });
