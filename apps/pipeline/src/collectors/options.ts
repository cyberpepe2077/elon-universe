import { writeFile, mkdir } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const STOCK_DIR = join(__dirname, '../../output/stock')
const YF_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'

export interface OptionContract {
  contractSymbol: string
  strike: number
  bid: number
  ask: number
  lastPrice: number
  volume: number
  openInterest: number
  impliedVolatility: number
  inTheMoney: boolean
}

export interface OptionExpiry {
  expiration: string        // YYYY-MM-DD
  expirationTimestamp: number
  calls: OptionContract[]
  puts: OptionContract[]
}

export interface OptionSummary {
  totalCallOI: number
  totalPutOI: number
  putCallRatio: number      // putOI / callOI
  maxPain: number           // 옵션 매도자 최대이익 행사가
}

export interface OptionsSnapshot {
  symbol: string
  collectedAt: string       // ISO timestamp
  underlyingPrice: number
  expirations: string[]     // YYYY-MM-DD 목록
  chains: Record<string, OptionExpiry>  // key: YYYY-MM-DD
  summary: OptionSummary    // 최근 만기 기준
}

type YfOptionContract = {
  contractSymbol: string
  strike: number
  bid?: number
  ask?: number
  lastPrice: number
  volume?: number
  openInterest?: number
  impliedVolatility: number
  inTheMoney: boolean
}

type YfOptionsChain = {
  underlyingSymbol: string
  expirationDates: number[]
  quote: { regularMarketPrice: number }
  options: Array<{
    expirationDate: number
    calls: YfOptionContract[]
    puts: YfOptionContract[]
  }>
}

function tsToDate(ts: number): string {
  return new Date(ts * 1000).toISOString().slice(0, 10)
}

// ── Yahoo Finance 세션 (crumb + cookie) ──────────────────────────────────────

let _session: { crumb: string; cookie: string } | null = null

async function getSession(): Promise<{ crumb: string; cookie: string }> {
  if (_session) return _session

  // Step 1: fc.yahoo.com에서 세션 쿠키 획득
  const csRes = await fetch('https://fc.yahoo.com/', {
    headers: { 'User-Agent': YF_UA },
    redirect: 'follow',
  })

  // Node.js 18.14+ getSetCookie(), 구버전은 get() 폴백
  const rawCookies: string[] =
    typeof (csRes.headers as { getSetCookie?: () => string[] }).getSetCookie === 'function'
      ? (csRes.headers as { getSetCookie: () => string[] }).getSetCookie()
      : (csRes.headers.get('set-cookie') ?? '').split(/,(?=\s*\w+=)/)

  const cookieStr = rawCookies.map(c => c.split(';')[0]).filter(Boolean).join('; ')

  // Step 2: crumb 획득
  const crumbRes = await fetch('https://query1.finance.yahoo.com/v1/test/getcrumb', {
    headers: { 'User-Agent': YF_UA, 'Cookie': cookieStr },
  })

  if (!crumbRes.ok) throw new Error(`crumb 획득 실패 (${crumbRes.status})`)

  const crumb = (await crumbRes.text()).trim()
  if (!crumb || crumb === 'null') throw new Error('crumb이 유효하지 않습니다')

  console.log(`[options] 세션 획득 완료 (crumb: ${crumb})`)
  _session = { crumb, cookie: cookieStr }
  return _session
}

function mapContracts(raw: YfOptionContract[]): OptionContract[] {
  return raw.map(c => ({
    contractSymbol: c.contractSymbol,
    strike: c.strike,
    bid: c.bid ?? 0,
    ask: c.ask ?? 0,
    lastPrice: c.lastPrice,
    volume: c.volume ?? 0,
    openInterest: c.openInterest ?? 0,
    impliedVolatility: c.impliedVolatility,
    inTheMoney: c.inTheMoney,
  }))
}

async function fetchChain(symbol: string, dateTs?: number): Promise<YfOptionsChain> {
  const { crumb, cookie } = await getSession()

  const params = new URLSearchParams({ crumb })
  if (dateTs) params.set('date', String(dateTs))

  const url = `https://query1.finance.yahoo.com/v7/finance/options/${symbol}?${params}`

  const res = await fetch(url, {
    headers: {
      'User-Agent': YF_UA,
      'Accept': 'application/json',
      'Cookie': cookie,
    },
  })

  if (!res.ok) throw new Error(`Yahoo Finance 옵션 API 오류 (${res.status})`)

  const data = await res.json() as {
    optionChain: { result: YfOptionsChain[] | null; error: unknown }
  }

  if (!data.optionChain?.result?.length) throw new Error('옵션 데이터 없음')
  return data.optionChain.result[0]
}

// Max Pain: 각 행사가에서 콜+풋 내재가치 합산이 최소인 가격
function calcMaxPain(calls: OptionContract[], puts: OptionContract[]): number {
  const strikes = [...new Set([
    ...calls.map(c => c.strike),
    ...puts.map(p => p.strike),
  ])].sort((a, b) => a - b)

  if (strikes.length === 0) return 0

  const callMap = new Map(calls.map(c => [c.strike, c.openInterest]))
  const putMap  = new Map(puts.map(p => [p.strike, p.openInterest]))

  let minPain = Infinity
  let maxPainStrike = strikes[0]

  for (const p of strikes) {
    let pain = 0
    for (const k of strikes) {
      if (k < p) pain += (p - k) * (callMap.get(k) ?? 0)  // ITM 콜 내재가치
      if (k > p) pain += (k - p) * (putMap.get(k) ?? 0)   // ITM 풋 내재가치
    }
    if (pain < minPain) { minPain = pain; maxPainStrike = p }
  }

  return maxPainStrike
}

export async function collectOptions(symbol: string): Promise<OptionsSnapshot> {
  const sym = symbol.toUpperCase()
  console.log(`[options] ${sym} 옵션 체인 수집 시작...`)

  const first = await fetchChain(sym)
  const underlyingPrice = first.quote.regularMarketPrice
  const targetExpirations = first.expirationDates.slice(0, 6)

  const chains: Record<string, OptionExpiry> = {}

  // 첫 번째 만기 (이미 응답에 포함)
  if (first.options.length > 0) {
    const opt = first.options[0]
    const dateStr = tsToDate(opt.expirationDate)
    chains[dateStr] = {
      expiration: dateStr,
      expirationTimestamp: opt.expirationDate,
      calls: mapContracts(opt.calls),
      puts: mapContracts(opt.puts),
    }
    console.log(`[options] ${dateStr} 완료 (콜 ${opt.calls.length}개, 풋 ${opt.puts.length}개)`)
  }

  // 나머지 만기 순차 수집 (500ms 딜레이)
  for (const ts of targetExpirations.slice(1)) {
    await new Promise(r => setTimeout(r, 500))
    try {
      const chain = await fetchChain(sym, ts)
      if (chain.options.length > 0) {
        const opt = chain.options[0]
        const dateStr = tsToDate(opt.expirationDate)
        chains[dateStr] = {
          expiration: dateStr,
          expirationTimestamp: opt.expirationDate,
          calls: mapContracts(opt.calls),
          puts: mapContracts(opt.puts),
        }
        console.log(`[options] ${dateStr} 완료 (콜 ${opt.calls.length}개, 풋 ${opt.puts.length}개)`)
      }
    } catch (e) {
      console.warn(`[options] ${tsToDate(ts)} 수집 실패: ${String(e)}`)
    }
  }

  const expirations = Object.keys(chains).sort()

  // 요약 — 최근 만기 기준
  const firstExpiry = expirations.length > 0 ? chains[expirations[0]] : null
  const summary: OptionSummary = firstExpiry
    ? (() => {
        const totalCallOI = firstExpiry.calls.reduce((s, c) => s + c.openInterest, 0)
        const totalPutOI  = firstExpiry.puts.reduce((s, p) => s + p.openInterest, 0)
        return {
          totalCallOI,
          totalPutOI,
          putCallRatio: totalCallOI > 0 ? totalPutOI / totalCallOI : 0,
          maxPain: calcMaxPain(firstExpiry.calls, firstExpiry.puts),
        }
      })()
    : { totalCallOI: 0, totalPutOI: 0, putCallRatio: 0, maxPain: 0 }

  const result: OptionsSnapshot = {
    symbol: sym,
    collectedAt: new Date().toISOString(),
    underlyingPrice,
    expirations,
    chains,
    summary,
  }

  const dir = join(STOCK_DIR, sym)
  await mkdir(dir, { recursive: true })
  await writeFile(join(dir, 'options.json'), JSON.stringify(result, null, 2), 'utf-8')

  return result
}
