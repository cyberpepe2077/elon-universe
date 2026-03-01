import './load-env.js'
import { computeDailyIndicators } from './processors/daily-indicators.js'

const symbol = process.argv[2] ?? 'TSLA'

console.log(`[지표 계산] ${symbol} 일봉 기술적 지표 계산 중...`)

const result = await computeDailyIndicators(symbol)
console.log(`[지표 계산] 완료: ${result.series.length}일 데이터`)

const last = result.series[result.series.length - 1]
if (last) {
  console.log(`\n최신 날짜: ${last.date}`)
  console.log(`  종가:     $${last.close}`)
  console.log(`  RSI14:    ${last.rsi14 ?? '-'}`)
  console.log(`  MACD:     ${last.macd ?? '-'} / Signal: ${last.macdSignal ?? '-'} / Hist: ${last.macdHistogram ?? '-'}`)
  console.log(`  BB:       ${last.bbLower ?? '-'} ~ ${last.bbUpper ?? '-'} (mid: ${last.bbMiddle ?? '-'})`)
  console.log(`  SMA5/20:  ${last.sma5 ?? '-'} / ${last.sma20 ?? '-'}`)
  console.log(`  ATR14:    ${last.atr14 ?? '-'}`)
  console.log(`  OBV:      ${last.obv.toLocaleString()}`)
}
