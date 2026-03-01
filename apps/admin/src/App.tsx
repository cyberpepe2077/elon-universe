import { useCallback, useEffect, useRef, useState } from 'react'
import {
  createChart,
  CandlestickSeries,
  ColorType,
  type IChartApi,
  type CandlestickData,
  type UTCTimestamp,
} from 'lightweight-charts'
import { Moon, Sun, Play, RefreshCw, TrendingUp, Newspaper, History, Upload, Trash2 } from 'lucide-react'

// ── Types ──────────────────────────────────────────────────────────────────
interface AdminStatus {
  pipeline: { running: boolean; log: string[] }
  stock: { running: boolean; log: string[] }
  backfill: { running: boolean; log: string[] }
  indicators: { running: boolean; log: string[] }
  earnings: { running: boolean; log: string[] }
  export: { running: boolean; log: string[] }
}

interface StockDateEntry {
  date: string
  count: number
}

interface Candle {
  time: number
  open: number
  high: number
  low: number
  close: number
}

interface DayCandles {
  candles: Candle[]
}

interface ArticleStats {
  total: number
  tesla: number
  spacex: number
  xai: number
}

// ── Theme ──────────────────────────────────────────────────────────────────
function useTheme() {
  const [dark, setDark] = useState(true)
  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark)
  }, [dark])
  return { dark, toggle: () => setDark((d) => !d) }
}

// ── Intra-day Chart ────────────────────────────────────────────────────────
function IntraChart({ candles, dark }: { candles: Candle[]; dark: boolean }) {
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
      height: 300,
    })

    const series = chart.addSeries(CandlestickSeries, {
      upColor: '#22c55e',
      downColor: '#ef4444',
      borderUpColor: '#22c55e',
      borderDownColor: '#ef4444',
      wickUpColor: dark ? '#475569' : '#cbd5e1',
      wickDownColor: dark ? '#475569' : '#cbd5e1',
    })

    const data: CandlestickData[] = candles.map((c) => ({
      time: c.time as UTCTimestamp,
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close,
    }))
    series.setData(data)
    chart.timeScale().fitContent()

    const onResize = () => {
      if (ref.current) chart.applyOptions({ width: ref.current.clientWidth })
    }
    window.addEventListener('resize', onResize)
    return () => {
      window.removeEventListener('resize', onResize)
      chart.remove()
    }
  }, [candles, dark])

  return <div ref={ref} />
}

// ── RunButton ──────────────────────────────────────────────────────────────
function RunButton({
  label,
  running,
  disabled,
  onClick,
}: {
  label: string
  running: boolean
  disabled: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex items-center justify-center gap-2 w-full px-3 py-2 rounded-lg text-sm font-medium bg-[var(--foreground)] text-[var(--background)] hover:opacity-80 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
    >
      {running ? (
        <span className="w-3 h-3 rounded-full border-2 border-current border-t-transparent animate-spin" />
      ) : (
        <Play size={13} />
      )}
      {running ? '실행 중...' : label}
    </button>
  )
}

// ── LogBox ─────────────────────────────────────────────────────────────────
function LogBox({ lines, logRef }: { lines: string[]; logRef: React.RefObject<HTMLPreElement | null> }) {
  if (lines.length === 0) return null
  return (
    <pre
      ref={logRef}
      className="text-xs bg-[var(--muted)] rounded-lg p-3 h-44 overflow-y-auto font-mono whitespace-pre-wrap leading-relaxed"
    >
      {lines.join('\n')}
    </pre>
  )
}

// ── Main App ───────────────────────────────────────────────────────────────
export default function App() {
  const { dark, toggle } = useTheme()

  // ── Pipeline / Stock 실행 상태 ──
  const [status, setStatus] = useState<AdminStatus>({
    pipeline: { running: false, log: [] },
    stock: { running: false, log: [] },
    backfill: { running: false, log: [] },
    indicators: { running: false, log: [] },
    earnings: { running: false, log: [] },
    export: { running: false, log: [] },
  })
  const pipelineLogRef = useRef<HTMLPreElement>(null)
  const stockLogRef = useRef<HTMLPreElement>(null)
  const backfillLogRef = useRef<HTMLPreElement>(null)
  const indicatorsLogRef = useRef<HTMLPreElement>(null)
  const earningsLogRef = useRef<HTMLPreElement>(null)
  const exportLogRef = useRef<HTMLPreElement>(null)

  const fetchStatus = useCallback(async () => {
    const r = await fetch('/api/admin/status')
    if (r.ok) setStatus(await r.json() as AdminStatus)
  }, [])

  const isAnyRunning = status.pipeline.running || status.stock.running || status.backfill.running || status.indicators.running || status.earnings.running || status.export.running

  useEffect(() => {
    void fetchStatus()
    const interval = setInterval(() => void fetchStatus(), isAnyRunning ? 1500 : 8000)
    return () => clearInterval(interval)
  }, [fetchStatus, isAnyRunning])

  // 로그 자동 스크롤
  useEffect(() => {
    if (pipelineLogRef.current) {
      pipelineLogRef.current.scrollTop = pipelineLogRef.current.scrollHeight
    }
  }, [status.pipeline.log])
  useEffect(() => {
    if (stockLogRef.current) {
      stockLogRef.current.scrollTop = stockLogRef.current.scrollHeight
    }
  }, [status.stock.log])
  useEffect(() => {
    if (backfillLogRef.current) {
      backfillLogRef.current.scrollTop = backfillLogRef.current.scrollHeight
    }
  }, [status.backfill.log])
  useEffect(() => {
    if (indicatorsLogRef.current) {
      indicatorsLogRef.current.scrollTop = indicatorsLogRef.current.scrollHeight
    }
  }, [status.indicators.log])
  useEffect(() => {
    if (earningsLogRef.current) {
      earningsLogRef.current.scrollTop = earningsLogRef.current.scrollHeight
    }
  }, [status.earnings.log])
  useEffect(() => {
    if (exportLogRef.current) {
      exportLogRef.current.scrollTop = exportLogRef.current.scrollHeight
    }
  }, [status.export.log])

  const runPipeline = useCallback(async () => {
    await fetch('/api/admin/run/pipeline', { method: 'POST' })
    void fetchStatus()
  }, [fetchStatus])

  const runStock = useCallback(async () => {
    await fetch('/api/admin/run/stock', { method: 'POST' })
    void fetchStatus()
  }, [fetchStatus])

  const runIndicators = useCallback(async () => {
    await fetch('/api/admin/run/indicators', { method: 'POST' })
    void fetchStatus()
  }, [fetchStatus])

  const runEarnings = useCallback(async () => {
    await fetch('/api/admin/run/earnings', { method: 'POST' })
    void fetchStatus()
  }, [fetchStatus])

  const runExport = useCallback(async () => {
    await fetch('/api/admin/run/export', { method: 'POST' })
    void fetchStatus()
  }, [fetchStatus])

  // ── 백필 ──
  const [polygonKeyConfigured, setPolygonKeyConfigured] = useState<boolean | null>(null)
  const [backfillFrom, setBackfillFrom] = useState('')
  const [backfillTo, setBackfillTo] = useState('')
  const hasSetBackfillDefaults = useRef(false)

  useEffect(() => {
    fetch('/api/admin/config')
      .then((r) => r.ok ? r.json() as Promise<{ polygonKeyConfigured: boolean }> : Promise.reject())
      .then(({ polygonKeyConfigured: v }) => setPolygonKeyConfigured(v))
      .catch(() => setPolygonKeyConfigured(false))
  }, [])

  const applyBackfillPreset = useCallback((months: number) => {
    const todayET = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' })
    const toD = new Date(todayET + 'T12:00:00Z')
    toD.setUTCDate(toD.getUTCDate() - 1)
    const to = toD.toISOString().slice(0, 10)

    const fromD = new Date(todayET + 'T12:00:00Z')
    fromD.setUTCMonth(fromD.getUTCMonth() - months)
    const from = fromD.toISOString().slice(0, 10)

    setBackfillFrom(from)
    setBackfillTo(to)
  }, [])

  const runBackfill = useCallback(async () => {
    await fetch('/api/admin/run/backfill', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: backfillFrom, to: backfillTo }),
    })
    void fetchStatus()
  }, [fetchStatus, backfillFrom, backfillTo])

  // ── 주식 데이터 ──
  const [stockDates, setStockDates] = useState<StockDateEntry[]>([])
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const [dayCandles, setDayCandles] = useState<Candle[] | null>(null)

  const fetchStockDates = useCallback(async () => {
    const r = await fetch('/api/stock/TSLA/dates')
    if (r.ok) {
      const d = await r.json() as { dates: StockDateEntry[] }
      setStockDates(d.dates)
    }
  }, [])

  useEffect(() => { void fetchStockDates() }, [fetchStockDates])

  // 백필 날짜 프리필 — stockDates 최초 로드 시 한 번만
  useEffect(() => {
    if (hasSetBackfillDefaults.current) return

    // ET 기준 오늘 날짜를 먼저 구한 뒤 하루 빼기 (로컬 timezone 오염 방지)
    const todayET = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' })
    const d = new Date(todayET + 'T12:00:00Z')
    d.setUTCDate(d.getUTCDate() - 1)
    const to = d.toISOString().slice(0, 10)

    let from: string
    if (stockDates.length > 0) {
      // stockDates[0]이 가장 최근 날짜 (API가 내림차순 정렬)
      const latest = new Date(stockDates[0].date + 'T12:00:00Z')
      latest.setUTCDate(latest.getUTCDate() + 1)
      from = latest.toISOString().slice(0, 10)
    } else {
      const yearAgo = new Date()
      yearAgo.setFullYear(yearAgo.getFullYear() - 1)
      from = yearAgo.toLocaleDateString('en-CA', { timeZone: 'America/New_York' })
    }

    if (from <= to) {
      setBackfillFrom(from)
      setBackfillTo(to)
      hasSetBackfillDefaults.current = true
    }
  }, [stockDates])

  // 수집 완료 후 날짜 목록 갱신
  const prevStockRunning = useRef(false)
  useEffect(() => {
    if (prevStockRunning.current && !status.stock.running) void fetchStockDates()
    prevStockRunning.current = status.stock.running
  }, [status.stock.running, fetchStockDates])

  const prevPipelineRunning = useRef(false)
  useEffect(() => {
    if (prevPipelineRunning.current && !status.pipeline.running) void fetchStockDates()
    prevPipelineRunning.current = status.pipeline.running
  }, [status.pipeline.running, fetchStockDates])

  useEffect(() => {
    if (!selectedDate) { setDayCandles(null); return }
    fetch(`/api/stock/TSLA/candles?date=${selectedDate}`)
      .then((r) => r.ok ? r.json() as Promise<DayCandles> : Promise.reject())
      .then((d) => setDayCandles(d.candles))
      .catch(() => setDayCandles(null))
  }, [selectedDate])

  // ── 기사 통계 ──
  const [articleStats, setArticleStats] = useState<ArticleStats | null>(null)
  useEffect(() => {
    fetch('/api/articles')
      .then((r) => r.ok ? r.json() as Promise<{ articles: Array<{ category: string }>; total: number }> : Promise.reject())
      .then(({ articles, total }) => setArticleStats({
        total,
        tesla: articles.filter((a) => a.category === 'tesla').length,
        spacex: articles.filter((a) => a.category === 'spacex').length,
        xai: articles.filter((a) => a.category === 'xai').length,
      }))
      .catch(() => {})
  }, [])

  // ── 기사 파일 목록 & 정리 ──
  const [articleDates, setArticleDates] = useState<string[]>([])
  const [cleanupKeepDays, setCleanupKeepDays] = useState(7)
  const [cleanupLoading, setCleanupLoading] = useState(false)
  const [cleanupResult, setCleanupResult] = useState<{ deleted: string[]; kept: string[] } | null>(null)

  const fetchArticleDates = useCallback(async () => {
    const r = await fetch('/api/articles/dates')
    if (r.ok) {
      const d = await r.json() as { dates: string[] }
      setArticleDates(d.dates)
    }
  }, [])

  useEffect(() => { void fetchArticleDates() }, [fetchArticleDates])

  const runArticleCleanup = useCallback(async () => {
    const deleteCount = Math.max(0, articleDates.length - cleanupKeepDays)
    if (deleteCount === 0) return
    if (!confirm(`오래된 기사 파일 ${deleteCount}개를 삭제하시겠습니까?`)) return
    setCleanupLoading(true)
    setCleanupResult(null)
    try {
      const r = await fetch('/api/admin/cleanup/articles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ keepDays: cleanupKeepDays }),
      })
      if (r.ok) {
        const result = await r.json() as { deleted: string[]; kept: string[] }
        setCleanupResult(result)
        void fetchArticleDates()
      }
    } finally {
      setCleanupLoading(false)
    }
  }, [articleDates.length, cleanupKeepDays, fetchArticleDates])

  // ── Render ──────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-[var(--background)] text-[var(--foreground)]">
      {/* Header */}
      <header className="sticky top-0 z-10 border-b border-[var(--border)] bg-[var(--background)]/80 backdrop-blur-sm">
        <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="font-bold text-sm">Elon Universe</span>
            <span className="text-xs px-1.5 py-0.5 rounded bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400 font-medium">
              Admin
            </span>
          </div>
          <button
            type="button"
            onClick={toggle}
            className="p-1.5 rounded-md text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--accent)] transition-colors"
          >
            {dark ? <Sun size={15} /> : <Moon size={15} />}
          </button>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-8 space-y-10">

        {/* ── 파이프라인 제어 ── */}
        <section>
          <h2 className="flex items-center gap-2 text-sm font-semibold mb-4">
            <Play size={14} className="text-[var(--muted-foreground)]" />
            파이프라인 제어
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">

            {/* 전체 파이프라인 */}
            <div className="border border-[var(--border)] rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">뉴스 수집</span>
                {status.pipeline.running
                  ? <span className="flex items-center gap-1 text-xs text-green-500"><span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />실행 중</span>
                  : <span className="text-xs text-[var(--muted-foreground)]">대기</span>
                }
              </div>
              <p className="text-xs text-[var(--muted-foreground)]">RSS · Reddit · SEC → 정제 → 스크래핑 → AI 번역</p>
              <RunButton
                label="실행"
                running={status.pipeline.running}
                disabled={isAnyRunning}
                onClick={() => void runPipeline()}
              />
              <LogBox lines={status.pipeline.log} logRef={pipelineLogRef} />
            </div>

            {/* 주식만 수집 */}
            <div className="border border-[var(--border)] rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">주식만 수집</span>
                {status.stock.running
                  ? <span className="flex items-center gap-1 text-xs text-green-500"><span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />실행 중</span>
                  : <span className="text-xs text-[var(--muted-foreground)]">대기</span>
                }
              </div>
              <p className="text-xs text-[var(--muted-foreground)]">TSLA 1분봉 수집만 단독 실행</p>
              <RunButton
                label="실행"
                running={status.stock.running}
                disabled={isAnyRunning}
                onClick={() => void runStock()}
              />
              <LogBox lines={status.stock.log} logRef={stockLogRef} />
            </div>

            {/* 기술적 지표 계산 */}
            <div className="border border-[var(--border)] rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">지표 계산</span>
                {status.indicators.running
                  ? <span className="flex items-center gap-1 text-xs text-green-500"><span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />실행 중</span>
                  : <span className="text-xs text-[var(--muted-foreground)]">대기</span>
                }
              </div>
              <p className="text-xs text-[var(--muted-foreground)]">RSI · MACD · BB · SMA · EMA · OBV · ATR 재계산</p>
              <RunButton
                label="실행"
                running={status.indicators.running}
                disabled={isAnyRunning}
                onClick={() => void runIndicators()}
              />
              <LogBox lines={status.indicators.log} logRef={indicatorsLogRef} />
            </div>

            {/* 실적 수집 */}
            <div className="border border-[var(--border)] rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">실적 수집</span>
                {status.earnings.running
                  ? <span className="flex items-center gap-1 text-xs text-green-500"><span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />실행 중</span>
                  : <span className="text-xs text-[var(--muted-foreground)]">대기</span>
                }
              </div>
              <p className="text-xs text-[var(--muted-foreground)]">SEC EDGAR → 분기별 EPS · 매출 · 순이익</p>
              <RunButton
                label="실행"
                running={status.earnings.running}
                disabled={isAnyRunning}
                onClick={() => void runEarnings()}
              />
              <LogBox lines={status.earnings.log} logRef={earningsLogRef} />
            </div>
          </div>
        </section>

        {/* ── 정적 내보내기 ── */}
        <section>
          <h2 className="flex items-center gap-2 text-sm font-semibold mb-4">
            <Upload size={14} className="text-[var(--muted-foreground)]" />
            정적 내보내기
            <span className="text-xs font-normal text-[var(--muted-foreground)]">web/public/data/</span>
          </h2>
          <div className="border border-[var(--border)] rounded-xl p-4 space-y-3">
            <p className="text-xs text-[var(--muted-foreground)]">
              파이프라인 출력을 정적 JSON으로 변환합니다. 기사 · TSLA 지표/실적/캔들 · 시장 지수(SPY/QQQ/TSLA)를 <code className="bg-[var(--muted)] px-1 rounded">apps/web/public/data/</code>에 저장합니다.
            </p>
            <div className="flex items-center justify-between">
              {status.export.running
                ? <span className="flex items-center gap-1 text-xs text-green-500"><span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />실행 중</span>
                : <span className="text-xs text-[var(--muted-foreground)]">대기</span>
              }
            </div>
            <RunButton
              label="내보내기 실행"
              running={status.export.running}
              disabled={isAnyRunning}
              onClick={() => void runExport()}
            />
            <LogBox lines={status.export.log} logRef={exportLogRef} />
          </div>
        </section>

        {/* ── 과거 데이터 백필 (Polygon.io) ── */}
        <section>
          <h2 className="flex items-center gap-2 text-sm font-semibold mb-4">
            <History size={14} className="text-[var(--muted-foreground)]" />
            과거 데이터 백필
            <span className="text-xs font-normal text-[var(--muted-foreground)]">Polygon.io</span>
          </h2>

          <div className="border border-[var(--border)] rounded-xl p-4 space-y-3">
            {/* API 키 상태 */}
            <div className="flex items-center gap-2 text-xs">
              <span className="text-[var(--muted-foreground)]">API 키</span>
              {polygonKeyConfigured === null ? (
                <span className="text-[var(--muted-foreground)]">확인 중...</span>
              ) : polygonKeyConfigured ? (
                <span className="text-green-500">설정됨</span>
              ) : (
                <span className="text-red-400">
                  미설정 —{' '}
                  <code className="bg-[var(--muted)] px-1 rounded">POLYGON_API_KEY</code> 환경변수를 설정하세요
                </span>
              )}
            </div>

            {/* 프리셋 버튼 */}
            <div className="flex gap-1">
              {([['1M', 1], ['3M', 3], ['6M', 6], ['1Y', 12], ['2Y', 24]] as const).map(([label, months]) => (
                <button
                  key={label}
                  type="button"
                  onClick={() => applyBackfillPreset(months)}
                  className="px-2 py-1 rounded text-xs font-medium text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--accent)] transition-colors"
                >
                  {label}
                </button>
              ))}
            </div>

            {/* 날짜 범위 */}
            <div className="flex items-center gap-2">
              <input
                type="date"
                value={backfillFrom}
                onChange={(e) => setBackfillFrom(e.target.value)}
                className="flex-1 text-xs bg-[var(--muted)] border border-[var(--border)] rounded-lg px-2 py-1.5 text-[var(--foreground)] focus:outline-none"
              />
              <span className="text-xs text-[var(--muted-foreground)]">~</span>
              <input
                type="date"
                value={backfillTo}
                onChange={(e) => setBackfillTo(e.target.value)}
                className="flex-1 text-xs bg-[var(--muted)] border border-[var(--border)] rounded-lg px-2 py-1.5 text-[var(--foreground)] focus:outline-none"
              />
            </div>

            <div className="flex items-center justify-between">
              {status.backfill.running
                ? <span className="flex items-center gap-1 text-xs text-green-500"><span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />실행 중</span>
                : <span className="text-xs text-[var(--muted-foreground)]">대기</span>
              }
            </div>

            <RunButton
              label="백필 실행"
              running={status.backfill.running}
              disabled={isAnyRunning || !polygonKeyConfigured || !backfillFrom || !backfillTo}
              onClick={() => void runBackfill()}
            />
            <p className="text-xs text-[var(--muted-foreground)]">
              무료 티어 5 req/min 제한 → 날짜당 13초 간격. 주말·공휴일은 자동 스킵.
            </p>
            <LogBox lines={status.backfill.log} logRef={backfillLogRef} />
          </div>
        </section>

        {/* ── TSLA 주식 데이터 ── */}
        <section>
          <div className="flex items-center justify-between mb-4">
            <h2 className="flex items-center gap-2 text-sm font-semibold">
              <TrendingUp size={14} className="text-[var(--muted-foreground)]" />
              TSLA 주식 데이터
              {stockDates.length > 0 && (
                <span className="text-[var(--muted-foreground)] font-normal">{stockDates.length}일 수집됨</span>
              )}
            </h2>
            <button
              type="button"
              onClick={() => void fetchStockDates()}
              className="p-1.5 rounded-md text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--accent)] transition-colors"
              title="새로고침"
            >
              <RefreshCw size={13} />
            </button>
          </div>

          {stockDates.length === 0 ? (
            <p className="text-sm text-[var(--muted-foreground)]">
              수집된 데이터가 없습니다. 파이프라인을 실행하세요.
            </p>
          ) : (
            <div className="border border-[var(--border)] rounded-xl overflow-hidden">
              <div className="max-h-72 overflow-y-auto divide-y divide-[var(--border)]">
                {stockDates.map(({ date, count }) => (
                  <button
                    key={date}
                    type="button"
                    onClick={() => setSelectedDate(selectedDate === date ? null : date)}
                    className={`w-full flex items-center justify-between px-4 py-2.5 text-sm hover:bg-[var(--accent)] transition-colors ${selectedDate === date ? 'bg-[var(--accent)]' : ''}`}
                  >
                    <span className="font-mono text-xs">{date}</span>
                    <span className="text-xs text-[var(--muted-foreground)]">{count} candles</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {selectedDate && dayCandles && (
            <div className="mt-4 border border-[var(--border)] rounded-xl overflow-hidden">
              <div className="px-4 py-2.5 border-b border-[var(--border)] flex items-center justify-between">
                <span className="text-xs font-medium text-[var(--muted-foreground)]">
                  {selectedDate} · 1분봉
                </span>
                <span className="text-xs text-[var(--muted-foreground)]">{dayCandles.length} candles</span>
              </div>
              <IntraChart candles={dayCandles} dark={dark} />
            </div>
          )}
        </section>

        {/* ── 최신 기사 현황 ── */}
        <section>
          <h2 className="flex items-center gap-2 text-sm font-semibold mb-4">
            <Newspaper size={14} className="text-[var(--muted-foreground)]" />
            최신 기사 현황
          </h2>
          {articleStats ? (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {(
                [
                  { label: '전체', value: articleStats.total },
                  { label: 'Tesla', value: articleStats.tesla },
                  { label: 'SpaceX', value: articleStats.spacex },
                  { label: 'xAI', value: articleStats.xai },
                ] as const
              ).map(({ label, value }) => (
                <div key={label} className="border border-[var(--border)] rounded-xl p-4 text-center">
                  <div className="text-2xl font-bold">{value}</div>
                  <div className="text-xs text-[var(--muted-foreground)] mt-1">{label}</div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-[var(--muted-foreground)]">기사 데이터를 불러올 수 없습니다.</p>
          )}
        </section>

        {/* ── 기사 데이터 관리 ── */}
        <section>
          <div className="flex items-center justify-between mb-4">
            <h2 className="flex items-center gap-2 text-sm font-semibold">
              <Trash2 size={14} className="text-[var(--muted-foreground)]" />
              기사 데이터 관리
              {articleDates.length > 0 && (
                <span className="text-[var(--muted-foreground)] font-normal">{articleDates.length}개 파일</span>
              )}
            </h2>
            <button
              type="button"
              onClick={() => void fetchArticleDates()}
              className="p-1.5 rounded-md text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--accent)] transition-colors"
              title="새로고침"
            >
              <RefreshCw size={13} />
            </button>
          </div>

          <div className="border border-[var(--border)] rounded-xl p-4 space-y-3">
            {articleDates.length > 0 ? (
              <div className="border border-[var(--border)] rounded-lg overflow-hidden">
                <div className="max-h-48 overflow-y-auto divide-y divide-[var(--border)]">
                  {articleDates.map((date, i) => {
                    const willDelete = i >= cleanupKeepDays
                    return (
                      <div
                        key={date}
                        className={`flex items-center justify-between px-3 py-2 text-xs ${willDelete ? 'bg-red-500/5' : ''}`}
                      >
                        <span className={`font-mono ${willDelete ? 'text-red-400' : 'text-[var(--foreground)]'}`}>{date}</span>
                        <span className={`text-[0.65rem] px-1.5 py-0.5 rounded ${willDelete ? 'bg-red-500/10 text-red-400' : 'bg-green-500/10 text-green-500'}`}>
                          {willDelete ? '삭제 예정' : '유지'}
                        </span>
                      </div>
                    )
                  })}
                </div>
              </div>
            ) : (
              <p className="text-xs text-[var(--muted-foreground)]">기사 파일이 없습니다.</p>
            )}

            <div className="flex items-center gap-2">
              <span className="text-xs text-[var(--muted-foreground)] whitespace-nowrap">최근</span>
              <input
                type="number"
                min={1}
                max={articleDates.length || 1}
                value={cleanupKeepDays}
                onChange={(e) => {
                  setCleanupKeepDays(Math.max(1, parseInt(e.target.value) || 1))
                  setCleanupResult(null)
                }}
                className="w-16 text-xs bg-[var(--muted)] border border-[var(--border)] rounded-lg px-2 py-1.5 text-[var(--foreground)] focus:outline-none text-center"
              />
              <span className="text-xs text-[var(--muted-foreground)] whitespace-nowrap">
                일 유지 · {Math.max(0, articleDates.length - cleanupKeepDays)}개 삭제 예정
              </span>
            </div>

            {cleanupResult && (
              <p className="text-xs text-green-500">
                {cleanupResult.deleted.length}개 삭제 완료, {cleanupResult.kept.length}개 유지됨
              </p>
            )}

            <button
              type="button"
              onClick={() => void runArticleCleanup()}
              disabled={cleanupLoading || articleDates.length <= cleanupKeepDays}
              className="flex items-center justify-center gap-2 w-full px-3 py-2 rounded-lg text-sm font-medium bg-red-500 text-white hover:bg-red-600 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {cleanupLoading ? (
                <span className="w-3 h-3 rounded-full border-2 border-current border-t-transparent animate-spin" />
              ) : (
                <Trash2 size={13} />
              )}
              {cleanupLoading
                ? '삭제 중...'
                : `오래된 기사 ${Math.max(0, articleDates.length - cleanupKeepDays)}개 삭제`}
            </button>
          </div>
        </section>

      </main>
    </div>
  )
}
