# Elon Universe

Tesla/SpaceX/xAI 뉴스 집계 + 주식/옵션 데이터 플랫폼. pnpm 모노레포.

각 앱의 상세 내용은 해당 폴더의 `CLAUDE.md` 참고.

## 앱 구조

| 앱 | 경로 | 역할 | 포트 |
|----|------|------|------|
| `pipeline` | `apps/pipeline` | 뉴스/주식/옵션 수집 ETL | — |
| `api` | `apps/api` | Hono REST 서버 | 3000 |
| `web` | `apps/web` | React 사용자 앱 | 5173 |
| `admin` | `apps/admin` | React 어드민 앱 | Vite 기본 |

## 루트 스크립트

```bash
pnpm dev       # API + Web + Admin 동시 시작
pnpm web       # API + Web
pnpm admin     # API + Admin
pnpm pipeline  # 뉴스 파이프라인 1회 실행
pnpm api       # API 서버만
```

## 데이터 흐름

```
pipeline (수집/처리) → output/ JSON 파일
                              ↓
                    api (파일 읽어서 서빙)
                              ↓
                    web/admin (API 또는 정적 파일 소비)
```

**Web 앱은 정적 배포** — `public/data/`의 JSON 직접 읽음 (API 서버 불필요).
**Admin 앱**은 API 서버를 통해 pipeline 스크립트를 원격 실행.

## 정적 배포 워크플로 (GitHub Pages)

```bash
# 1. 어드민에서 데이터 수집 후
pnpm --filter pipeline run export:static   # web/public/data/ 생성

# 2. 커밋 & 푸시
git add apps/web/public/data/
git push   # → GitHub Actions → GitHub Pages 자동 배포
```

## 환경변수

| 변수 | 사용처 |
|------|--------|
| `GEMINI_API_KEY` | pipeline AI 번역/요약 |
| `POLYGON_API_KEY` | pipeline 주가 백필 |
