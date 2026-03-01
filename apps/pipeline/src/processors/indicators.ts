export interface OHLCVPoint {
  date: string
  open: number
  high: number
  low: number
  close: number
  volume: number
}

export interface IndicatorPoint extends OHLCVPoint {
  sma5: number | null
  sma20: number | null
  sma50: number | null
  sma200: number | null
  ema12: number | null
  ema26: number | null
  rsi14: number | null
  macd: number | null
  macdSignal: number | null
  macdHistogram: number | null
  bbUpper: number | null
  bbMiddle: number | null
  bbLower: number | null
  obv: number
  atr14: number | null
}

function round2(v: number): number {
  return Math.round(v * 100) / 100
}

function smaAt(closes: number[], period: number, idx: number): number | null {
  if (idx < period - 1) return null
  let sum = 0
  for (let i = idx - period + 1; i <= idx; i++) sum += closes[i]
  return round2(sum / period)
}

function calcEMAAll(values: number[], period: number): (number | null)[] {
  const result: (number | null)[] = new Array(values.length).fill(null)
  if (values.length < period) return result

  let ema = values.slice(0, period).reduce((a, b) => a + b, 0) / period
  result[period - 1] = round2(ema)

  const k = 2 / (period + 1)
  for (let i = period; i < values.length; i++) {
    ema = values[i] * k + ema * (1 - k)
    result[i] = round2(ema)
  }
  return result
}

// Wilder smoothing RSI (표준 방식)
function calcRSIAll(closes: number[], period: number): (number | null)[] {
  const result: (number | null)[] = new Array(closes.length).fill(null)
  if (closes.length < period + 1) return result

  let avgGain = 0
  let avgLoss = 0
  for (let i = 1; i <= period; i++) {
    const diff = closes[i] - closes[i - 1]
    if (diff > 0) avgGain += diff
    else avgLoss += -diff
  }
  avgGain /= period
  avgLoss /= period
  result[period] = avgLoss === 0 ? 100 : round2(100 - 100 / (1 + avgGain / avgLoss))

  for (let i = period + 1; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1]
    const gain = diff > 0 ? diff : 0
    const loss = diff < 0 ? -diff : 0
    avgGain = (avgGain * (period - 1) + gain) / period
    avgLoss = (avgLoss * (period - 1) + loss) / period
    result[i] = avgLoss === 0 ? 100 : round2(100 - 100 / (1 + avgGain / avgLoss))
  }
  return result
}

function calcBBAll(
  closes: number[],
  period: number,
  stdMult: number,
): { upper: number | null; middle: number | null; lower: number | null }[] {
  return closes.map((_, idx) => {
    if (idx < period - 1) return { upper: null, middle: null, lower: null }
    const slice = closes.slice(idx - period + 1, idx + 1)
    const mean = slice.reduce((a, b) => a + b, 0) / period
    const variance = slice.reduce((a, b) => a + (b - mean) ** 2, 0) / period
    const std = Math.sqrt(variance)
    return {
      upper: round2(mean + stdMult * std),
      middle: round2(mean),
      lower: round2(mean - stdMult * std),
    }
  })
}

function calcOBV(closes: number[], volumes: number[]): number[] {
  const result: number[] = [0]
  for (let i = 1; i < closes.length; i++) {
    if (closes[i] > closes[i - 1]) result.push(result[i - 1] + volumes[i])
    else if (closes[i] < closes[i - 1]) result.push(result[i - 1] - volumes[i])
    else result.push(result[i - 1])
  }
  return result
}

function calcATRAll(
  highs: number[],
  lows: number[],
  closes: number[],
  period: number,
): (number | null)[] {
  const result: (number | null)[] = new Array(closes.length).fill(null)
  const tr: number[] = []

  for (let i = 0; i < closes.length; i++) {
    if (i === 0) {
      tr.push(highs[i] - lows[i])
    } else {
      tr.push(
        Math.max(
          highs[i] - lows[i],
          Math.abs(highs[i] - closes[i - 1]),
          Math.abs(lows[i] - closes[i - 1]),
        ),
      )
    }
  }

  if (tr.length < period) return result

  let atr = tr.slice(0, period).reduce((a, b) => a + b, 0) / period
  result[period - 1] = round2(atr)
  for (let i = period; i < tr.length; i++) {
    atr = (atr * (period - 1) + tr[i]) / period
    result[i] = round2(atr)
  }
  return result
}

export function calcIndicators(points: OHLCVPoint[]): IndicatorPoint[] {
  const closes = points.map((p) => p.close)
  const highs = points.map((p) => p.high)
  const lows = points.map((p) => p.low)
  const volumes = points.map((p) => p.volume)

  const ema12All = calcEMAAll(closes, 12)
  const ema26All = calcEMAAll(closes, 26)
  const rsi14All = calcRSIAll(closes, 14)
  const bbAll = calcBBAll(closes, 20, 2)
  const obvAll = calcOBV(closes, volumes)
  const atr14All = calcATRAll(highs, lows, closes, 14)

  // MACD line = EMA12 - EMA26
  const macdLine: (number | null)[] = ema12All.map((e12, i) => {
    const e26 = ema26All[i]
    if (e12 === null || e26 === null) return null
    return round2(e12 - e26)
  })

  // Signal = EMA9 of MACD line (유효값만 따로 추출해서 계산)
  const macdSignalAll: (number | null)[] = new Array(macdLine.length).fill(null)
  const firstMacdIdx = macdLine.findIndex((v) => v !== null)
  if (firstMacdIdx >= 0) {
    const validMacd = macdLine.slice(firstMacdIdx) as number[]
    const ema9 = calcEMAAll(validMacd, 9)
    ema9.forEach((v, i) => {
      macdSignalAll[firstMacdIdx + i] = v
    })
  }

  return points.map((p, idx) => {
    const macdVal = macdLine[idx]
    const signalVal = macdSignalAll[idx]
    const bb = bbAll[idx]

    return {
      ...p,
      sma5: smaAt(closes, 5, idx),
      sma20: smaAt(closes, 20, idx),
      sma50: smaAt(closes, 50, idx),
      sma200: smaAt(closes, 200, idx),
      ema12: ema12All[idx],
      ema26: ema26All[idx],
      rsi14: rsi14All[idx],
      macd: macdVal,
      macdSignal: signalVal,
      macdHistogram:
        macdVal !== null && signalVal !== null ? round2(macdVal - signalVal) : null,
      bbUpper: bb.upper,
      bbMiddle: bb.middle,
      bbLower: bb.lower,
      obv: obvAll[idx],
      atr14: atr14All[idx],
    }
  })
}
