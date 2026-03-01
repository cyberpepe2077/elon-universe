import { readdir, readFile, writeFile } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { calcIndicators, type OHLCVPoint, type IndicatorPoint } from './indicators.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const STOCK_DIR = join(__dirname, '../../output/stock')

interface RawDayCandles {
  symbol: string
  date: string
  candles: {
    time: number
    open: number
    high: number
    low: number
    close: number
    volume: number
  }[]
}

export interface DailyIndicators {
  symbol: string
  updatedAt: string
  series: IndicatorPoint[]
}

/** 저장된 모든 날짜 파일에서 일봉 OHLCV 추출 후 지표 계산, indicators.json 저장 */
export async function computeDailyIndicators(symbol: string): Promise<DailyIndicators> {
  const dir = join(STOCK_DIR, symbol)
  const files = await readdir(dir).catch(() => [] as string[])

  const rawFiles = files
    .filter((f) => f.endsWith('.json') && !f.endsWith('_agg.json') && !f.includes('indicators'))
    .sort()

  const points: OHLCVPoint[] = []

  for (const f of rawFiles) {
    try {
      const raw = JSON.parse(await readFile(join(dir, f), 'utf-8')) as RawDayCandles
      const { candles } = raw
      if (candles.length === 0) continue

      points.push({
        date: raw.date,
        open: candles[0].open,
        high: Math.max(...candles.map((c) => c.high)),
        low: Math.min(...candles.map((c) => c.low)),
        close: candles[candles.length - 1].close,
        volume: candles.reduce((s, c) => s + c.volume, 0),
      })
    } catch {
      // 깨진 파일 스킵
    }
  }

  const series = calcIndicators(points)

  const result: DailyIndicators = {
    symbol,
    updatedAt: new Date().toISOString(),
    series,
  }

  await writeFile(join(dir, 'indicators.json'), JSON.stringify(result, null, 2), 'utf-8')
  return result
}
