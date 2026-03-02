# Admin — 어드민 앱

데이터 수집·내보내기를 제어하는 내부 관리 도구. React 19 + Tailwind 4 + Vite.

## 실행

```bash
pnpm dev    # Vite dev server
pnpm build  # 빌드
```

API 서버(port 3000)가 함께 실행되어야 함.

## 구조

단일 컴포넌트 파일: `src/App.tsx`

## 주요 기능

- **작업 제어**: 뉴스 수집 / 주가 수집 / 백필 / 지표 계산 / 실적 수집 / 옵션 수집 / 내보내기
- **실시간 로그**: 각 작업의 stdout/stderr 스트림 (폴링 방식)
- **인트라데이 캔들차트**: lightweight-charts v5로 날짜별 1분봉 확인
- **기사 통계**: 카테고리별 수집 건수

## API 연동

`/api/admin/*` 엔드포인트와 통신. API 서버(`apps/api`)가 실제 작업 실행.

```typescript
// 상태 폴링
GET  /api/admin/status          // → { pipeline, stock, backfill, indicators, earnings, options, export }
GET  /api/admin/config          // → { polygonKeyConfigured }

// 작업 트리거
POST /api/admin/run/pipeline
POST /api/admin/run/stock
POST /api/admin/run/backfill    // body: { from, to: "YYYY-MM-DD" }
POST /api/admin/run/indicators
POST /api/admin/run/earnings
POST /api/admin/run/options
POST /api/admin/run/export

// 정리
POST /api/admin/cleanup/articles  // body: { keepDays?: number }
```

## 특성

- 단일 SPA, 라우팅 없음
- 다크모드 기본값 (useTheme 훅 내부에서 dark=true 초기값)
- 성공한 작업 후 API가 자동으로 `export:static`을 트리거하므로, 어드민에서 별도 내보내기 버튼을 누를 필요는 없음 (수동 트리거도 가능)
