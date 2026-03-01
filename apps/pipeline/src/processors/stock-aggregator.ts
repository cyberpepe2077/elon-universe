import { readFile, writeFile } from 'node:fs/promises'

interface Candle {
  time: number
  open: number
  high: number
  low: number
  close: number
  volume: number
}

interface DayCandles {
  symbol: string
  date: string
  interval: '1m'
  candles: Candle[]
}

const INTERVALS: Record<string, number> = {
  '5m':  5  * 60,
  '15m': 15 * 60,
  '30m': 30 * 60,
  '1h':  60 * 60,
}

function aggregate(candles: Candle[], intervalSec: number): Candle[] {
  const buckets = new Map<number, Candle>()
  for (const c of candles) {
    const bucket = Math.floor(c.time / intervalSec) * intervalSec
    const existing = buckets.get(bucket)
    if (!existing) {
      buckets.set(bucket, { ...c, time: bucket })
    } else {
      existing.high   = Math.max(existing.high, c.high)
      existing.low    = Math.min(existing.low, c.low)
      existing.close  = c.close
      existing.volume += c.volume
    }
  }
  return Array.from(buckets.values()).sort((a, b) => a.time - b.time)
}

export interface AggregatedDay {
  symbol: string
  date: string
  aggregated: Record<string, Candle[]>
}

/** 1분봉 파일을 읽어 집계하고 _agg.json 으로 저장 */
export async function aggregateDay(rawFilePath: string): Promise<void> {
  const raw = JSON.parse(await readFile(rawFilePath, 'utf-8')) as DayCandles
  const candles = raw.candles

  const aggregated: Record<string, Candle[]> = {}
  for (const [label, sec] of Object.entries(INTERVALS)) {
    aggregated[label] = aggregate(candles, sec)
  }

  const result: AggregatedDay = { symbol: raw.symbol, date: raw.date, aggregated }
  const aggPath = rawFilePath.replace(/\.json$/, '_agg.json')
  await writeFile(aggPath, JSON.stringify(result, null, 2), 'utf-8')
}
