import { collectOptions } from './collectors/options.js'

const symbol = process.argv[2] ?? 'TSLA'

console.log(`[옵션 수집] ${symbol} Yahoo Finance 옵션 체인 수집 중...`)

try {
  const result = await collectOptions(symbol)
  console.log(`\n[옵션 수집] 완료: ${result.expirations.length}개 만기`)
  console.log(`  기초자산 가격: $${result.underlyingPrice.toFixed(2)}`)
  console.log(`  Put/Call OI:   ${result.summary.putCallRatio.toFixed(2)}`)
  console.log(`  Max Pain:      $${result.summary.maxPain}`)
  console.log(`\n저장 위치: output/stock/${symbol}/options.json`)
} catch (e) {
  console.error(`오류: ${String(e)}`)
  process.exit(1)
}
