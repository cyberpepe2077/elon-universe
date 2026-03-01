/**
 * Market.tsx — S&P500 / NASDAQ / TSLA 시장 비교 페이지
 *
 * [향후 통합 포인트]
 * 1. fetchSymbolData() → hooks/useMarketData.ts 로 추출하면
 *    Stock 페이지와 데이터 레이어를 공유할 수 있음
 * 2. TSLA 항목의 소스를 Yahoo Finance → pipeline indicators.json 으로
 *    교체하려면 SYMBOLS 배열에서 해당 symbol의 fetch 로직만 바꾸면 됨
 * 3. PerformanceChart / SymbolChart는 데이터를 prop으로만 받으므로
 *    어느 페이지에서도 재사용 가능
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  createChart,
  CandlestickSeries,
  LineSeries,
  ColorType,
  type IChartApi,
  type UTCTimestamp,
} from 'lightweight-charts'

// ── 설정 (심볼 추가/제거/소스 교체는 여기만 수정) ────────────────────────────

const SYMBOLS = [
  { key: 'SPY',  label: 'S&P500',     color: '#3b82f6' },
  { key: 'QQQ',  label: 'NASDAQ 100', color: '#8b5cf6' },
  { key: 'TSLA', label: 'TSLA',       color: '#ef4444' },
] as const

type SymbolKey = typeof SYMBOLS[number]['key']

const RANGES = [
  { label: '1M', value: '1mo' },
  { label: '3M', value: '3mo' },
  { label: '6M', value: '6mo' },
  { label: '1Y', value: '1y'  },
] as const

type RangeLabel = typeof RANGES[number]['label']

// ── Types ─────────────────────────────────────────────────────────────────────

interface Candle {
  time: UTCTimestamp
  open: number
  high: number
  low: number
  close: number
}

interface SymbolData {
  key: SymbolKey
  label: string
  color: string
  price: number
  previousClose: number
  candles: Candle[]
}

// ── Data fetching ─────────────────────────────────────────────────────────────
// 향후 hooks/useMarketData.ts 로 이동 가능

async function fetchSymbolData(
  symbol: SymbolKey,
  label: string,
  color: string,
  range: string,
): Promise<SymbolData | null> {
  try {
    const r = await fetch(`${import.meta.env.BASE_URL}data/market/${symbol}/${range}.json`)
    if (!r.ok) return null
    const d = await r.json() as {
      price: number
      previousClose: number
      candles: { time: number; open: number; high: number; low: number; close: number }[]
    }
    return {
      key: symbol,
      label,
      color,
      price: d.price,
      previousClose: d.previousClose,
      candles: d.candles
        .filter(c => c.open != null && c.close != null)
        .map(c => ({ time: c.time as UTCTimestamp, open: c.open, high: c.high, low: c.low, close: c.close })),
    }
  } catch {
    return null
  }
}

// ── Chart helpers ─────────────────────────────────────────────────────────────

function isDark() {
  return document.documentElement.classList.contains('dark')
}

function getChartColors(dark: boolean) {
  return {
    bg:     dark ? '#0f172a' : '#ffffff',
    text:   dark ? '#94a3b8' : '#64748b',
    grid:   dark ? '#1e293b' : '#f1f5f9',
    border: dark ? '#1e293b' : '#e2e8f0',
  }
}

function makeChart(el: HTMLDivElement, dark: boolean, height: number): IChartApi {
  const c = getChartColors(dark)
  return createChart(el, {
    layout: { background: { type: ColorType.Solid, color: c.bg }, textColor: c.text, fontSize: 11 },
    grid: { vertLines: { color: c.grid }, horzLines: { color: c.grid } },
    rightPriceScale: { borderColor: c.border },
    timeScale: { borderColor: c.border, timeVisible: false },
    crosshair: { mode: 1 },
    width: el.clientWidth,
    height,
  })
}

// ── 퍼포먼스 비교 차트 (정규화 %) ─────────────────────────────────────────────

function PerformanceChart({ datasets, dark }: {
  datasets: SymbolData[]
  dark: boolean
}) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!ref.current || datasets.every(d => d.candles.length === 0)) return

    const chart = makeChart(ref.current, dark, 380)
    const noLabel = { priceLineVisible: false as const, lastValueVisible: true as const }

    for (const { label, color, candles } of datasets) {
      if (candles.length < 2) continue
      const base = candles[0].close
      chart.addSeries(LineSeries, { color, lineWidth: 2, title: label, ...noLabel })
        .setData(candles.map(c => ({
          time: c.time,
          value: Math.round(((c.close - base) / base) * 10000) / 100, // 소수점 2자리 %
        })))
    }

    // 0% 기준선
    const allCandles = datasets.flatMap(d => d.candles)
    if (allCandles.length >= 2) {
      const times = allCandles.map(c => c.time as number).sort((a, b) => a - b)
      chart.addSeries(LineSeries, {
        color: isDark() ? '#334155' : '#cbd5e1',
        lineWidth: 1,
        priceLineVisible: false,
        lastValueVisible: false,
      }).setData([
        { time: times[0] as UTCTimestamp, value: 0 },
        { time: times[times.length - 1] as UTCTimestamp, value: 0 },
      ])
    }

    chart.timeScale().fitContent()
    const onResize = () => { if (ref.current) chart.applyOptions({ width: ref.current.clientWidth }) }
    window.addEventListener('resize', onResize)
    return () => { window.removeEventListener('resize', onResize); chart.remove() }
  }, [datasets, dark])

  return <div ref={ref} />
}

// ── 개별 캔들스틱 차트 ────────────────────────────────────────────────────────

function SymbolChart({ candles, dark }: { candles: Candle[]; dark: boolean }) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!ref.current || candles.length === 0) return
    const chart = makeChart(ref.current, dark, 220)

    chart.addSeries(CandlestickSeries, {
      upColor: '#22c55e', downColor: '#ef4444',
      borderUpColor: '#22c55e', borderDownColor: '#ef4444',
      wickUpColor: dark ? '#475569' : '#cbd5e1',
      wickDownColor: dark ? '#475569' : '#cbd5e1',
    }).setData(candles)

    chart.timeScale().fitContent()
    const onResize = () => { if (ref.current) chart.applyOptions({ width: ref.current.clientWidth }) }
    window.addEventListener('resize', onResize)
    return () => { window.removeEventListener('resize', onResize); chart.remove() }
  }, [candles, dark])

  return <div ref={ref} />
}

// ── 요약 카드 ─────────────────────────────────────────────────────────────────

function SymbolCard({ data, periodReturn }: { data: SymbolData; periodReturn: number | null }) {
  const dayChange = data.price - data.previousClose
  const dayChangePct = (dayChange / data.previousClose) * 100
  const up = dayChange >= 0

  return (
    <div className="border border-[var(--border)] rounded-xl p-4 space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full" style={{ backgroundColor: data.color }} />
          <span className="text-xs font-medium">{data.label}</span>
        </div>
        <span className="text-xs text-[var(--muted-foreground)] font-mono">{data.key}</span>
      </div>
      <div className="text-lg font-bold tabular-nums">${data.price.toFixed(2)}</div>
      <div className="flex items-center justify-between text-xs">
        <span className={up ? 'text-green-500' : 'text-red-500'}>
          {up ? '+' : ''}{dayChange.toFixed(2)} ({up ? '+' : ''}{dayChangePct.toFixed(2)}%) 오늘
        </span>
        {periodReturn !== null && (
          <span className={periodReturn >= 0 ? 'text-green-500' : 'text-red-500'}>
            {periodReturn >= 0 ? '+' : ''}{periodReturn.toFixed(2)}% 기간
          </span>
        )}
      </div>
    </div>
  )
}

// ── Main ──────────────────────────────────────────────────────────────────────

export default function Market() {
  const [range, setRange] = useState<RangeLabel>('3M')
  const [tab, setTab] = useState<'compare' | 'individual'>('compare')
  const [datasets, setDatasets] = useState<SymbolData[]>([])
  const [loading, setLoading] = useState(true)
  const [dark, setDark] = useState(isDark)

  useEffect(() => {
    const observer = new MutationObserver(() => setDark(isDark()))
    observer.observe(document.documentElement, { attributeFilter: ['class'] })
    return () => observer.disconnect()
  }, [])

  const loadData = useCallback(async () => {
    setLoading(true)
    const rangeValue = RANGES.find(r => r.label === range)!.value
    const results = await Promise.all(
      SYMBOLS.map(s => fetchSymbolData(s.key, s.label, s.color, rangeValue))
    )
    setDatasets(results.filter(Boolean) as SymbolData[])
    setLoading(false)
  }, [range])

  useEffect(() => { void loadData() }, [loadData])

  const periodReturn = (d: SymbolData): number | null => {
    if (d.candles.length < 2) return null
    const first = d.candles[0].close
    const last = d.candles[d.candles.length - 1].close
    return Math.round(((last - first) / first) * 10000) / 100
  }

  return (
    <main className="max-w-5xl mx-auto px-4 py-6 space-y-6">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <h1 className="text-sm font-semibold">시장 지수</h1>
        <div className="flex items-center gap-2">
          {/* 탭 */}
          <div className="flex gap-0.5">
            {([['compare', '비교'] , ['individual', '개별']] as const).map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => setTab(value)}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                  tab === value
                    ? 'bg-[var(--foreground)] text-[var(--background)]'
                    : 'text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--accent)]'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          {/* 기간 */}
          <div className="flex gap-0.5">
            {RANGES.map(({ label }) => (
              <button
                key={label}
                type="button"
                onClick={() => setRange(label)}
                className={`px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors ${
                  range === label
                    ? 'bg-[var(--foreground)] text-[var(--background)]'
                    : 'text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--accent)]'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {loading ? (
        <div className="py-16 text-center text-sm text-[var(--muted-foreground)]">불러오는 중...</div>
      ) : (
        <>
          {/* 요약 카드 */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {datasets.map(d => (
              <SymbolCard key={d.key} data={d} periodReturn={periodReturn(d)} />
            ))}
          </div>

          {tab === 'compare' ? (
            /* ── 비교 탭 ── */
            <div className="border border-[var(--border)] rounded-xl overflow-hidden">
              <div className="px-4 py-2.5 border-b border-[var(--border)] flex items-center justify-between">
                <span className="text-xs font-medium">기준일 대비 수익률 (%)</span>
                <div className="flex items-center gap-3">
                  {datasets.map(d => (
                    <span key={d.key} className="flex items-center gap-1.5 text-xs text-[var(--muted-foreground)]">
                      <span className="w-3 h-0.5 inline-block rounded" style={{ backgroundColor: d.color }} />
                      {d.label}
                    </span>
                  ))}
                </div>
              </div>
              <PerformanceChart datasets={datasets} dark={dark} />
            </div>
          ) : (
            /* ── 개별 탭 ── */
            <div className="space-y-4">
              {datasets.map(d => (
                <div key={d.key} className="border border-[var(--border)] rounded-xl overflow-hidden">
                  <div className="px-4 py-2.5 border-b border-[var(--border)] flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full" style={{ backgroundColor: d.color }} />
                    <span className="text-xs font-medium">{d.label}</span>
                    <span className="text-xs text-[var(--muted-foreground)]">({d.key})</span>
                  </div>
                  {d.candles.length > 0
                    ? <SymbolChart candles={d.candles} dark={dark} />
                    : <div className="h-[220px] flex items-center justify-center text-sm text-[var(--muted-foreground)]">데이터 없음</div>
                  }
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </main>
  )
}
