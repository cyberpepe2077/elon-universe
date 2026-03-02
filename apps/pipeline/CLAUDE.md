# Pipeline — ETL 파이프라인

뉴스/주식/옵션 데이터를 수집·처리해서 JSON 파일로 저장하는 앱.

## 실행 스크립트

```bash
pnpm start                          # 메인 파이프라인 (뉴스 수집+스크래핑+AI 번역)
pnpm run collect:stock              # TSLA 1분봉 수집 (+ 지표 자동 재계산)
pnpm run collect:earnings           # SEC 실적 수집
pnpm run collect:options            # Yahoo Finance 옵션 체인 수집
pnpm run compute:indicators         # 기술 지표 계산 (인수: [SYMBOL])
pnpm run export:static              # web/public/data/ 정적 파일 생성
pnpm run backfill:stock             # Polygon API로 과거 데이터 백필
pnpm run aggregate:stock            # 1분봉 → 5m/15m/30m/1h 집계
```

## 환경변수

```
GEMINI_API_KEY   # AI 번역/요약에 필요 (없으면 AI 단계 스킵)
POLYGON_API_KEY  # 백필(backfill:stock)에만 사용
```

## 메인 파이프라인 흐름 (`src/index.ts`)

```
[1/4] 뉴스 수집 (RSS + Reddit + SEC)
[2/4] 정제 (중복 제거 + 최근 7일 필터)
[3/4] 본문 스크래핑 (@mozilla/readability + jsdom)
[4/4] AI 번역/요약 (Gemini 1.5 Flash — GEMINI_API_KEY 없으면 스킵)
→ output/YYYY-MM-DD.json 저장
```

## 디렉토리 구조

```
src/
├── index.ts                  # 메인 파이프라인 엔트리
├── collect-stock.ts          # CLI: 주가 수집
├── collect-earnings.ts       # CLI: SEC 실적 수집
├── collect-options.ts        # CLI: 옵션 체인 수집
├── compute-indicators.ts     # CLI: 기술 지표 계산
├── export-static.ts          # CLI: 정적 파일 내보내기
├── backfill-stock.ts         # CLI: Polygon 백필
├── aggregate-stock.ts        # CLI: 캔들 집계
├── load-env.ts               # .env 로드
├── collectors/
│   ├── rss.ts                # RSS 피드 수집
│   ├── reddit.ts             # Reddit 수집
│   ├── sec.ts                # SEC EDGAR 수집
│   ├── stock.ts              # TSLA 1분봉 (Yahoo Finance)
│   ├── earnings.ts           # SEC EDGAR XBRL (분기 실적)
│   ├── options.ts            # Yahoo Finance v7 옵션 체인
│   └── stock-polygon.ts      # Polygon.io 백필용
├── processors/
│   ├── scraper.ts            # 전문 스크래핑 (동시 5개, 10초 타임아웃)
│   ├── summarizer.ts         # Gemini AI 한국어 번역/요약/중요도
│   ├── indicators.ts         # 순수 계산 함수 (RSI/MACD/BB/SMA/EMA/OBV/ATR)
│   ├── daily-indicators.ts   # 모든 날짜 파일 읽어 일봉 지표 계산+저장
│   └── stock-aggregator.ts   # 캔들 집계 처리
├── types/
│   └── index.ts              # RawArticle, ProcessedArticle, Category 타입
└── utils/
    └── dedup.ts              # 중복 제거, 날짜 필터
```

## 타입

```typescript
// src/types/index.ts
export type Category = "tesla" | "spacex" | "xai";

export interface RawArticle {
  id: string; title: string; content: string;
  contentFull?: string; url: string; source: string;
  category: Category; publishedAt: Date;
  titleKo?: string; summaryKo?: string;
  importance?: "high" | "medium" | "low";
}

// ProcessedArticle — AI 필드가 Required
export type ProcessedArticle = RawArticle &
  Required<Pick<RawArticle, "titleKo" | "summaryKo" | "importance">>;
```

## 데이터 저장 경로

```
output/
├── YYYY-MM-DD.json              # 날짜별 뉴스 (ProcessedArticle[])
└── stock/TSLA/
    ├── YYYY-MM-DD.json          # 날짜별 1분봉 { candles: Candle[] }
    ├── YYYY-MM-DD_agg.json      # 5m/15m/30m/1h 집계
    ├── earnings.json            # 분기 실적 (EPS/Revenue/NetIncome)
    ├── indicators.json          # 일봉 기술 지표
    └── options.json             # 옵션 체인 + Max Pain
```

## 주요 특성

- **주가 수집** (`stock.ts`): 최근 7거래일 스캔, 없는 날만 저장 (idempotent). 저장 후 `compute:indicators` 자동 트리거. ET(America/New_York) 기준 날짜 분할.
- **스크래핑** (`scraper.ts`): Reddit URL 스킵, 실패 시 graceful fallback (빈 contentFull).
- **AI 요약** (`summarizer.ts`): Gemini 1.5 Flash, 동시 3개 처리. `GEMINI_API_KEY` 없으면 title/content로 fallback.
- **실적** (`earnings.ts`): SEC Q4 frame 없음 — `CY{year}Q1/Q2/Q3`만 존재.
- **옵션** (`options.ts`): 향후 6개 만기, 500ms 딜레이 (rate limit 대응).
- **MACD**: 26+9=35일 데이터 필요 — 초기에는 값 없음.
