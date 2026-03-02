# Web — 사용자 앱

React 19 + Tailwind 4 + Vite. GitHub Pages 정적 배포.

## 실행

```bash
pnpm dev      # Vite dev server (port 5173)
pnpm build    # 빌드
```

## 중요: 데이터 fetch 패턴

**API 서버 없이 정적 JSON 파일을 직접 읽음.**

```typescript
// 항상 이 패턴 사용
const res = await fetch(import.meta.env.BASE_URL + 'data/articles.json')

// BASE_URL은 vite.config.ts의 base 옵션에서 결정됨
// 개발: '/', 배포: '/elon-universe/' 등
```

정적 데이터 위치: `public/data/`

```
public/data/
├── articles.json
├── stock/TSLA/
│   ├── dates.json
│   ├── all-candles.json
│   ├── indicators.json
│   ├── earnings.json
│   ├── options.json
│   └── candles/YYYY-MM-DD.json
└── market/{SPY,QQQ,TSLA}/{1mo,3mo,6mo,1y}.json
```

## 라우팅

HashRouter 사용 (GitHub Pages 히스토리 API 미지원).

```
#/           → pages/Home.tsx      (랜딩: Aurora + BlurText + NumberTicker)
#/articles   → pages/Articles.tsx  (기사 목록 + 모달)
#/stock      → pages/Stock.tsx     (캔들차트 + 지표 + 옵션)
#/market     → pages/Market.tsx    (시장 지수)
```

## 디렉토리 구조

```
src/
├── App.tsx                      # HashRouter + lazy Routes
├── main.tsx
├── index.css                    # aurora keyframes 포함
├── pages/
│   ├── Home.tsx                 # Aurora + BlurText + NumberTicker 랜딩
│   ├── Articles.tsx             # 기사 목록 + 카테고리 필터
│   ├── Stock.tsx                # 주식 페이지 (차트/지표/옵션 탭)
│   └── Market.tsx               # 시장 지수 페이지
├── components/
│   ├── Layout.tsx               # 헤더(로고+네비+다크모드) + Outlet
│   ├── ArticleCard.tsx          # 기사 카드
│   ├── ArticleModal.tsx         # 기사 상세 모달 (titleKo/summaryKo/importance)
│   ├── StockChart.tsx           # lightweight-charts v5 캔들스틱
│   └── ui/
│       ├── aurora.tsx           # CSS blob 배경 (violet/blue/cyan)
│       ├── blur-text.tsx        # motion/react 단어별 블러 인트로
│       └── number-ticker.tsx    # rAF ease-out cubic 숫자 카운터
├── hooks/
│   └── useTheme.ts              # 다크모드 훅
├── lib/
│   └── utils.ts                 # cn() = clsx + tailwind-merge
└── types/
    └── article.ts               # Article, Category 타입 + BADGE/IMPORTANCE 상수
```

## 경로 alias

`@` → `src/` (절대 경로)

설정: `vite.config.ts` + `tsconfig.app.json`

## 주요 패키지

| 패키지 | 용도 |
|--------|------|
| `react-router-dom` | HashRouter 라우팅 |
| `lightweight-charts` v5 | 캔들스틱 차트 |
| `motion` | 애니메이션 (blur-text 등) |
| `lucide-react` | 아이콘 |
| `clsx` + `tailwind-merge` | cn() 유틸 |
| `tailwindcss` v4 | 스타일링 |

## 컴포넌트 작성 규칙

- Tailwind 클래스 사용, 인라인 스타일 지양
- 다크모드: `dark:` prefix (HTML에 `.dark` 클래스 토글)
- SVG 차트 (옵션 OI, IV 등)는 직접 구현 (lightweight-charts 불필요한 경우)
- fetch 실패 시 빈 상태(빈 배열/null) graceful fallback
