import './load-env.js'
import { readdir } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { aggregateDay } from './processors/stock-aggregator.js'

const STOCK_DIR = join(dirname(fileURLToPath(import.meta.url)), '../output/stock/TSLA')

const files = await readdir(STOCK_DIR).catch(() => [] as string[])
const rawFiles = files.filter((f) => f.endsWith('.json') && !f.endsWith('_agg.json')).sort()

if (rawFiles.length === 0) {
  console.log('집계할 파일이 없습니다.')
  process.exit(0)
}

console.log(`${rawFiles.length}개 파일 집계 시작...`)
let done = 0

for (const f of rawFiles) {
  const filePath = join(STOCK_DIR, f)
  try {
    await aggregateDay(filePath)
    done++
    console.log(`[${done}/${rawFiles.length}] ${f} → ${f.replace('.json', '_agg.json')}`)
  } catch (e) {
    console.error(`[error] ${f}: ${String(e)}`)
  }
}

console.log(`\n완료: ${done}/${rawFiles.length}개 집계 저장`)
