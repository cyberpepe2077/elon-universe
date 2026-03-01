import './load-env.js'
import { backfillStockCandles } from './collectors/stock-polygon.js'

const args = process.argv.slice(2)
const fromArg = args.find((a) => a.startsWith('--from='))?.split('=')[1]
const toArg = args.find((a) => a.startsWith('--to='))?.split('=')[1]
const apiKey = process.env.POLYGON_API_KEY

if (!fromArg || !toArg) {
  console.error('Usage: backfill-stock.ts --from=YYYY-MM-DD --to=YYYY-MM-DD')
  process.exit(1)
}

if (!apiKey) {
  console.error('POLYGON_API_KEY 환경변수가 설정되지 않았습니다.')
  process.exit(1)
}

console.log(`백필 시작: ${fromArg} ~ ${toArg}`)

const result = await backfillStockCandles(fromArg, toArg, apiKey, (msg) => console.log(msg))

console.log(
  `완료 — saved: ${result.saved.length}, skipped: ${result.skipped.length}, errors: ${result.errors.length}`,
)
if (result.errors.length > 0) {
  console.error('오류 목록:', result.errors.join(', '))
  process.exit(1)
}
