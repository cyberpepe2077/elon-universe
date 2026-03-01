import { readdir, readFile, writeFile, mkdir, copyFile } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { existsSync } from 'node:fs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const PIPELINE_OUTPUT = join(__dirname, '../output')
const STOCK_DIR = join(__dirname, '../output/stock')
const WEB_PUBLIC = join(__dirname, '../../web/public/data')

const MARKET_SYMBOLS = ['SPY', 'QQQ', 'TSLA'] as const
const MARKET_RANGES = [
  { label: '1mo', interval: '1d' },
  { label: '3mo', interval: '1d' },
  { label: '6mo', interval: '1d' },
  { label: '1y',  interval: '1wk' },
] as const

async function exportArticles() {
  const files = (await readdir(PIPELINE_OUTPUT).catch(() => [] as string[]))
    .filter(f => /^\d{4}-\d{2}-\d{2}\.json$/.test(f))
    .sort()
    .reverse()

  if (files.length === 0) {
    console.log('[내보내기] 기사 파일 없음, 스킵')
    return
  }

  const raw = await readFile(join(PIPELINE_OUTPUT, files[0]), 'utf-8')
  const articles = JSON.parse(raw) as unknown[]
  const result = { articles, total: articles.length }
  await writeFile(join(WEB_PUBLIC, 'articles.json'), JSON.stringify(result, null, 2), 'utf-8')
  console.log(`[내보내기] 기사 ${articles.length}건 (${files[0]})`)
}

async function exportStockData(symbol: string) {
  const dir = join(STOCK_DIR, symbol)
  const outDir = join(WEB_PUBLIC, 'stock', symbol)
  const candlesOutDir = join(outDir, 'candles')
  await mkdir(candlesOutDir, { recursive: true })

  // indicators.json
  const indicatorsPath = join(dir, 'indicators.json')
  if (existsSync(indicatorsPath)) {
    await copyFile(indicatorsPath, join(outDir, 'indicators.json'))
    console.log(`[내보내기] ${symbol} 지표 데이터`)
  }

  // earnings.json
  const earningsPath = join(dir, 'earnings.json')
  if (existsSync(earningsPath)) {
    await copyFile(earningsPath, join(outDir, 'earnings.json'))
    console.log(`[내보내기] ${symbol} 실적 데이터`)
  }

  // 날짜별 캔들 → candles/YYYY-MM-DD.json + dates.json + all-candles.json
  const dateFiles = (await readdir(dir).catch(() => [] as string[]))
    .filter(f => /^\d{4}-\d{2}-\d{2}\.json$/.test(f))
    .sort()

  const allCandles: unknown[] = []
  const dates: { date: string; count: number }[] = []

  for (const f of dateFiles) {
    const raw = await readFile(join(dir, f), 'utf-8')
    const parsed = JSON.parse(raw) as { candles: unknown[] }
    dates.push({ date: f.replace('.json', ''), count: parsed.candles.length })
    allCandles.push(...parsed.candles)
    await writeFile(join(candlesOutDir, f), raw, 'utf-8')
  }

  await writeFile(
    join(outDir, 'dates.json'),
    JSON.stringify({ symbol, dates: dates.slice().reverse() }, null, 2),
    'utf-8',
  )
  await writeFile(
    join(outDir, 'all-candles.json'),
    JSON.stringify({ symbol, candles: allCandles }, null, 2),
    'utf-8',
  )

  console.log(`[내보내기] ${symbol} 캔들: ${dateFiles.length}일 ${allCandles.length}개`)
}

async function exportMarketData() {
  const outDir = join(WEB_PUBLIC, 'market')
  await mkdir(outDir, { recursive: true })

  for (const symbol of MARKET_SYMBOLS) {
    for (const { label: range, interval } of MARKET_RANGES) {
      try {
        const url = `https://query2.finance.yahoo.com/v8/finance/chart/${symbol}?range=${range}&interval=${interval}`
        const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } })
        if (!res.ok) { console.log(`[내보내기] 시장 ${symbol}/${range} 실패 (${res.status})`); continue }

        const data = await res.json() as {
          chart: {
            result: Array<{
              timestamp: number[]
              meta: { regularMarketPrice: number; previousClose: number; symbol: string }
              indicators: { quote: Array<{ open: number[]; high: number[]; low: number[]; close: number[]; volume: number[] }> }
            }> | null
          }
        }

        if (!data.chart.result) continue
        const result = data.chart.result[0]
        const { timestamp, meta, indicators } = result
        const { open, high, low, close, volume } = indicators.quote[0]

        const candles = timestamp
          .map((t, i) => ({ time: t, open: open[i], high: high[i], low: low[i], close: close[i], volume: volume[i] }))
          .filter(c => c.open != null && c.close != null)

        const symbolDir = join(outDir, symbol)
        await mkdir(symbolDir, { recursive: true })
        await writeFile(
          join(symbolDir, `${range}.json`),
          JSON.stringify({ symbol: meta.symbol, price: meta.regularMarketPrice, previousClose: meta.previousClose, candles }, null, 2),
          'utf-8',
        )
        console.log(`[내보내기] 시장 ${symbol}/${range} ${candles.length}봉`)
      } catch (e) {
        console.log(`[내보내기] 시장 ${symbol}/${range} 오류: ${String(e)}`)
      }
    }
  }
}

console.log('[내보내기] 정적 데이터 생성 시작...')
console.log(`[내보내기] 출력 경로: ${WEB_PUBLIC}\n`)

await mkdir(WEB_PUBLIC, { recursive: true })

await exportArticles()
await exportStockData('TSLA')
await exportMarketData()

console.log('\n[내보내기] 완료! apps/web/public/data/ 를 깃에 커밋하세요.')
