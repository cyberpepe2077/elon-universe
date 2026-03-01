import { writeFile, mkdir, access } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { aggregateDay } from '../processors/stock-aggregator.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const STOCK_DIR = join(__dirname, '../../output/stock')

// Polygon.io 무료 티어: 5 req/min → 페이지 사이 13초 딜레이
const RATE_LIMIT_MS = 13_000

interface PolygonResult {
  t: number // ms timestamp
  o: number
  h: number
  l: number
  c: number
  v: number
}

interface PolygonResponse {
  results?: PolygonResult[]
  status: string
  next_url?: string
  error?: string
}

interface Candle {
  time: number
  open: number
  high: number
  low: number
  close: number
  volume: number
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function fileExists(path: string): Promise<boolean> {
  try { await access(path); return true }
  catch { return false }
}

/** Unix ms → ET 기준 YYYY-MM-DD */
function toEtDate(ms: number): string {
  return new Date(ms).toLocaleDateString('en-CA', { timeZone: 'America/New_York' })
}

export interface BackfillResult {
  saved: string[]
  skipped: string[]
  errors: string[]
}

/**
 * Polygon.io로 TSLA 1분봉 백필.
 * - 날짜 범위 전체를 한 번에 요청 → next_url 페이지네이션으로 처리
 * - 50,000 캔들/페이지 → 1년치 ~5번 요청 (vs 하루 1번 × 252회)
 * - 이미 저장된 날짜는 스킵 (idempotent)
 */
export async function backfillStockCandles(
  from: string,
  to: string,
  apiKey: string,
  onProgress?: (msg: string) => void,
): Promise<BackfillResult> {
  const dir = join(STOCK_DIR, 'TSLA')
  await mkdir(dir, { recursive: true })

  // 전체 캔들을 날짜별로 모음
  const byDate = new Map<string, Candle[]>()
  let pageNum = 0
  let nextUrl: string | undefined =
    `https://api.polygon.io/v2/aggs/ticker/TSLA/range/1/minute/${from}/${to}` +
    `?adjusted=true&sort=asc&limit=50000&apiKey=${apiKey}`

  while (nextUrl) {
    pageNum++
    onProgress?.(`[fetch] 페이지 ${pageNum} 요청 중...`)

    try {
      const res = await fetch(nextUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } })

      if (!res.ok) {
        onProgress?.(`[error] HTTP ${res.status}`)
        return { saved: [], skipped: [], errors: [`HTTP ${res.status}`] }
      }

      const json = await res.json() as PolygonResponse

      if (json.error) {
        onProgress?.(`[error] ${json.error}`)
        return { saved: [], skipped: [], errors: [json.error] }
      }

      const results = json.results ?? []
      onProgress?.(`[fetch] 페이지 ${pageNum} — ${results.length}개 캔들 수신`)

      for (const r of results) {
        const date = toEtDate(r.t)
        if (!byDate.has(date)) byDate.set(date, [])
        byDate.get(date)!.push({
          time: Math.floor(r.t / 1000),
          open: r.o,
          high: r.h,
          low: r.l,
          close: r.c,
          volume: r.v,
        })
      }

      // next_url에는 apiKey가 없으므로 직접 추가
      nextUrl = json.next_url ? `${json.next_url}&apiKey=${apiKey}` : undefined

      if (nextUrl) await sleep(RATE_LIMIT_MS)
    } catch (e) {
      onProgress?.(`[error] ${String(e)}`)
      return { saved: [], skipped: [], errors: [String(e)] }
    }
  }

  onProgress?.(`[done] 총 ${pageNum}페이지, ${byDate.size}일치 데이터 수신`)

  // 날짜별로 파일 저장
  const saved: string[] = []
  const skipped: string[] = []
  const errors: string[] = []

  for (const [date, candles] of [...byDate.entries()].sort()) {
    const filePath = join(dir, `${date}.json`)

    if (await fileExists(filePath)) {
      skipped.push(date)
      onProgress?.(`[skip] ${date} (already exists)`)
      continue
    }

    try {
      const sorted = candles.sort((a, b) => a.time - b.time)
      await writeFile(
        filePath,
        JSON.stringify({ symbol: 'TSLA', date, interval: '1m', candles: sorted }, null, 2),
        'utf-8',
      )
      await aggregateDay(filePath)
      saved.push(date)
      onProgress?.(`[saved] ${date} (${candles.length} candles)`)
    } catch (e) {
      errors.push(`${date}: ${String(e)}`)
      onProgress?.(`[error] ${date}: ${String(e)}`)
    }
  }

  return { saved, skipped, errors }
}
