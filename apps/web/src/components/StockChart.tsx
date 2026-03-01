import { useEffect, useRef, useState } from 'react'
import {
  createChart,
  CandlestickSeries,
  type IChartApi,
  type ISeriesApi,
  type CandlestickData,
  type UTCTimestamp,
  ColorType,
} from 'lightweight-charts'

interface Candle {
  time: number
  open: number
  high: number
  low: number
  close: number
}

interface StockData {
  symbol: string
  price: number
  previousClose: number
  candles: Candle[]
}

interface LoadState {
  rangeValue: string
  data: StockData | null
  error: boolean
}

const RANGES = [
  { label: '1M', value: '1mo', interval: '1d' },
  { label: '3M', value: '3mo', interval: '1d' },
  { label: '6M', value: '6mo', interval: '1d' },
  { label: '1Y', value: '1y', interval: '1wk' },
]

function getChartColors(dark: boolean) {
  return {
    background: dark ? '#0f172a' : '#ffffff',
    text: dark ? '#94a3b8' : '#64748b',
    grid: dark ? '#1e293b' : '#f1f5f9',
    border: dark ? '#1e293b' : '#e2e8f0',
    up: '#22c55e',
    down: '#ef4444',
    wick: dark ? '#475569' : '#cbd5e1',
  }
}

function isDark() {
  return document.documentElement.classList.contains('dark')
}

export function StockChart() {
  const containerRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<IChartApi | null>(null)
  const seriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null)
  const [range, setRange] = useState(RANGES[1])
  const [dark, setDark] = useState(isDark)

  // rangeValue가 현재 range.value와 다르면 로딩 중
  const [loadState, setLoadState] = useState<LoadState>({
    rangeValue: '',
    data: null,
    error: false,
  })

  const loading = loadState.rangeValue !== range.value
  const { data, error } = loadState

  // 다크모드 변화 감지
  useEffect(() => {
    const observer = new MutationObserver(() => setDark(isDark()))
    observer.observe(document.documentElement, { attributeFilter: ['class'] })
    return () => observer.disconnect()
  }, [])

  // 데이터 fetch — 동기 setState 없이, 파생 loading 사용
  useEffect(() => {
    let cancelled = false

    async function load() {
      try {
        const r = await fetch(
          `/api/stock/TSLA?range=${range.value}&interval=${range.interval}`,
        )
        if (cancelled) return
        if (!r.ok) throw new Error()
        const d = await r.json() as StockData
        if (cancelled) return
        setLoadState({ rangeValue: range.value, data: d, error: false })
      } catch {
        if (!cancelled) {
          setLoadState({ rangeValue: range.value, data: null, error: true })
        }
      }
    }

    void load()
    return () => { cancelled = true }
  }, [range])

  // 차트 생성
  useEffect(() => {
    if (!containerRef.current || loading || error || !data) return

    const colors = getChartColors(dark)

    const chart = createChart(containerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: colors.background },
        textColor: colors.text,
        fontSize: 11,
      },
      grid: {
        vertLines: { color: colors.grid },
        horzLines: { color: colors.grid },
      },
      crosshair: { mode: 1 },
      rightPriceScale: { borderColor: colors.border },
      timeScale: { borderColor: colors.border, timeVisible: true },
      width: containerRef.current.clientWidth,
      height: 280,
    })

    const series = chart.addSeries(CandlestickSeries, {
      upColor: colors.up,
      downColor: colors.down,
      borderUpColor: colors.up,
      borderDownColor: colors.down,
      wickUpColor: colors.wick,
      wickDownColor: colors.wick,
    })

    const chartData: CandlestickData[] = data.candles.map((c) => ({
      time: c.time as UTCTimestamp,
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close,
    }))

    series.setData(chartData)
    chart.timeScale().fitContent()

    chartRef.current = chart
    seriesRef.current = series

    const handleResize = () => {
      if (containerRef.current) {
        chart.applyOptions({ width: containerRef.current.clientWidth })
      }
    }
    window.addEventListener('resize', handleResize)

    return () => {
      window.removeEventListener('resize', handleResize)
      chart.remove()
      chartRef.current = null
      seriesRef.current = null
    }
  }, [data, dark, loading, error])

  const change = data ? data.price - data.previousClose : 0
  const changePct = data ? (change / data.previousClose) * 100 : 0
  const isUp = change >= 0

  return (
    <section className="max-w-2xl mx-auto px-4 pb-16">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <h2 className="text-sm font-semibold">TSLA</h2>
          {data && (
            <div className="flex items-baseline gap-1.5">
              <span className="text-base font-bold">${data.price.toFixed(2)}</span>
              <span className={`text-xs font-medium ${isUp ? 'text-green-500' : 'text-red-500'}`}>
                {isUp ? '+' : ''}{change.toFixed(2)} ({isUp ? '+' : ''}{changePct.toFixed(2)}%)
              </span>
            </div>
          )}
        </div>
        {/* Range selector */}
        <div className="flex gap-0.5">
          {RANGES.map((r) => (
            <button
              key={r.value}
              type="button"
              onClick={() => setRange(r)}
              className={`px-2 py-1 rounded text-xs font-medium transition-colors ${
                range.value === r.value
                  ? 'bg-[var(--foreground)] text-[var(--background)]'
                  : 'text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--accent)]'
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {/* Chart area */}
      <div className="rounded-xl border border-[var(--border)] overflow-hidden">
        {loading && (
          <div className="h-[280px] flex items-center justify-center text-sm text-[var(--muted-foreground)]">
            불러오는 중...
          </div>
        )}
        {error && (
          <div className="h-[280px] flex items-center justify-center text-sm text-[var(--muted-foreground)]">
            데이터를 불러올 수 없습니다
          </div>
        )}
        <div ref={containerRef} className={loading || error ? 'hidden' : ''} />
      </div>
    </section>
  )
}
