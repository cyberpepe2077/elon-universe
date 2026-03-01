import { collectEarnings } from './collectors/earnings.js'

const symbol = process.argv[2] ?? 'TSLA'

console.log(`[실적 수집] ${symbol} SEC EDGAR 분기 실적 수집 중...`)

try {
  const result = await collectEarnings(symbol)
  console.log(`[실적 수집] 완료: ${result.quarterly.length}분기 데이터`)
  const last = result.quarterly[result.quarterly.length - 1]
  if (last) {
    console.log(`\n최근 분기: ${last.date}`)
    console.log(`  EPS:     ${last.epsActual != null ? '$' + last.epsActual.toFixed(2) : '-'}`)
    console.log(`  매출:    ${last.revenue != null ? '$' + (last.revenue / 1e9).toFixed(2) + 'B' : '-'}`)
    console.log(`  순이익:  ${last.netIncome != null ? '$' + (last.netIncome / 1e9).toFixed(2) + 'B' : '-'}`)
  }
  console.log(`\n저장 위치: output/stock/${symbol}/earnings.json`)
} catch (e) {
  console.error(`오류: ${String(e)}`)
  process.exit(1)
}
