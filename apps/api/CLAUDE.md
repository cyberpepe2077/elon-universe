# API — Hono REST 서버

pipeline이 생성한 JSON 파일을 읽어서 서빙 + 어드민 제어 엔드포인트 제공.

## 실행

```bash
pnpm dev    # tsx watch src/index.ts (port 3000)
pnpm start  # tsx src/index.ts
```

## 구조

단일 파일: `src/index.ts`

## 파일 경로 기준

```typescript
const OUTPUT_DIR = join(__dirname, "../../pipeline/output");      // 뉴스 JSON
const STOCK_DIR  = join(__dirname, "../../pipeline/output/stock"); // 주식 데이터
const REPO_ROOT  = join(__dirname, "../../..");                    // monorepo 루트
```

## 엔드포인트

### 뉴스
```
GET  /api/articles?category=tesla|spacex|xai   # 최신 날짜 파일 서빙
GET  /api/articles/dates                        # 저장된 날짜 목록
```

### 주식
```
GET  /api/stock/:symbol                          # Yahoo Finance 실시간 프록시 (range, interval 쿼리)
GET  /api/stock/:symbol/dates                    # 저장된 1분봉 날짜 목록 (count 포함)
GET  /api/stock/:symbol/candles?date=YYYY-MM-DD  # 특정 날짜 1분봉
GET  /api/stock/:symbol/candles/all              # 전체 1분봉 연결
GET  /api/stock/:symbol/agg?date=YYYY-MM-DD      # 5m/15m/30m/1h 집계
GET  /api/stock/:symbol/indicators               # 일봉 기술 지표 (indicators.json)
GET  /api/stock/:symbol/earnings                 # 분기 실적 (earnings.json)
GET  /api/stock/:symbol/options                  # 옵션 체인 (options.json)
```

### 어드민
```
GET  /api/admin/config                  # Polygon API 키 설정 여부
GET  /api/admin/status                  # 각 작업 실행 상태 + 최근 로그
POST /api/admin/run/pipeline            # 뉴스 파이프라인 실행
POST /api/admin/run/stock               # 주가 수집
POST /api/admin/run/backfill            # Polygon 백필 { from, to: "YYYY-MM-DD" }
POST /api/admin/run/indicators          # 기술 지표 계산
POST /api/admin/run/earnings            # 실적 수집
POST /api/admin/run/options             # 옵션 체인 수집
POST /api/admin/run/export              # 정적 파일 내보내기
POST /api/admin/cleanup/articles        # 오래된 뉴스 파일 정리 { keepDays?: number }
```

## 어드민 실행 패턴

- 작업 상태는 in-memory (`running` flag + `log[]` 배열, max 300줄)
- `spawn()` 으로 pipeline 스크립트를 서브프로세스 실행
- 성공 시 자동으로 `export:static` 트리거 (`triggerExport()`)
- 동시 실행 방지: 같은 작업이 실행 중이면 409 반환

## CORS

`/api/*` 전체에 cors 미들웨어 적용.
