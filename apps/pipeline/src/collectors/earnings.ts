import { writeFile, mkdir } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const STOCK_DIR = join(__dirname, '../../output/stock')

const EDGAR_CIK: Record<string, string> = { TSLA: 'CIK0001318605' }
const EDGAR_UA = 'elon-universe-app contact@example.com'

type EdgarEntry = { frame?: string; val: number; filed: string }
type EdgarConcept = { units: Record<string, EdgarEntry[]> }

function extractQuarterly(data: EdgarConcept, unit: string): Map<string, number> {
  const entries = data?.units?.[unit] ?? []
  const map = new Map<string, { val: number; filed: string }>()
  for (const e of entries) {
    const frame = e.frame ?? ''
    if (!/^CY\d{4}Q\d$/.test(frame)) continue
    const prev = map.get(frame)
    if (!prev || e.filed > prev.filed) map.set(frame, { val: e.val, filed: e.filed })
  }
  return new Map(Array.from(map.entries()).map(([k, v]) => [k, v.val]))
}

export interface QuarterData {
  date: string
  frame: string
  epsActual: number | null
  epsEstimate: null
  revenue: number | null
  netIncome: number | null
}

export interface EarningsResult {
  symbol: string
  quarterly: QuarterData[]
  updatedAt: string
}

export async function collectEarnings(symbol: string): Promise<EarningsResult> {
  const cik = EDGAR_CIK[symbol.toUpperCase()]
  if (!cik) throw new Error(`지원하지 않는 심볼: ${symbol} (현재 TSLA만 지원)`)

  const base = `https://data.sec.gov/api/xbrl/companyconcept/${cik}/us-gaap`
  const headers = { 'User-Agent': EDGAR_UA }

  const [epsRes, revRes, niRes] = await Promise.all([
    fetch(`${base}/EarningsPerShareDiluted.json`, { headers }),
    fetch(`${base}/Revenues.json`, { headers }),
    fetch(`${base}/NetIncomeLoss.json`, { headers }),
  ])

  if (!epsRes.ok || !revRes.ok || !niRes.ok) {
    throw new Error(`SEC EDGAR 요청 실패 (EPS:${epsRes.status} Rev:${revRes.status} NI:${niRes.status})`)
  }

  const [epsData, revData, niData] = await Promise.all([
    epsRes.json() as Promise<EdgarConcept>,
    revRes.json() as Promise<EdgarConcept>,
    niRes.json() as Promise<EdgarConcept>,
  ])

  const epsMap = extractQuarterly(epsData, 'USD/shares')
  const revMap = extractQuarterly(revData, 'USD')
  const niMap  = extractQuarterly(niData,  'USD')

  const allFrames = new Set([...epsMap.keys(), ...revMap.keys(), ...niMap.keys()])
  const sortedFrames = Array.from(allFrames).sort().slice(-8)

  const quarterly: QuarterData[] = sortedFrames.map((frame) => {
    const m = frame.match(/^CY(\d{4})Q(\d)$/)!
    return {
      date:        `${m[2]}Q${m[1]}`,
      frame,
      epsActual:   epsMap.get(frame) ?? null,
      epsEstimate: null,
      revenue:     revMap.get(frame) ?? null,
      netIncome:   niMap.get(frame)  ?? null,
    }
  })

  const result: EarningsResult = { symbol: symbol.toUpperCase(), quarterly, updatedAt: new Date().toISOString() }

  const dir = join(STOCK_DIR, symbol.toUpperCase())
  await mkdir(dir, { recursive: true })
  await writeFile(join(dir, 'earnings.json'), JSON.stringify(result, null, 2), 'utf-8')

  return result
}
