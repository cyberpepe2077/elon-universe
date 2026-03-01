import { useEffect, useRef, useState } from 'react'
import {
  createChart,
  CandlestickSeries,
  LineSeries,
  HistogramSeries,
  ColorType,
  LineStyle,
  type IChartApi,
  type CandlestickData,
  type UTCTimestamp,
} from 'lightweight-charts'
import { RefreshCw, Info } from 'lucide-react'

// ── Types ─────────────────────────────────────────────────────────────────────

interface Candle {
  time: number
  open: number
  high: number
  low: number
  close: number
}

interface DateEntry {
  date: string
  count: number
}

interface IndicatorPoint {
  date: string
  open: number; high: number; low: number; close: number; volume: number
  sma5: number | null; sma20: number | null; sma50: number | null; sma200: number | null
  ema12: number | null; ema26: number | null
  rsi14: number | null
  macd: number | null; macdSignal: number | null; macdHistogram: number | null
  bbUpper: number | null; bbMiddle: number | null; bbLower: number | null
  obv: number
  atr14: number | null
}

interface IndicatorSeries {
  symbol: string
  updatedAt: string
  series: IndicatorPoint[]
}

type ViewTab = 'day' | 'all' | 'indicators' | 'earnings' | 'options'

interface QuarterData {
  date: string
  epsActual: number | null
  epsEstimate: number | null
  revenue: number | null
  netIncome: number | null
}

interface EarningsSeries {
  symbol: string
  quarterly: QuarterData[]
  updatedAt: string
}

interface OptionContract {
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

interface OptionExpiry {
  expiration: string
  expirationTimestamp: number
  calls: OptionContract[]
  puts: OptionContract[]
}

interface OptionSummary {
  totalCallOI: number
  totalPutOI: number
  putCallRatio: number
  maxPain: number
}

interface OptionsSnapshot {
  symbol: string
  collectedAt: string
  underlyingPrice: number
  expirations: string[]
  chains: Record<string, OptionExpiry>
  summary: OptionSummary
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const INTERVALS = [
  { label: '1m',  seconds: 60 },
  { label: '5m',  seconds: 300 },
  { label: '15m', seconds: 900 },
  { label: '30m', seconds: 1800 },
  { label: '1h',  seconds: 3600 },
] as const

type IntervalLabel = typeof INTERVALS[number]['label']

function aggregateCandles(candles: Candle[], intervalSec: number): Candle[] {
  if (intervalSec <= 60) return candles
  const buckets = new Map<number, Candle>()
  for (const c of candles) {
    const bucket = Math.floor(c.time / intervalSec) * intervalSec
    const existing = buckets.get(bucket)
    if (!existing) {
      buckets.set(bucket, { time: bucket, open: c.open, high: c.high, low: c.low, close: c.close })
    } else {
      existing.high = Math.max(existing.high, c.high)
      existing.low = Math.min(existing.low, c.low)
      existing.close = c.close
    }
  }
  return Array.from(buckets.values()).sort((a, b) => a.time - b.time)
}

function isDark() {
  return document.documentElement.classList.contains('dark')
}

function dateToTime(d: string): UTCTimestamp {
  return (new Date(d).getTime() / 1000) as UTCTimestamp
}

function makeChart(el: HTMLDivElement, dark: boolean, height: number): IChartApi {
  const bg = dark ? '#0f172a' : '#ffffff'
  const text = dark ? '#94a3b8' : '#64748b'
  const grid = dark ? '#1e293b' : '#f1f5f9'
  const border = dark ? '#1e293b' : '#e2e8f0'
  return createChart(el, {
    layout: { background: { type: ColorType.Solid, color: bg }, textColor: text, fontSize: 11 },
    grid: { vertLines: { color: grid }, horzLines: { color: grid } },
    rightPriceScale: { borderColor: border },
    timeScale: { borderColor: border, timeVisible: false },
    crosshair: { mode: 1 },
    width: el.clientWidth,
    height,
  })
}

// ── IntraChart (일중 1분봉) ────────────────────────────────────────────────────

function IntraChart({ candles, dark, height = 360 }: { candles: Candle[]; dark: boolean; height?: number }) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!ref.current) return
    const bg = dark ? '#0f172a' : '#ffffff'
    const text = dark ? '#94a3b8' : '#64748b'
    const grid = dark ? '#1e293b' : '#f1f5f9'
    const border = dark ? '#1e293b' : '#e2e8f0'
    const chart: IChartApi = createChart(ref.current, {
      layout: { background: { type: ColorType.Solid, color: bg }, textColor: text, fontSize: 11 },
      grid: { vertLines: { color: grid }, horzLines: { color: grid } },
      rightPriceScale: { borderColor: border },
      timeScale: { borderColor: border, timeVisible: true },
      crosshair: { mode: 1 },
      width: ref.current.clientWidth,
      height,
    })
    const series = chart.addSeries(CandlestickSeries, {
      upColor: '#22c55e', downColor: '#ef4444',
      borderUpColor: '#22c55e', borderDownColor: '#ef4444',
      wickUpColor: dark ? '#475569' : '#cbd5e1',
      wickDownColor: dark ? '#475569' : '#cbd5e1',
    })
    const data: CandlestickData[] = candles.map((c) => ({
      time: c.time as UTCTimestamp,
      open: c.open, high: c.high, low: c.low, close: c.close,
    }))
    series.setData(data)
    chart.timeScale().fitContent()
    const onResize = () => { if (ref.current) chart.applyOptions({ width: ref.current.clientWidth }) }
    window.addEventListener('resize', onResize)
    return () => { window.removeEventListener('resize', onResize); chart.remove() }
  }, [candles, dark, height])

  return <div ref={ref} />
}

// ── 지표 차트 컴포넌트들 ───────────────────────────────────────────────────────

function PriceChart({ series, dark }: { series: IndicatorPoint[]; dark: boolean }) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!ref.current || series.length === 0) return
    const chart = makeChart(ref.current, dark, 320)
    const noLabel = { priceLineVisible: false as const, lastValueVisible: false as const }

    // 캔들스틱
    chart.addSeries(CandlestickSeries, {
      upColor: '#22c55e', downColor: '#ef4444',
      borderUpColor: '#22c55e', borderDownColor: '#ef4444',
      wickUpColor: dark ? '#475569' : '#cbd5e1',
      wickDownColor: dark ? '#475569' : '#cbd5e1',
    }).setData(series.map(p => ({
      time: dateToTime(p.date), open: p.open, high: p.high, low: p.low, close: p.close,
    })))

    // 볼린저밴드
    const bbColor = dark ? '#818cf880' : '#6366f160'
    chart.addSeries(LineSeries, { color: bbColor, lineWidth: 1, lineStyle: LineStyle.Dashed, ...noLabel })
      .setData(series.filter(p => p.bbUpper !== null).map(p => ({ time: dateToTime(p.date), value: p.bbUpper! })))
    chart.addSeries(LineSeries, { color: bbColor, lineWidth: 1, ...noLabel })
      .setData(series.filter(p => p.bbMiddle !== null).map(p => ({ time: dateToTime(p.date), value: p.bbMiddle! })))
    chart.addSeries(LineSeries, { color: bbColor, lineWidth: 1, lineStyle: LineStyle.Dashed, ...noLabel })
      .setData(series.filter(p => p.bbLower !== null).map(p => ({ time: dateToTime(p.date), value: p.bbLower! })))

    // 이동평균 (단기 → 장기 순)
    const mas: [keyof IndicatorPoint, string][] = [
      ['ema12',  '#a78bfa'],  // 보라 (단기 EMA)
      ['ema26',  '#fb923c'],  // 주황 (장기 EMA)
      ['sma5',   '#facc15'],  // 노랑
      ['sma20',  '#ef4444'],  // 빨강
      ['sma50',  '#3b82f6'],  // 파랑
      ['sma200', '#22c55e'],  // 초록 (데이터 쌓이면 등장)
    ]
    for (const [key, color] of mas) {
      const data = series.filter(p => p[key] !== null).map(p => ({ time: dateToTime(p.date), value: p[key] as number }))
      if (data.length > 0)
        chart.addSeries(LineSeries, { color, lineWidth: 1, ...noLabel }).setData(data)
    }

    // 거래량 (하단 15%)
    const volSeries = chart.addSeries(HistogramSeries, { priceScaleId: 'volume', ...noLabel })
    volSeries.priceScale().applyOptions({ scaleMargins: { top: 0.85, bottom: 0 } })
    volSeries.setData(series.map(p => ({
      time: dateToTime(p.date),
      value: p.volume,
      color: p.close >= p.open
        ? (dark ? '#22c55e40' : '#22c55e60')
        : (dark ? '#ef444440' : '#ef444460'),
    })))

    chart.timeScale().fitContent()
    const onResize = () => { if (ref.current) chart.applyOptions({ width: ref.current.clientWidth }) }
    window.addEventListener('resize', onResize)
    return () => { window.removeEventListener('resize', onResize); chart.remove() }
  }, [series, dark])

  return <div ref={ref} />
}

function RsiChart({ series, dark }: { series: IndicatorPoint[]; dark: boolean }) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!ref.current) return
    const valid = series.filter(p => p.rsi14 !== null)
    if (valid.length === 0) return

    const chart = makeChart(ref.current, dark, 160)
    const noLabel = { priceLineVisible: false as const, lastValueVisible: false as const }

    chart.addSeries(LineSeries, { color: '#8b5cf6', lineWidth: 2, priceLineVisible: false, lastValueVisible: true })
      .setData(valid.map(p => ({ time: dateToTime(p.date), value: p.rsi14! })))

    const first = dateToTime(valid[0].date)
    const last = dateToTime(valid[valid.length - 1].date)
    const refLine = (value: number, color: string) =>
      chart.addSeries(LineSeries, { color, lineWidth: 1, lineStyle: LineStyle.Dashed, ...noLabel })
        .setData([{ time: first, value }, { time: last, value }])

    refLine(70, '#ef4444')
    refLine(30, '#22c55e')
    refLine(50, dark ? '#334155' : '#cbd5e1')

    chart.timeScale().fitContent()
    const onResize = () => { if (ref.current) chart.applyOptions({ width: ref.current.clientWidth }) }
    window.addEventListener('resize', onResize)
    return () => { window.removeEventListener('resize', onResize); chart.remove() }
  }, [series, dark])

  return <div ref={ref} />
}

function MacdChart({ series, dark }: { series: IndicatorPoint[]; dark: boolean }) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!ref.current) return
    const valid = series.filter(p => p.macd !== null)
    if (valid.length === 0) return

    const chart = makeChart(ref.current, dark, 160)
    const noLabel = { priceLineVisible: false as const, lastValueVisible: false as const }

    chart.addSeries(HistogramSeries, noLabel)
      .setData(valid.map(p => ({
        time: dateToTime(p.date),
        value: p.macdHistogram ?? 0,
        color: (p.macdHistogram ?? 0) >= 0 ? '#22c55e60' : '#ef444460',
      })))

    chart.addSeries(LineSeries, { color: '#3b82f6', lineWidth: 2, priceLineVisible: false, lastValueVisible: true })
      .setData(valid.map(p => ({ time: dateToTime(p.date), value: p.macd! })))

    const signalValid = valid.filter(p => p.macdSignal !== null)
    if (signalValid.length > 0) {
      chart.addSeries(LineSeries, { color: '#f59e0b', lineWidth: 1, priceLineVisible: false, lastValueVisible: true })
        .setData(signalValid.map(p => ({ time: dateToTime(p.date), value: p.macdSignal! })))
    }

    chart.timeScale().fitContent()
    const onResize = () => { if (ref.current) chart.applyOptions({ width: ref.current.clientWidth }) }
    window.addEventListener('resize', onResize)
    return () => { window.removeEventListener('resize', onResize); chart.remove() }
  }, [series, dark])

  return <div ref={ref} />
}

function ObvChart({ series, dark }: { series: IndicatorPoint[]; dark: boolean }) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!ref.current || series.length === 0) return
    const chart = makeChart(ref.current, dark, 140)
    const noLabel = { priceLineVisible: false as const, lastValueVisible: false as const }

    chart.addSeries(LineSeries, { color: '#06b6d4', lineWidth: 2, priceLineVisible: false, lastValueVisible: true })
      .setData(series.map(p => ({ time: dateToTime(p.date), value: p.obv })))

    // 0 기준선
    const first = dateToTime(series[0].date)
    const last = dateToTime(series[series.length - 1].date)
    chart.addSeries(LineSeries, { color: dark ? '#334155' : '#cbd5e1', lineWidth: 1, lineStyle: LineStyle.Dashed, ...noLabel })
      .setData([{ time: first, value: 0 }, { time: last, value: 0 }])

    chart.timeScale().fitContent()
    const onResize = () => { if (ref.current) chart.applyOptions({ width: ref.current.clientWidth }) }
    window.addEventListener('resize', onResize)
    return () => { window.removeEventListener('resize', onResize); chart.remove() }
  }, [series, dark])

  return <div ref={ref} />
}

// ── 실적 차트 & 뷰 ───────────────────────────────────────────────────────────

function fmtRevenue(v: number): string {
  if (Math.abs(v) >= 1e12) return `$${(v / 1e12).toFixed(2)}T`
  if (Math.abs(v) >= 1e9) return `$${(v / 1e9).toFixed(1)}B`
  return `$${(v / 1e6).toFixed(0)}M`
}

function fmtEps(v: number): string {
  return (v >= 0 ? '$' : '-$') + Math.abs(v).toFixed(2)
}

function fmtPct(v: number): string {
  return (v >= 0 ? '+' : '') + v.toFixed(1) + '%'
}

/** EPS 그룹 바 차트 (실제 vs 예상) */
function EpsBarChart({ quarters, dark }: { quarters: QuarterData[]; dark: boolean }) {
  const W = 500, H = 180
  const pad = { t: 28, b: 34, l: 4, r: 4 }
  const innerH = H - pad.t - pad.b

  const allVals = quarters.flatMap(q => [q.epsActual, q.epsEstimate]).filter(v => v !== null) as number[]
  if (allVals.length === 0) return null

  const minV = Math.min(0, ...allVals)
  const maxV = Math.max(0, ...allVals)
  const range = maxV - minV || 1
  const toY = (v: number) => pad.t + innerH * (1 - (v - minV) / range)
  const zeroY = toY(0)

  const colW = (W - pad.l - pad.r) / quarters.length
  const barW = Math.floor(colW * 0.28)
  const gap = 2

  const textColor = dark ? '#94a3b8' : '#64748b'
  const gridColor = dark ? '#1e293b' : '#f1f5f9'

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full">
      <line x1={pad.l} y1={zeroY} x2={W - pad.r} y2={zeroY} stroke={textColor} strokeOpacity={0.3} />
      <line x1={pad.l} y1={pad.t} x2={W - pad.r} y2={pad.t} stroke={gridColor} />
      {quarters.map((q, i) => {
        const a = q.epsActual
        const r = q.epsEstimate
        const beat = a !== null && r !== null ? a >= r : null
        const actualFill = beat === null ? '#3b82f6' : beat ? '#22c55e' : '#ef4444'
        const cx = pad.l + colW * i + colW / 2
        const aX = cx - barW - gap / 2
        const rX = cx + gap / 2

        return (
          <g key={q.date}>
            {a !== null && (() => {
              const y = toY(Math.max(a, 0))
              const h = Math.max(Math.abs(toY(a) - zeroY), 1)
              return <>
                <rect x={aX} y={y} width={barW} height={h} fill={actualFill} rx={2} />
                <text x={aX + barW / 2} y={y - 4} textAnchor="middle" fontSize={9} fill={actualFill} fontWeight="600">
                  {fmtEps(a)}
                </text>
              </>
            })()}
            {r !== null && (() => {
              const y = toY(Math.max(r, 0))
              const h = Math.max(Math.abs(toY(r) - zeroY), 1)
              return <rect x={rX} y={y} width={barW} height={h} fill={textColor} opacity={0.3} rx={2} />
            })()}
            <text x={cx} y={H - 4} textAnchor="middle" fontSize={10} fill={textColor}>
              {q.date}
            </text>
          </g>
        )
      })}
    </svg>
  )
}

/** 매출 바 차트 */
function RevenueBarChart({ quarters, dark }: { quarters: QuarterData[]; dark: boolean }) {
  const W = 500, H = 180
  const pad = { t: 28, b: 34, l: 4, r: 4 }
  const innerH = H - pad.t - pad.b

  const vals = quarters.map(q => q.revenue).filter(v => v !== null) as number[]
  if (vals.length === 0) return null

  const maxV = Math.max(...vals)
  const minV = Math.min(...vals) * 0.85
  const range = maxV - minV || 1
  const toY = (v: number) => pad.t + innerH * (1 - (v - minV) / range)

  const colW = (W - pad.l - pad.r) / quarters.length
  const barW = Math.floor(colW * 0.55)

  const textColor = dark ? '#94a3b8' : '#64748b'
  const gridColor = dark ? '#1e293b' : '#f1f5f9'

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full">
      <line x1={pad.l} y1={H - pad.b} x2={W - pad.r} y2={H - pad.b} stroke={textColor} strokeOpacity={0.2} />
      <line x1={pad.l} y1={pad.t} x2={W - pad.r} y2={pad.t} stroke={gridColor} />
      {quarters.map((q, i) => {
        const v = q.revenue
        if (v === null) return null
        const cx = pad.l + colW * i + colW / 2
        const y = toY(v)
        const h = Math.max((H - pad.b) - y, 1)

        // 이전 분기 대비 색상
        const prev = i > 0 ? quarters[i - 1].revenue : null
        const fill = prev === null ? '#3b82f6' : v >= prev ? '#22c55e' : '#ef4444'

        return (
          <g key={q.date}>
            <rect x={cx - barW / 2} y={y} width={barW} height={h} fill={fill} rx={2} />
            <text x={cx} y={y - 4} textAnchor="middle" fontSize={9} fill={fill} fontWeight="600">
              {fmtRevenue(v)}
            </text>
            <text x={cx} y={H - 4} textAnchor="middle" fontSize={10} fill={textColor}>
              {q.date}
            </text>
          </g>
        )
      })}
    </svg>
  )
}

/** 순이익 바 차트 */
function NetIncomeBarChart({ quarters, dark }: { quarters: QuarterData[]; dark: boolean }) {
  const W = 500, H = 180
  const pad = { t: 28, b: 34, l: 4, r: 4 }
  const innerH = H - pad.t - pad.b

  const vals = quarters.map(q => q.netIncome).filter(v => v !== null) as number[]
  if (vals.length === 0) return null

  const minV = Math.min(0, ...vals)
  const maxV = Math.max(0, ...vals)
  const range = maxV - minV || 1
  const toY = (v: number) => pad.t + innerH * (1 - (v - minV) / range)
  const zeroY = toY(0)

  const colW = (W - pad.l - pad.r) / quarters.length
  const barW = Math.floor(colW * 0.55)
  const textColor = dark ? '#94a3b8' : '#64748b'

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full">
      <line x1={pad.l} y1={zeroY} x2={W - pad.r} y2={zeroY} stroke={textColor} strokeOpacity={0.3} />
      {quarters.map((q, i) => {
        const v = q.netIncome
        if (v === null) return null
        const cx = pad.l + colW * i + colW / 2
        const y = toY(Math.max(v, 0))
        const h = Math.max(Math.abs(toY(v) - zeroY), 1)
        const fill = v >= 0 ? '#06b6d4' : '#ef4444'
        return (
          <g key={q.date}>
            <rect x={cx - barW / 2} y={y} width={barW} height={h} fill={fill} rx={2} />
            <text x={cx} y={v >= 0 ? y - 4 : y + h + 12} textAnchor="middle" fontSize={9} fill={fill} fontWeight="600">
              {fmtRevenue(v)}
            </text>
            <text x={cx} y={H - 4} textAnchor="middle" fontSize={10} fill={textColor}>{q.date}</text>
          </g>
        )
      })}
    </svg>
  )
}

// ── 실적 설명 데이터 ──────────────────────────────────────────────────────────

const EARNINGS_INFO = {
  summary: {
    headline: '가장 최근 분기의 핵심 수익 지표를 한눈에 보여줍니다. 각 수치가 전분기 대비 개선되고 있는지 확인하세요.',
    items: [
      { label: '희석 EPS', desc: '주식 1주당 순이익. 스톡옵션 등 잠재 주식을 포함한 보수적 수치로, 주주 관점에서 가장 중요한 이익 지표입니다.' },
      { label: 'QoQ (전분기 대비)', desc: '직전 분기 대비 성장률. 계절성이 있어 YoY(전년 동기)와 함께 보는 것이 이상적이지만, 현재는 데이터 특성상 QoQ만 제공합니다.' },
      { label: '매출 (Revenue)', desc: '비용 차감 전 총 수입. \'탑라인\'이라고도 하며 사업 규모와 성장세를 보여줍니다.' },
      { label: '순이익 (Net Income)', desc: '매출에서 모든 비용·세금을 뺀 최종 이익. \'바텀라인\'이라고도 합니다.' },
      { label: 'TTM EPS', desc: 'Trailing Twelve Months — 최근 4개 분기 EPS 합산. 일회성 요인을 평탄화해 연간 수익력을 파악합니다.' },
    ],
  },
  eps: {
    headline: '분기별 주당순이익(EPS) 추이입니다. 막대가 높고 우상향할수록 수익성이 개선되고 있음을 의미합니다.',
    items: [
      { label: 'EPS (Earnings Per Share)', desc: '당기순이익 ÷ 가중평균 희석 주식 수. 1주당 얼마를 벌었는지 나타냅니다.' },
      { label: 'GAAP 기준', desc: '미국 회계 기준(Generally Accepted Accounting Principles). 회사가 별도로 발표하는 Non-GAAP(조정 EPS)보다 보수적이며, SEC 공식 공시 기준입니다.' },
      { label: '양수 vs 음수', desc: '0선 위는 흑자, 아래는 적자. 스타트업·고성장 기업은 초기에 적자가 지속되다 흑자 전환하는 경우가 많습니다.' },
      { label: 'Q4 데이터 없음', desc: 'SEC EDGAR는 분기 보고서(10-Q) 기준 CY프레임을 Q1~Q3만 제공합니다. Q4는 연간 보고서(10-K)에 포함되어 개별 분기로 분리되지 않습니다.' },
    ],
  },
  revenue: {
    headline: '분기별 매출 추이입니다. 초록은 전분기 대비 증가, 빨간은 감소를 의미합니다.',
    items: [
      { label: '매출 성장의 의미', desc: '매출이 늘어도 비용이 더 빠르게 증가하면 순이익은 줄 수 있습니다. 반드시 EPS·순이익률과 함께 봐야 합니다.' },
      { label: '테슬라 매출 구성', desc: '자동차(차량 판매)가 대부분이며, 에너지(Powerwall·Megapack)와 서비스(FSD·정비·슈퍼차저) 비중이 점점 커지고 있습니다.' },
      { label: '계절성', desc: '테슬라는 분기 말(특히 연말 Q4)에 인도량이 집중되는 경향이 있어 Q4 매출이 상대적으로 높게 나타납니다. Q4 데이터는 현재 미포함입니다.' },
    ],
  },
  netIncome: {
    headline: '분기별 순이익과 순이익률입니다. 매출 대비 얼마나 효율적으로 이익을 남기는지 보여줍니다.',
    items: [
      { label: '순이익률 (Net Margin)', desc: '순이익 ÷ 매출 × 100. 매출 1달러 중 순이익으로 남는 비율. 업종 평균과 비교해야 의미 있습니다.' },
      { label: '순이익 vs EPS', desc: '순이익은 회사 전체 금액, EPS는 주주 1주 기준. 자사주 매입 등으로 주식 수가 줄면 순이익이 같아도 EPS가 올라갑니다.' },
      { label: '비용 구조', desc: '매출원가(COGS)·연구개발비(R&D)·판관비(SG&A)가 주요 비용 항목. 이 중 하나라도 빠르게 줄면 순이익이 크게 개선됩니다.' },
    ],
  },
} as const

type EarningsInfoKey = keyof typeof EARNINGS_INFO

function EarningsSectionInfo({ infoKey }: { infoKey: EarningsInfoKey }) {
  const info = EARNINGS_INFO[infoKey]
  return (
    <div className="px-4 pt-3 pb-4 border-b border-[var(--border)] bg-[var(--accent)]/40 space-y-2">
      <p className="text-xs text-[var(--muted-foreground)] leading-relaxed">{info.headline}</p>
      <div className="space-y-2">
        {info.items.map(item => (
          <div key={item.label} className="grid grid-cols-1 sm:grid-cols-[200px_1fr] gap-x-3 gap-y-0.5">
            <span className="text-xs font-medium text-[var(--foreground)]">{item.label}</span>
            <span className="text-xs text-[var(--muted-foreground)] leading-relaxed">{item.desc}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────

function EarningsView({ dark }: { dark: boolean }) {
  const [data, setData] = useState<EarningsSeries | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [infoOpen, setInfoOpen] = useState<Partial<Record<EarningsInfoKey, boolean>>>({})
  const toggleInfo = (key: EarningsInfoKey) => setInfoOpen(prev => ({ ...prev, [key]: !prev[key] }))

  useEffect(() => {
    setLoading(true)
    fetch(`${import.meta.env.BASE_URL}data/stock/TSLA/earnings.json`)
      .then(r => r.ok ? r.json() as Promise<EarningsSeries> : Promise.reject())
      .then(d => { setData(d); setError(false) })
      .catch(() => setError(true))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <div className="py-16 text-center text-sm text-[var(--muted-foreground)]">실적 데이터 불러오는 중...</div>
  if (error || !data || data.quarterly.length === 0) return (
    <div className="py-16 text-center text-sm text-[var(--muted-foreground)]">실적 데이터를 불러올 수 없습니다.</div>
  )

  const latest = data.quarterly[data.quarterly.length - 1]
  const prev   = data.quarterly[data.quarterly.length - 2] ?? null

  const epsQoQ = latest.epsActual !== null && prev?.epsActual != null
    ? ((latest.epsActual - prev.epsActual) / Math.abs(prev.epsActual)) * 100 : null
  const revQoQ = latest.revenue !== null && prev?.revenue != null
    ? ((latest.revenue - prev.revenue) / Math.abs(prev.revenue)) * 100 : null
  const netMargin = latest.netIncome !== null && latest.revenue
    ? (latest.netIncome / latest.revenue) * 100 : null
  const ttmEps = data.quarterly.slice(-4).reduce((s, q) => s + (q.epsActual ?? 0), 0)

  return (
    <div className="space-y-4">
      {/* 최신 분기 요약 카드 */}
      <div className="border border-[var(--border)] rounded-xl overflow-hidden">
        <div className="px-4 py-2.5 border-b border-[var(--border)] flex items-center gap-1.5">
          <span className="text-xs font-medium">최근 분기 요약</span>
          <button type="button" onClick={() => toggleInfo('summary')} title="지표 설명 보기"
            className={`p-0.5 rounded transition-colors ${infoOpen.summary ? 'text-[var(--foreground)]' : 'text-[var(--muted-foreground)] hover:text-[var(--foreground)]'}`}>
            <Info size={12} />
          </button>
        </div>
        {infoOpen.summary && <EarningsSectionInfo infoKey="summary" />}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-3">
        <div className="border border-[var(--border)] rounded-xl p-3 space-y-0.5">
          <div className="text-xs text-[var(--muted-foreground)]">희석 EPS ({latest.date})</div>
          <div className="text-sm font-semibold tabular-nums">
            {latest.epsActual !== null ? fmtEps(latest.epsActual) : '-'}
          </div>
          <div className={`text-xs ${epsQoQ !== null && epsQoQ >= 0 ? 'text-green-500' : 'text-red-500'}`}>
            {epsQoQ !== null ? `전분기 대비 ${fmtPct(epsQoQ)}` : '전분기 데이터 없음'}
          </div>
        </div>
        <div className="border border-[var(--border)] rounded-xl p-3 space-y-0.5">
          <div className="text-xs text-[var(--muted-foreground)]">매출 ({latest.date})</div>
          <div className="text-sm font-semibold tabular-nums">
            {latest.revenue !== null ? fmtRevenue(latest.revenue) : '-'}
          </div>
          <div className={`text-xs ${revQoQ !== null && revQoQ >= 0 ? 'text-green-500' : 'text-red-500'}`}>
            {revQoQ !== null ? `전분기 대비 ${fmtPct(revQoQ)}` : '-'}
          </div>
        </div>
        <div className="border border-[var(--border)] rounded-xl p-3 space-y-0.5">
          <div className="text-xs text-[var(--muted-foreground)]">순이익 ({latest.date})</div>
          <div className={`text-sm font-semibold tabular-nums ${latest.netIncome !== null && latest.netIncome >= 0 ? '' : 'text-red-500'}`}>
            {latest.netIncome !== null ? fmtRevenue(latest.netIncome) : '-'}
          </div>
          <div className="text-xs text-[var(--muted-foreground)]">
            {netMargin !== null ? `순이익률 ${netMargin.toFixed(1)}%` : '-'}
          </div>
        </div>
        <div className="border border-[var(--border)] rounded-xl p-3 space-y-0.5">
          <div className="text-xs text-[var(--muted-foreground)]">TTM EPS (최근 4분기)</div>
          <div className="text-sm font-semibold tabular-nums">
            {fmtEps(ttmEps)}
          </div>
          <div className="text-xs text-[var(--muted-foreground)]">연간 수익력 지표</div>
        </div>
      </div>
      </div>

      {/* EPS 차트 */}
      <div className="border border-[var(--border)] rounded-xl overflow-hidden">
        <div className="px-4 py-2.5 border-b border-[var(--border)] flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-medium">EPS (주당순이익) — 분기별 추이</span>
            <button type="button" onClick={() => toggleInfo('eps')} title="지표 설명 보기"
              className={`p-0.5 rounded transition-colors ${infoOpen.eps ? 'text-[var(--foreground)]' : 'text-[var(--muted-foreground)] hover:text-[var(--foreground)]'}`}>
              <Info size={12} />
            </button>
          </div>
          <span className="text-xs text-[var(--muted-foreground)]">GAAP 희석 EPS · SEC 공시</span>
        </div>
        {infoOpen.eps && <EarningsSectionInfo infoKey="eps" />}
        <div className="px-4 py-3">
          <EpsBarChart quarters={data.quarterly} dark={dark} />
        </div>
      </div>

      {/* 매출 차트 */}
      <div className="border border-[var(--border)] rounded-xl overflow-hidden">
        <div className="px-4 py-2.5 border-b border-[var(--border)] flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-medium">매출 (Revenue) — 분기별 추이</span>
            <button type="button" onClick={() => toggleInfo('revenue')} title="지표 설명 보기"
              className={`p-0.5 rounded transition-colors ${infoOpen.revenue ? 'text-[var(--foreground)]' : 'text-[var(--muted-foreground)] hover:text-[var(--foreground)]'}`}>
              <Info size={12} />
            </button>
          </div>
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1.5 text-xs text-[var(--muted-foreground)]">
              <span className="w-3 h-2 inline-block rounded-sm bg-green-500" /> 전분기 증가
            </span>
            <span className="flex items-center gap-1.5 text-xs text-[var(--muted-foreground)]">
              <span className="w-3 h-2 inline-block rounded-sm bg-red-500" /> 전분기 감소
            </span>
          </div>
        </div>
        {infoOpen.revenue && <EarningsSectionInfo infoKey="revenue" />}
        <div className="px-4 py-3">
          <RevenueBarChart quarters={data.quarterly} dark={dark} />
        </div>
      </div>

      {/* 순이익 차트 */}
      <div className="border border-[var(--border)] rounded-xl overflow-hidden">
        <div className="px-4 py-2.5 border-b border-[var(--border)] flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-medium">순이익 (Net Income) — 분기별 추이</span>
            <button type="button" onClick={() => toggleInfo('netIncome')} title="지표 설명 보기"
              className={`p-0.5 rounded transition-colors ${infoOpen.netIncome ? 'text-[var(--foreground)]' : 'text-[var(--muted-foreground)] hover:text-[var(--foreground)]'}`}>
              <Info size={12} />
            </button>
          </div>
          <span className="text-xs text-[var(--muted-foreground)]">GAAP 기준</span>
        </div>
        {infoOpen.netIncome && <EarningsSectionInfo infoKey="netIncome" />}
        <div className="px-4 py-3">
          <NetIncomeBarChart quarters={data.quarterly} dark={dark} />
        </div>
      </div>

      {/* 분기별 상세 테이블 */}
      <div className="border border-[var(--border)] rounded-xl overflow-hidden">
        <div className="px-4 py-2.5 border-b border-[var(--border)]">
          <span className="text-xs font-medium">분기별 상세</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-[var(--border)] text-[var(--muted-foreground)]">
                <th className="text-left px-4 py-2 font-medium">분기</th>
                <th className="text-right px-4 py-2 font-medium">희석 EPS</th>
                <th className="text-right px-4 py-2 font-medium">EPS QoQ</th>
                <th className="text-right px-4 py-2 font-medium">매출</th>
                <th className="text-right px-4 py-2 font-medium">매출 QoQ</th>
                <th className="text-right px-4 py-2 font-medium">순이익</th>
                <th className="text-right px-4 py-2 font-medium">순이익률</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border)]">
              {[...data.quarterly].reverse().map((q, i, arr) => {
                const prevQ = arr[i + 1] ?? null
                const qEpsQoQ = q.epsActual !== null && prevQ?.epsActual != null
                  ? ((q.epsActual - prevQ.epsActual) / Math.abs(prevQ.epsActual)) * 100 : null
                const qRevQoQ = q.revenue !== null && prevQ?.revenue != null
                  ? ((q.revenue - prevQ.revenue) / Math.abs(prevQ.revenue)) * 100 : null
                const qMargin = q.netIncome !== null && q.revenue
                  ? (q.netIncome / q.revenue) * 100 : null
                return (
                  <tr key={q.date} className="hover:bg-[var(--accent)]/50 transition-colors">
                    <td className="px-4 py-2.5 font-mono font-medium">{q.date}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">
                      {q.epsActual !== null ? fmtEps(q.epsActual) : '-'}
                    </td>
                    <td className={`px-4 py-2.5 text-right tabular-nums ${qEpsQoQ !== null && qEpsQoQ >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                      {qEpsQoQ !== null ? fmtPct(qEpsQoQ) : '-'}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-[var(--muted-foreground)]">
                      {q.revenue !== null ? fmtRevenue(q.revenue) : '-'}
                    </td>
                    <td className={`px-4 py-2.5 text-right tabular-nums ${qRevQoQ !== null && qRevQoQ >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                      {qRevQoQ !== null ? fmtPct(qRevQoQ) : '-'}
                    </td>
                    <td className={`px-4 py-2.5 text-right tabular-nums ${q.netIncome !== null && q.netIncome >= 0 ? '' : 'text-red-500'}`}>
                      {q.netIncome !== null ? fmtRevenue(q.netIncome) : '-'}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-[var(--muted-foreground)]">
                      {qMargin !== null ? `${qMargin.toFixed(1)}%` : '-'}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <div className="px-4 py-2.5 border-t border-[var(--border)] flex items-center justify-between">
          <span className="text-xs text-[var(--muted-foreground)]">QoQ = 전분기 대비 성장률 · Q4는 SEC 공시 방식상 미포함</span>
          <span className="text-xs text-[var(--muted-foreground)]">
            출처: SEC EDGAR (GAAP 공식 공시) · {new Date(data.updatedAt).toLocaleString('ko-KR')}
          </span>
        </div>
      </div>
    </div>
  )
}

// ── 지표 설명 데이터 & 패널 ────────────────────────────────────────────────────

const INDICATOR_INFO = {
  price: {
    headline: '주가에 이동평균선(MA), 볼린저밴드(BB), 거래량을 겹쳐 추세와 변동성을 한눈에 파악합니다.',
    sections: [
      {
        title: '이동평균 (Moving Average)',
        items: [
          { label: 'EMA (지수이동평균)', desc: '최근 데이터에 더 높은 가중치를 줍니다. 반응이 빨라 단기 추세 파악에 유리합니다. EMA12(보라)가 EMA26(주황) 위에 있으면 단기 상승 추세입니다.' },
          { label: 'SMA (단순이동평균)', desc: '모든 날에 동일한 비중을 부여한 평균입니다. SMA5/20은 단기, SMA50은 중기, SMA200은 장기 추세를 나타냅니다.' },
          { label: '골든크로스', desc: '단기 MA가 장기 MA를 상향 돌파 → 강세 전환 신호. 예: SMA5가 SMA20을 위로 넘어설 때.' },
          { label: '데드크로스', desc: '단기 MA가 장기 MA를 하향 돌파 → 약세 전환 신호. 골든크로스의 반대입니다.' },
        ],
      },
      {
        title: '볼린저밴드 (Bollinger Bands)',
        items: [
          { label: '구조', desc: '중심선(SMA20) 위아래로 표준편차×2 거리에 상·하단 밴드를 그립니다. 통계적으로 주가의 95%가 밴드 안에서 움직입니다.' },
          { label: '상단 돌파', desc: '과매수 상태일 가능성 → 단기 하락 조정 대비. 단, 강한 추세에서는 밴드를 타고 계속 올라가기도 합니다.' },
          { label: '하단 이탈', desc: '과매도 상태일 가능성 → 반등 기대. 그러나 추세 하락이라면 밴드를 벗어난 채 내려갈 수도 있습니다.' },
          { label: '밴드 수축 (스퀴즈)', desc: '밴드 폭이 좁아지면 변동성이 줄어든 것으로, 곧 큰 방향성 움직임(상승 또는 하락)이 올 수 있다는 신호입니다.' },
        ],
      },
      {
        title: '거래량 (Volume)',
        items: [
          { label: '상승 + 거래량 증가', desc: '강한 매수세가 뒷받침된 상승 — 추세 신뢰도가 높습니다.' },
          { label: '하락 + 거래량 증가', desc: '강한 매도 압력이 작용 중 — 하락 추세의 신뢰도가 높습니다.' },
          { label: '거래량 없는 변동', desc: '세력이 없는 가격 움직임으로 허수 가능성이 있습니다. 거래량이 받쳐줘야 방향성을 신뢰할 수 있습니다.' },
        ],
      },
    ],
  },
  rsi: {
    headline: 'RSI(Relative Strength Index, 상대강도지수)는 최근 14일 동안의 상승폭·하락폭 비율로 계산한 모멘텀 지표입니다. 값은 0~100이며, 추세의 강도와 과열 여부를 알려줍니다.',
    sections: [
      {
        title: '핵심 레벨',
        items: [
          { label: '70 이상 (과매수)', desc: '단기 급등으로 가격이 과열된 상태. 하락 조정 가능성이 높아지나, 강한 상승 추세에서는 70 이상이 오래 지속될 수 있습니다.' },
          { label: '30 이하 (과매도)', desc: '단기 급락으로 낙폭 과대 상태. 반등 가능성이 있으나, 하락 추세가 이어지면 30 이하도 오래 지속됩니다.' },
          { label: '50 기준선', desc: 'RSI 50 위에 있으면 평균적으로 강세 국면, 아래에 있으면 약세 국면으로 해석합니다.' },
        ],
      },
      {
        title: '다이버전스 (Divergence) — 고급 신호',
        items: [
          { label: '강세 다이버전스', desc: '주가는 이전 저점보다 더 낮은 저점을 만들었는데, RSI는 오히려 더 높은 저점 → 하락 추세 약화, 반전 가능성' },
          { label: '약세 다이버전스', desc: '주가는 이전 고점보다 더 높은 고점을 만들었는데, RSI는 오히려 더 낮은 고점 → 상승 추세 약화, 조정 가능성' },
        ],
      },
    ],
  },
  macd: {
    headline: 'MACD(Moving Average Convergence Divergence)는 단기(EMA12)와 장기(EMA26) 이동평균의 차이를 이용해 추세 방향과 전환 시점을 포착하는 지표입니다. 최소 35일 이상의 데이터가 필요합니다.',
    sections: [
      {
        title: '구성 요소',
        items: [
          { label: 'MACD선 (파랑)', desc: 'EMA12 − EMA26의 값입니다. 양수면 단기 추세가 장기보다 강한 것이고, 음수면 반대입니다.' },
          { label: '시그널선 (주황)', desc: 'MACD의 9일 EMA입니다. MACD의 평균이자 매매 신호의 기준선으로 사용합니다.' },
          { label: '히스토그램', desc: 'MACD − 시그널의 차이를 막대로 표시합니다. 녹색(양수)이면 상승 모멘텀, 빨간색(음수)이면 하락 모멘텀입니다.' },
        ],
      },
      {
        title: '매매 신호',
        items: [
          { label: 'MACD ↑ 시그널 상향 돌파', desc: '골든크로스 — 상승 전환 신호. MACD선이 시그널선을 아래에서 위로 뚫고 올라올 때 매수를 고려합니다.' },
          { label: 'MACD ↓ 시그널 하향 돌파', desc: '데드크로스 — 하락 전환 신호. MACD선이 시그널선을 위에서 아래로 뚫고 내려갈 때 매도를 고려합니다.' },
          { label: 'MACD 0선 돌파', desc: 'MACD가 0 위로 올라오면 강세 전환, 0 아래로 내려가면 약세 전환입니다.' },
          { label: '히스토그램 수렴', desc: '막대가 점점 줄어들면 현재 추세의 모멘텀이 약해지고 있다는 조기 경보입니다.' },
        ],
      },
    ],
  },
  obv: {
    headline: 'OBV(On-Balance Volume)는 거래량의 방향성을 누적해 기관·세력(스마트머니)의 매집·분산을 추적하는 지표입니다. 가격보다 거래량이 먼저 움직이는 특성을 활용합니다.',
    sections: [
      {
        title: '계산 원리',
        items: [
          { label: '계산법', desc: '오늘 종가 > 어제 종가이면 OBV에 거래량을 더하고, 반대이면 뺍니다. 이를 누적한 값이 OBV입니다.' },
          { label: '절대값보다 방향', desc: 'OBV 자체의 숫자보다 상승·하락 추세가 중요합니다. 주가와 같은 방향이면 추세가 건강하다는 뜻입니다.' },
        ],
      },
      {
        title: '해석',
        items: [
          { label: 'OBV↑ + 주가↑', desc: '거래량이 상승 추세를 뒷받침 — 신뢰도 높은 상승입니다.' },
          { label: 'OBV↑ + 주가 횡보', desc: '매집 신호 — 가격이 오르지 않는 사이 기관이 조용히 매수 중일 가능성. 주가 상승에 선행할 수 있습니다.' },
          { label: 'OBV↓ + 주가 횡보', desc: '분산 신호 — 가격이 버티는 사이 세력이 조용히 매도 중일 가능성. 주가 하락에 선행할 수 있습니다.' },
          { label: 'OBV와 가격 역행', desc: '다이버전스 — 가격 추세의 신뢰도가 낮고, 방향 전환이 임박할 수 있습니다.' },
        ],
      },
    ],
  },
} as const

type InfoKey = keyof typeof INDICATOR_INFO

function InfoPanel({ infoKey }: { infoKey: InfoKey }) {
  const info = INDICATOR_INFO[infoKey]
  return (
    <div className="px-4 pt-3 pb-4 border-b border-[var(--border)] bg-[var(--accent)]/40 space-y-4">
      <p className="text-xs text-[var(--muted-foreground)] leading-relaxed">{info.headline}</p>
      <div className="space-y-4">
        {info.sections.map(section => (
          <div key={section.title}>
            <p className="text-[11px] font-semibold text-[var(--muted-foreground)] uppercase tracking-wide mb-2">{section.title}</p>
            <div className="space-y-2">
              {section.items.map(item => (
                <div key={item.label} className="grid grid-cols-1 sm:grid-cols-[180px_1fr] gap-x-3 gap-y-0.5">
                  <span className="text-xs font-medium text-[var(--foreground)]">{item.label}</span>
                  <span className="text-xs text-[var(--muted-foreground)] leading-relaxed">{item.desc}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── 요약 카드 ─────────────────────────────────────────────────────────────────

function SummaryCard({ label, value, sub, valueClass = '' }: {
  label: string; value: string; sub: string; valueClass?: string
}) {
  return (
    <div className="border border-[var(--border)] rounded-xl p-3 space-y-0.5">
      <div className="text-xs text-[var(--muted-foreground)]">{label}</div>
      <div className={`text-sm font-semibold tabular-nums ${valueClass}`}>{value}</div>
      <div className="text-xs text-[var(--muted-foreground)]">{sub}</div>
    </div>
  )
}

function IndicatorSummary({ series }: { series: IndicatorPoint[] }) {
  const last = series[series.length - 1]
  if (!last) return null

  const rsiColor = last.rsi14 === null ? '' : last.rsi14 >= 70 ? 'text-red-500' : last.rsi14 <= 30 ? 'text-green-500' : ''
  const rsiLabel = last.rsi14 === null ? '-' : last.rsi14 >= 70 ? '과매수' : last.rsi14 <= 30 ? '과매도' : '중립'

  let bbLabel = '데이터 부족'
  let bbSub = '20일 이상 필요'
  if (last.bbUpper && last.bbMiddle && last.bbLower) {
    bbSub = `$${last.bbLower.toFixed(0)} ~ $${last.bbUpper.toFixed(0)}`
    if (last.close >= last.bbUpper) bbLabel = '상단 돌파'
    else if (last.close >= last.bbMiddle) bbLabel = '상단 구간'
    else if (last.close >= last.bbLower) bbLabel = '하단 구간'
    else bbLabel = '하단 이탈'
  }

  const smaColor = last.sma5 && last.sma20
    ? (last.sma5 >= last.sma20 ? 'text-green-500' : 'text-red-500') : ''
  const smaLabel = last.sma5 && last.sma20
    ? (last.sma5 >= last.sma20 ? '골든크로스' : '데드크로스') : '데이터 부족'
  const smaSub = last.sma5 && last.sma20
    ? `SMA5 $${last.sma5.toFixed(0)} / SMA20 $${last.sma20.toFixed(0)}` : '20일 이상 필요'

  const atrLabel = last.atr14 !== null ? `$${last.atr14.toFixed(2)}` : '-'
  const atrSub = last.atr14 !== null
    ? `종가의 ${((last.atr14 / last.close) * 100).toFixed(1)}% 일평균 변동`
    : '14일 이상 필요'

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
      <SummaryCard label={`RSI (14)`} value={`${last.rsi14?.toFixed(1) ?? '-'}  ${rsiLabel}`} sub={last.date} valueClass={rsiColor} />
      <SummaryCard label="볼린저밴드 (20,2)" value={bbLabel} sub={bbSub} />
      <SummaryCard label="이동평균" value={smaLabel} sub={smaSub} valueClass={smaColor} />
      <SummaryCard label="ATR (14)" value={atrLabel} sub={atrSub} />
    </div>
  )
}

// ── 차트 헤더 (범례) ──────────────────────────────────────────────────────────

function ChartHeader({ title, items, infoOpen, onInfoToggle }: {
  title: string
  items: { color: string; label: string }[]
  infoOpen?: boolean
  onInfoToggle?: () => void
}) {
  return (
    <div className="px-4 py-2.5 border-b border-[var(--border)] flex items-center justify-between">
      <div className="flex items-center gap-1.5">
        <span className="text-xs font-medium">{title}</span>
        {onInfoToggle && (
          <button
            type="button"
            onClick={onInfoToggle}
            title="지표 설명 보기"
            className={`p-0.5 rounded transition-colors ${
              infoOpen
                ? 'text-[var(--foreground)]'
                : 'text-[var(--muted-foreground)] hover:text-[var(--foreground)]'
            }`}
          >
            <Info size={12} />
          </button>
        )}
      </div>
      <div className="flex items-center gap-3">
        {items.map(({ color, label }) => (
          <span key={label} className="flex items-center gap-1.5 text-xs text-[var(--muted-foreground)]">
            <span className="w-3 h-0.5 inline-block rounded" style={{ backgroundColor: color }} />
            {label}
          </span>
        ))}
      </div>
    </div>
  )
}

// ── 지표 탭 전체 뷰 ───────────────────────────────────────────────────────────

function IndicatorsView({ dark }: { dark: boolean }) {
  const [data, setData] = useState<IndicatorSeries | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [infoOpen, setInfoOpen] = useState<Partial<Record<InfoKey, boolean>>>({})
  const toggleInfo = (key: InfoKey) => setInfoOpen(prev => ({ ...prev, [key]: !prev[key] }))

  useEffect(() => {
    setLoading(true)
    fetch(`${import.meta.env.BASE_URL}data/stock/TSLA/indicators.json`)
      .then(r => r.ok ? r.json() as Promise<IndicatorSeries> : Promise.reject(r.status))
      .then(d => { setData(d); setError(null) })
      .catch(code => setError(code === 404 ? 'not_found' : 'error'))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <div className="py-16 text-center text-sm text-[var(--muted-foreground)]">불러오는 중...</div>

  if (error === 'not_found') return (
    <div className="py-16 text-center space-y-2">
      <p className="text-sm text-[var(--muted-foreground)]">지표 데이터가 없습니다.</p>
      <code className="text-xs bg-[var(--muted)] px-2 py-1 rounded block w-fit mx-auto">
        pnpm --filter pipeline run compute:indicators
      </code>
      <p className="text-xs text-[var(--muted-foreground)]">또는 Admin에서 "지표 계산" 실행</p>
    </div>
  )

  if (!data || data.series.length === 0) return (
    <div className="py-16 text-center text-sm text-[var(--muted-foreground)]">데이터를 불러올 수 없습니다.</div>
  )

  const hasMacd = data.series.some(p => p.macd !== null)

  return (
    <div className="space-y-4">
      <IndicatorSummary series={data.series} />

      {/* 가격 + 볼린저밴드 + 이동평균 + 거래량 */}
      <div className="border border-[var(--border)] rounded-xl overflow-hidden">
        <ChartHeader
          title="가격 · BB · 이동평균 · 거래량"
          items={[
            { color: '#818cf8', label: 'BB' },
            { color: '#a78bfa', label: 'EMA12' },
            { color: '#fb923c', label: 'EMA26' },
            { color: '#facc15', label: 'SMA5' },
            { color: '#ef4444', label: 'SMA20' },
            { color: '#3b82f6', label: 'SMA50' },
            { color: '#22c55e', label: 'SMA200' },
          ]}
          infoOpen={infoOpen.price}
          onInfoToggle={() => toggleInfo('price')}
        />
        {infoOpen.price && <InfoPanel infoKey="price" />}
        <PriceChart series={data.series} dark={dark} />
      </div>

      {/* RSI */}
      <div className="border border-[var(--border)] rounded-xl overflow-hidden">
        <ChartHeader
          title="RSI (14)"
          items={[
            { color: '#8b5cf6', label: 'RSI' },
            { color: '#ef4444', label: '70 과매수' },
            { color: '#22c55e', label: '30 과매도' },
          ]}
          infoOpen={infoOpen.rsi}
          onInfoToggle={() => toggleInfo('rsi')}
        />
        {infoOpen.rsi && <InfoPanel infoKey="rsi" />}
        {data.series.some(p => p.rsi14 !== null)
          ? <RsiChart series={data.series} dark={dark} />
          : <div className="h-[160px] flex items-center justify-center text-sm text-[var(--muted-foreground)]">15일 이상 필요</div>
        }
      </div>

      {/* MACD */}
      <div className="border border-[var(--border)] rounded-xl overflow-hidden">
        <ChartHeader
          title="MACD (12, 26, 9)"
          items={[
            { color: '#3b82f6', label: 'MACD' },
            { color: '#f59e0b', label: 'Signal' },
            { color: '#22c55e', label: 'Histogram' },
          ]}
          infoOpen={infoOpen.macd}
          onInfoToggle={() => toggleInfo('macd')}
        />
        {infoOpen.macd && <InfoPanel infoKey="macd" />}
        {hasMacd
          ? <MacdChart series={data.series} dark={dark} />
          : <div className="h-[160px] flex items-center justify-center text-sm text-[var(--muted-foreground)]">
              35일 이상 필요 (현재 {data.series.length}일 수집됨)
            </div>
        }
      </div>

      {/* OBV */}
      <div className="border border-[var(--border)] rounded-xl overflow-hidden">
        <ChartHeader
          title="OBV (On-Balance Volume)"
          items={[{ color: '#06b6d4', label: 'OBV' }]}
          infoOpen={infoOpen.obv}
          onInfoToggle={() => toggleInfo('obv')}
        />
        {infoOpen.obv && <InfoPanel infoKey="obv" />}
        <ObvChart series={data.series} dark={dark} />
      </div>

      <p className="text-xs text-[var(--muted-foreground)] text-right">
        업데이트: {new Date(data.updatedAt).toLocaleString('ko-KR')}
      </p>
    </div>
  )
}

// ── 옵션 OI 분포 차트 (SVG) ───────────────────────────────────────────────────

function OIBarChart({ expiry, currentPrice, maxPain, dark }: {
  expiry: OptionExpiry; currentPrice: number; maxPain: number; dark: boolean
}) {
  const range = 0.20
  const minStrike = currentPrice * (1 - range)
  const maxStrike = currentPrice * (1 + range)

  const allStrikes = [...new Set([
    ...expiry.calls.map(c => c.strike),
    ...expiry.puts.map(p => p.strike),
  ])].sort((a, b) => a - b).filter(s => s >= minStrike && s <= maxStrike)

  if (allStrikes.length < 2) return (
    <p className="text-xs text-[var(--muted-foreground)] text-center py-4">표시할 데이터가 없습니다</p>
  )

  const callMap = new Map(expiry.calls.map(c => [c.strike, c.openInterest]))
  const putMap  = new Map(expiry.puts.map(p => [p.strike, p.openInterest]))

  const maxOI = Math.max(1, ...allStrikes.flatMap(s => [callMap.get(s) ?? 0, putMap.get(s) ?? 0]))

  const W = 800, H = 220
  const pad = { t: 18, r: 10, b: 32, l: 50 }
  const innerW = W - pad.l - pad.r
  const innerH = H - pad.t - pad.b

  const minS = allStrikes[0]
  const maxS = allStrikes[allStrikes.length - 1]
  const strikeToX = (s: number) => pad.l + ((s - minS) / (maxS - minS)) * innerW
  const oiToH = (oi: number) => innerH * (oi / maxOI)
  const oiToY = (oi: number) => pad.t + innerH - oiToH(oi)

  const avgSpacing = innerW / allStrikes.length
  const barW = Math.max(2, Math.floor(avgSpacing * 0.38))
  const textColor = dark ? '#94a3b8' : '#64748b'
  const labelStep = Math.max(1, Math.floor(allStrikes.length / 12))

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full">
      {/* 축 */}
      <line x1={pad.l} y1={pad.t} x2={pad.l} y2={H - pad.b} stroke={textColor} strokeOpacity={0.15} />
      <line x1={pad.l} y1={H - pad.b} x2={W - pad.r} y2={H - pad.b} stroke={textColor} strokeOpacity={0.15} />

      {/* Y 눈금 */}
      {[0.5, 1].map(frac => (
        <text key={frac} x={pad.l - 4} y={pad.t + innerH * (1 - frac) + 4}
          textAnchor="end" fontSize={8} fill={textColor}>
          {Math.round(maxOI * frac / 1000)}k
        </text>
      ))}

      {/* OI 막대 */}
      {allStrikes.map((strike, i) => {
        const callOI = callMap.get(strike) ?? 0
        const putOI  = putMap.get(strike) ?? 0
        const cx = strikeToX(strike)
        return (
          <g key={strike}>
            {callOI > 0 && (
              <rect x={cx - barW} y={oiToY(callOI)} width={barW - 0.5} height={oiToH(callOI)}
                fill="#3b82f6" fillOpacity={0.75} />
            )}
            {putOI > 0 && (
              <rect x={cx + 0.5} y={oiToY(putOI)} width={barW - 0.5} height={oiToH(putOI)}
                fill="#ef4444" fillOpacity={0.75} />
            )}
            {i % labelStep === 0 && (
              <text x={cx} y={H - 4} textAnchor="middle" fontSize={8} fill={textColor}>
                ${strike}
              </text>
            )}
          </g>
        )
      })}

      {/* 현재가 수직선 */}
      {currentPrice >= minS && currentPrice <= maxS && (() => {
        const x = strikeToX(currentPrice)
        return (
          <>
            <line x1={x} y1={pad.t} x2={x} y2={H - pad.b}
              stroke="#facc15" strokeWidth={1.5} strokeDasharray="4,3" />
            <text x={x} y={pad.t - 3} textAnchor="middle" fontSize={8} fill="#facc15">
              ${currentPrice.toFixed(0)}
            </text>
          </>
        )
      })()}

      {/* Max Pain 수직선 */}
      {maxPain > 0 && maxPain >= minS && maxPain <= maxS && (() => {
        const x = strikeToX(maxPain)
        return (
          <line x1={x} y1={pad.t} x2={x} y2={H - pad.b}
            stroke="#a855f7" strokeWidth={1.5} strokeDasharray="4,3" />
        )
      })()}
    </svg>
  )
}

// ── IV Smile 차트 (SVG) ───────────────────────────────────────────────────────

function IVSmileChart({ expiry, currentPrice, dark }: {
  expiry: OptionExpiry; currentPrice: number; dark: boolean
}) {
  const range = 0.25
  const minStrike = currentPrice * (1 - range)
  const maxStrike = currentPrice * (1 + range)

  const callIVs = expiry.calls
    .filter(c => c.strike >= minStrike && c.strike <= maxStrike && c.impliedVolatility > 0.001 && c.impliedVolatility < 5)
    .sort((a, b) => a.strike - b.strike)
    .map(c => ({ strike: c.strike, iv: c.impliedVolatility * 100 }))

  const putIVs = expiry.puts
    .filter(p => p.strike >= minStrike && p.strike <= maxStrike && p.impliedVolatility > 0.001 && p.impliedVolatility < 5)
    .sort((a, b) => a.strike - b.strike)
    .map(p => ({ strike: p.strike, iv: p.impliedVolatility * 100 }))

  if (callIVs.length < 2 && putIVs.length < 2) return (
    <p className="text-xs text-[var(--muted-foreground)] text-center py-4">IV 데이터가 충분하지 않습니다</p>
  )

  const allStrikes = [...new Set([...callIVs.map(x => x.strike), ...putIVs.map(x => x.strike)])].sort((a, b) => a - b)
  if (allStrikes.length < 2) return null

  const allIVs = [...callIVs.map(x => x.iv), ...putIVs.map(x => x.iv)]
  const minIV = Math.max(0, Math.min(...allIVs) - 5)
  const maxIV = Math.min(300, Math.max(...allIVs) + 5)

  const W = 800, H = 180
  const pad = { t: 10, r: 10, b: 30, l: 45 }
  const innerW = W - pad.l - pad.r
  const innerH = H - pad.t - pad.b

  const minS = allStrikes[0]
  const maxS = allStrikes[allStrikes.length - 1]
  const strikeToX = (s: number) => pad.l + ((s - minS) / (maxS - minS)) * innerW
  const ivToY = (iv: number) => pad.t + innerH * (1 - (iv - minIV) / (maxIV - minIV))

  const makePath = (pts: { strike: number; iv: number }[]) =>
    pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${strikeToX(p.strike).toFixed(1)},${ivToY(p.iv).toFixed(1)}`).join(' ')

  const textColor = dark ? '#94a3b8' : '#64748b'
  const labelStep = Math.max(1, Math.floor(allStrikes.length / 10))

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full">
      <line x1={pad.l} y1={pad.t} x2={pad.l} y2={H - pad.b} stroke={textColor} strokeOpacity={0.15} />
      <line x1={pad.l} y1={H - pad.b} x2={W - pad.r} y2={H - pad.b} stroke={textColor} strokeOpacity={0.15} />

      {[0, 0.5, 1].map(frac => {
        const iv = minIV + (maxIV - minIV) * frac
        return (
          <text key={frac} x={pad.l - 4} y={pad.t + innerH * (1 - frac) + 4}
            textAnchor="end" fontSize={8} fill={textColor}>
            {iv.toFixed(0)}%
          </text>
        )
      })}

      {callIVs.length >= 2 && (
        <>
          <path d={makePath(callIVs)} fill="none" stroke="#3b82f6" strokeWidth={1.5} />
          {callIVs.map(p => <circle key={p.strike} cx={strikeToX(p.strike)} cy={ivToY(p.iv)} r={2} fill="#3b82f6" />)}
        </>
      )}
      {putIVs.length >= 2 && (
        <>
          <path d={makePath(putIVs)} fill="none" stroke="#ef4444" strokeWidth={1.5} />
          {putIVs.map(p => <circle key={p.strike} cx={strikeToX(p.strike)} cy={ivToY(p.iv)} r={2} fill="#ef4444" />)}
        </>
      )}

      {currentPrice >= minS && currentPrice <= maxS && (
        <line x1={strikeToX(currentPrice)} y1={pad.t} x2={strikeToX(currentPrice)} y2={H - pad.b}
          stroke="#facc15" strokeWidth={1} strokeDasharray="4,3" />
      )}

      {allStrikes.filter((_, i) => i % labelStep === 0).map(s => (
        <text key={s} x={strikeToX(s)} y={H - 4} textAnchor="middle" fontSize={8} fill={textColor}>
          ${s}
        </text>
      ))}
    </svg>
  )
}

// ── 옵션 체인 테이블 ──────────────────────────────────────────────────────────

function fmtOI(oi: number): string {
  return oi >= 1000 ? `${(oi / 1000).toFixed(1)}k` : String(oi)
}

function fmtVol(vol: number): string {
  if (vol === 0) return '-'
  return vol >= 1000 ? `${(vol / 1000).toFixed(1)}k` : String(vol)
}

function OptionChainTable({ expiry, currentPrice }: { expiry: OptionExpiry; currentPrice: number }) {
  const range = 0.20
  const minS = currentPrice * (1 - range)
  const maxS = currentPrice * (1 + range)

  const callMap = new Map(expiry.calls.map(c => [c.strike, c]))
  const putMap  = new Map(expiry.puts.map(p => [p.strike, p]))

  const allStrikes = [...new Set([
    ...expiry.calls.map(c => c.strike),
    ...expiry.puts.map(p => p.strike),
  ])].sort((a, b) => a - b).filter(s => s >= minS && s <= maxS)

  if (allStrikes.length === 0) return (
    <p className="text-xs text-[var(--muted-foreground)] p-4 text-center">표시할 데이터 없음 (현재가 ±20% 기준)</p>
  )

  return (
    <table className="w-full text-xs min-w-[600px]">
      <thead>
        <tr className="border-b border-[var(--border)]">
          <th colSpan={4} className="text-center py-2 text-blue-500 font-medium text-[11px]">CALLS</th>
          <th className="text-center py-2 font-semibold text-[11px] bg-[var(--accent)]/30">STRIKE</th>
          <th colSpan={4} className="text-center py-2 text-red-500 font-medium text-[11px]">PUTS</th>
        </tr>
        <tr className="border-b border-[var(--border)] text-[var(--muted-foreground)]">
          <th className="text-right px-2 py-1.5 font-normal">OI</th>
          <th className="text-right px-2 py-1.5 font-normal">거래량</th>
          <th className="text-right px-2 py-1.5 font-normal">IV%</th>
          <th className="text-right px-2 py-1.5 font-normal">Bid/Ask</th>
          <th className="text-center px-2 py-1.5 bg-[var(--accent)]/30"></th>
          <th className="text-left px-2 py-1.5 font-normal">Bid/Ask</th>
          <th className="text-left px-2 py-1.5 font-normal">IV%</th>
          <th className="text-left px-2 py-1.5 font-normal">거래량</th>
          <th className="text-left px-2 py-1.5 font-normal">OI</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-[var(--border)]">
        {allStrikes.map(strike => {
          const call = callMap.get(strike)
          const put  = putMap.get(strike)
          const isAtm = Math.abs(strike - currentPrice) < currentPrice * 0.006
          const callItm = call?.inTheMoney ?? false
          const putItm  = put?.inTheMoney ?? false

          const callBg = callItm ? 'bg-blue-500/8' : ''
          const putBg  = putItm  ? 'bg-red-500/8'  : ''

          return (
            <tr key={strike} className={`hover:bg-[var(--accent)]/30 transition-colors ${isAtm ? 'ring-1 ring-inset ring-yellow-400/50' : ''}`}>
              <td className={`px-2 py-1.5 text-right tabular-nums ${callBg}`}>
                {call ? fmtOI(call.openInterest) : '-'}
              </td>
              <td className={`px-2 py-1.5 text-right tabular-nums ${callBg}`}>
                {call ? fmtVol(call.volume) : '-'}
              </td>
              <td className={`px-2 py-1.5 text-right tabular-nums ${callBg}`}>
                {call ? `${(call.impliedVolatility * 100).toFixed(0)}%` : '-'}
              </td>
              <td className={`px-2 py-1.5 text-right tabular-nums ${callBg}`}>
                {call ? `${call.bid.toFixed(2)}/${call.ask.toFixed(2)}` : '-'}
              </td>

              <td className={`px-3 py-1.5 text-center font-mono font-semibold bg-[var(--accent)]/30 ${isAtm ? 'text-yellow-500' : ''}`}>
                ${strike}
              </td>

              <td className={`px-2 py-1.5 text-left tabular-nums ${putBg}`}>
                {put ? `${put.bid.toFixed(2)}/${put.ask.toFixed(2)}` : '-'}
              </td>
              <td className={`px-2 py-1.5 text-left tabular-nums ${putBg}`}>
                {put ? `${(put.impliedVolatility * 100).toFixed(0)}%` : '-'}
              </td>
              <td className={`px-2 py-1.5 text-left tabular-nums ${putBg}`}>
                {put ? fmtVol(put.volume) : '-'}
              </td>
              <td className={`px-2 py-1.5 text-left tabular-nums ${putBg}`}>
                {put ? fmtOI(put.openInterest) : '-'}
              </td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}

// ── 옵션 탭 전체 뷰 ───────────────────────────────────────────────────────────

function OptionsView({ dark }: { dark: boolean }) {
  const [data, setData] = useState<OptionsSnapshot | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [selectedExpiry, setSelectedExpiry] = useState<string | null>(null)

  useEffect(() => {
    setLoading(true)
    fetch(`${import.meta.env.BASE_URL}data/stock/TSLA/options.json`)
      .then(r => r.ok ? r.json() as Promise<OptionsSnapshot> : Promise.reject())
      .then(d => {
        setData(d)
        setError(false)
        setSelectedExpiry(d.expirations[0] ?? null)
      })
      .catch(() => setError(true))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return (
    <div className="py-16 text-center text-sm text-[var(--muted-foreground)]">옵션 데이터 불러오는 중...</div>
  )

  if (error || !data) return (
    <div className="py-16 text-center space-y-2">
      <p className="text-sm text-[var(--muted-foreground)]">옵션 데이터를 불러올 수 없습니다.</p>
      <code className="text-xs bg-[var(--muted)] px-2 py-1 rounded block w-fit mx-auto">
        pnpm --filter pipeline run collect:options
      </code>
      <p className="text-xs text-[var(--muted-foreground)]">또는 Admin에서 "옵션 수집" 실행</p>
    </div>
  )

  const expiry = selectedExpiry ? data.chains[selectedExpiry] : null
  const pcrColor = data.summary.putCallRatio > 1.2 ? 'text-red-500' : data.summary.putCallRatio < 0.8 ? 'text-green-500' : ''

  return (
    <div className="space-y-4">
      {/* 만기일 선택 탭 */}
      <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-none">
        {data.expirations.map(exp => (
          <button
            key={exp}
            type="button"
            onClick={() => setSelectedExpiry(exp)}
            className={`px-3 py-1.5 rounded-md text-xs font-mono whitespace-nowrap transition-colors ${
              selectedExpiry === exp
                ? 'bg-[var(--foreground)] text-[var(--background)]'
                : 'bg-[var(--accent)] text-[var(--muted-foreground)] hover:text-[var(--foreground)]'
            }`}
          >
            {exp}
          </button>
        ))}
      </div>

      {/* 핵심 지표 카드 */}
      <div className="grid grid-cols-3 gap-3">
        <div className="border border-[var(--border)] rounded-xl p-3 space-y-0.5">
          <div className="text-xs text-[var(--muted-foreground)]">기초자산 가격</div>
          <div className="text-sm font-semibold tabular-nums">${data.underlyingPrice.toFixed(2)}</div>
          <div className="text-xs text-[var(--muted-foreground)]">TSLA 수집 시점</div>
        </div>
        <div className="border border-[var(--border)] rounded-xl p-3 space-y-0.5">
          <div className="text-xs text-[var(--muted-foreground)]">Put/Call OI 비율</div>
          <div className={`text-sm font-semibold tabular-nums ${pcrColor}`}>
            {data.summary.putCallRatio.toFixed(2)}
          </div>
          <div className="text-xs text-[var(--muted-foreground)]">
            콜 {(data.summary.totalCallOI / 1000).toFixed(0)}k · 풋 {(data.summary.totalPutOI / 1000).toFixed(0)}k
          </div>
        </div>
        <div className="border border-[var(--border)] rounded-xl p-3 space-y-0.5">
          <div className="text-xs text-[var(--muted-foreground)]">Max Pain</div>
          <div className="text-sm font-semibold tabular-nums text-purple-400">${data.summary.maxPain}</div>
          <div className="text-xs text-[var(--muted-foreground)]">최근 만기 기준</div>
        </div>
      </div>

      {expiry && (
        <>
          {/* OI 분포 차트 */}
          <div className="border border-[var(--border)] rounded-xl overflow-hidden">
            <div className="px-4 py-2.5 border-b border-[var(--border)] flex items-center justify-between">
              <span className="text-xs font-medium">OI 분포 — 행사가별 미결제약정 ({selectedExpiry})</span>
              <div className="flex items-center gap-3">
                {[['#3b82f6','콜 OI'], ['#ef4444','풋 OI'], ['#facc15','현재가'], ['#a855f7','Max Pain']].map(([c, l]) => (
                  <span key={l} className="flex items-center gap-1 text-xs text-[var(--muted-foreground)]">
                    <span className="w-3 h-0.5 inline-block rounded" style={{ backgroundColor: c }} />
                    {l}
                  </span>
                ))}
              </div>
            </div>
            <div className="px-4 py-3">
              <OIBarChart expiry={expiry} currentPrice={data.underlyingPrice} maxPain={data.summary.maxPain} dark={dark} />
            </div>
          </div>

          {/* IV Smile 차트 */}
          <div className="border border-[var(--border)] rounded-xl overflow-hidden">
            <div className="px-4 py-2.5 border-b border-[var(--border)] flex items-center justify-between">
              <span className="text-xs font-medium">IV Smile — 행사가별 내재변동성 ({selectedExpiry})</span>
              <div className="flex items-center gap-3">
                {[['#3b82f6','콜 IV'], ['#ef4444','풋 IV'], ['#facc15','현재가']].map(([c, l]) => (
                  <span key={l} className="flex items-center gap-1 text-xs text-[var(--muted-foreground)]">
                    <span className="w-3 h-0.5 inline-block rounded" style={{ backgroundColor: c }} />
                    {l}
                  </span>
                ))}
              </div>
            </div>
            <div className="px-4 py-3">
              <IVSmileChart expiry={expiry} currentPrice={data.underlyingPrice} dark={dark} />
            </div>
          </div>

          {/* 옵션 체인 테이블 */}
          <div className="border border-[var(--border)] rounded-xl overflow-hidden">
            <div className="px-4 py-2.5 border-b border-[var(--border)]">
              <span className="text-xs font-medium">옵션 체인 — {selectedExpiry}</span>
              <span className="ml-2 text-xs text-[var(--muted-foreground)]">현재가 ±20% · ITM 하이라이트</span>
            </div>
            <div className="overflow-x-auto">
              <OptionChainTable expiry={expiry} currentPrice={data.underlyingPrice} />
            </div>
          </div>
        </>
      )}

      <p className="text-xs text-[var(--muted-foreground)] text-right">
        수집: {new Date(data.collectedAt).toLocaleString('ko-KR')} · 출처: Yahoo Finance
      </p>
    </div>
  )
}

// ── Main ──────────────────────────────────────────────────────────────────────

export default function Stock() {
  const [tab, setTab] = useState<ViewTab>('indicators')
  const [allInterval, setAllInterval] = useState<IntervalLabel>('5m')
  const [dates, setDates] = useState<DateEntry[]>([])
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const [candles, setCandles] = useState<Candle[] | null>(null)
  const [allCandles, setAllCandles] = useState<Candle[] | null>(null)
  const [loadingDates, setLoadingDates] = useState(true)
  const [loadingCandles, setLoadingCandles] = useState(false)
  const [loadingAll, setLoadingAll] = useState(false)
  const [dark, setDark] = useState(isDark)

  useEffect(() => {
    const observer = new MutationObserver(() => setDark(isDark()))
    observer.observe(document.documentElement, { attributeFilter: ['class'] })
    return () => observer.disconnect()
  }, [])

  const fetchDates = () => {
    setLoadingDates(true)
    fetch(`${import.meta.env.BASE_URL}data/stock/TSLA/dates.json`)
      .then(r => r.ok ? r.json() as Promise<{ dates: DateEntry[] }> : Promise.reject())
      .then(({ dates: d }) => setDates(d))
      .catch(() => setDates([]))
      .finally(() => setLoadingDates(false))
  }

  useEffect(() => { fetchDates() }, [])

  useEffect(() => {
    if (tab !== 'day' || !selectedDate) { setCandles(null); return }
    setLoadingCandles(true)
    fetch(`${import.meta.env.BASE_URL}data/stock/TSLA/candles/${selectedDate}.json`)
      .then(r => r.ok ? r.json() as Promise<{ candles: Candle[] }> : Promise.reject())
      .then(({ candles: c }) => setCandles(c))
      .catch(() => setCandles(null))
      .finally(() => setLoadingCandles(false))
  }, [selectedDate, tab])

  useEffect(() => {
    if (tab !== 'all' || allCandles !== null) return
    setLoadingAll(true)
    fetch(`${import.meta.env.BASE_URL}data/stock/TSLA/all-candles.json`)
      .then(r => r.ok ? r.json() as Promise<{ candles: Candle[] }> : Promise.reject())
      .then(({ candles: c }) => setAllCandles(c))
      .catch(() => setAllCandles([]))
      .finally(() => setLoadingAll(false))
  }, [tab, allCandles])

  const selectedEntry = dates.find(d => d.date === selectedDate)
  const totalCandles = dates.reduce((s, d) => s + d.count, 0)

  return (
    <main className="max-w-5xl mx-auto px-4 py-6">
      {/* 헤더 */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <h1 className="text-sm font-semibold">TSLA</h1>
          {!loadingDates && dates.length > 0 && (
            <span className="text-xs text-[var(--muted-foreground)]">
              {dates.length}일 · {totalCandles.toLocaleString()} candles
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <div className="flex gap-0.5">
            {([['indicators', '지표'], ['earnings', '실적'], ['options', '옵션'], ['day', '일별'], ['all', '전체']] as const).map(([value, label]) => (
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
          <button
            type="button"
            onClick={fetchDates}
            className="p-1.5 rounded-md text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--accent)] transition-colors"
            title="새로고침"
          >
            <RefreshCw size={13} />
          </button>
        </div>
      </div>

      {tab === 'indicators' ? (
        <IndicatorsView dark={dark} />
      ) : tab === 'earnings' ? (
        <EarningsView dark={dark} />
      ) : tab === 'options' ? (
        <OptionsView dark={dark} />
      ) : loadingDates ? (
        <p className="text-sm text-[var(--muted-foreground)]">불러오는 중...</p>
      ) : dates.length === 0 ? (
        <div className="py-16 text-center space-y-2">
          <p className="text-sm text-[var(--muted-foreground)]">수집된 데이터가 없습니다.</p>
          <code className="text-xs bg-[var(--muted)] px-2 py-1 rounded block w-fit mx-auto">pnpm pipeline</code>
        </div>
      ) : tab === 'day' ? (
        /* ── 일별 뷰 ── */
        <div className="grid grid-cols-1 md:grid-cols-[200px_1fr] gap-4">
          <div className="border border-[var(--border)] rounded-xl overflow-hidden h-fit">
            <div className="px-3 py-2 border-b border-[var(--border)]">
              <span className="text-xs text-[var(--muted-foreground)]">{dates.length}일 수집됨</span>
            </div>
            <div className="divide-y divide-[var(--border)] max-h-[480px] overflow-y-auto">
              {dates.map(({ date, count }) => (
                <button
                  key={date}
                  type="button"
                  onClick={() => setSelectedDate(selectedDate === date ? null : date)}
                  className={`w-full flex items-center justify-between px-3 py-2.5 text-sm hover:bg-[var(--accent)] transition-colors ${
                    selectedDate === date ? 'bg-[var(--accent)] font-medium' : ''
                  }`}
                >
                  <span className="font-mono text-xs">{date}</span>
                  <span className="text-xs text-[var(--muted-foreground)]">{count}</span>
                </button>
              ))}
            </div>
          </div>

          <div>
            {!selectedDate ? (
              <div className="h-[420px] flex items-center justify-center border border-[var(--border)] rounded-xl">
                <p className="text-sm text-[var(--muted-foreground)]">날짜를 선택하세요</p>
              </div>
            ) : (
              <div className="border border-[var(--border)] rounded-xl overflow-hidden">
                <div className="px-4 py-2.5 border-b border-[var(--border)] flex items-center justify-between">
                  <span className="text-xs font-medium">{selectedDate} · 1분봉</span>
                  {selectedEntry && <span className="text-xs text-[var(--muted-foreground)]">{selectedEntry.count} candles</span>}
                </div>
                {loadingCandles ? (
                  <div className="h-[360px] flex items-center justify-center">
                    <p className="text-sm text-[var(--muted-foreground)]">불러오는 중...</p>
                  </div>
                ) : candles ? (
                  <IntraChart candles={candles} dark={dark} />
                ) : (
                  <div className="h-[360px] flex items-center justify-center">
                    <p className="text-sm text-[var(--muted-foreground)]">데이터를 불러올 수 없습니다</p>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      ) : (
        /* ── 전체 연속 뷰 ── */
        <div className="border border-[var(--border)] rounded-xl overflow-hidden">
          <div className="px-4 py-2.5 border-b border-[var(--border)] flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="text-xs font-medium">전체 기간</span>
              <div className="flex gap-0.5">
                {INTERVALS.map(({ label }) => (
                  <button
                    key={label}
                    type="button"
                    onClick={() => setAllInterval(label)}
                    className={`px-2 py-0.5 rounded text-xs font-medium transition-colors ${
                      allInterval === label
                        ? 'bg-[var(--foreground)] text-[var(--background)]'
                        : 'text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--accent)]'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
            {allCandles && (
              <span className="text-xs text-[var(--muted-foreground)]">
                {aggregateCandles(allCandles, INTERVALS.find(i => i.label === allInterval)!.seconds).length.toLocaleString()} candles
              </span>
            )}
          </div>
          {loadingAll ? (
            <div className="h-[480px] flex items-center justify-center">
              <p className="text-sm text-[var(--muted-foreground)]">불러오는 중...</p>
            </div>
          ) : allCandles && allCandles.length > 0 ? (
            <IntraChart
              candles={aggregateCandles(allCandles, INTERVALS.find(i => i.label === allInterval)!.seconds)}
              dark={dark}
              height={480}
            />
          ) : (
            <div className="h-[480px] flex items-center justify-center">
              <p className="text-sm text-[var(--muted-foreground)]">데이터를 불러올 수 없습니다</p>
            </div>
          )}
        </div>
      )}
    </main>
  )
}
