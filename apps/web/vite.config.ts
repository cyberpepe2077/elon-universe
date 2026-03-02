import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'
import path from 'path'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const base = process.env.VITE_BASE_PATH ?? env.VITE_BASE_PATH ?? '/'
  return {
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icons/icon.svg', 'icons/icon-maskable.svg'],
      manifest: {
        name: 'Elon Universe',
        short_name: 'ElonUniverse',
        description: 'Tesla / SpaceX / xAI 뉴스 · 주식 · 옵션 데이터 플랫폼',
        theme_color: '#0d0d1a',
        background_color: '#0d0d1a',
        display: 'standalone',
        orientation: 'portrait',
        scope: base,
        start_url: base,
        lang: 'ko',
        icons: [
          {
            src: 'icons/icon.svg',
            sizes: 'any',
            type: 'image/svg+xml',
            purpose: 'any',
          },
          {
            src: 'icons/icon-maskable.svg',
            sizes: 'any',
            type: 'image/svg+xml',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,woff2}'],
        runtimeCaching: [
          // 불변 데이터: 날짜별 1분봉 — 저장 후 절대 변경 없음 → 영구 캐시
          {
            urlPattern: /\/data\/stock\/[^/]+\/candles\/\d{4}-\d{2}-\d{2}\.json$/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'candles-immutable',
              // 만료 없음: 한 번 캐시하면 재다운로드 없음
            },
          },
          // 분기 실적: 분기에 한 번만 바뀜 → 30일 캐시
          {
            urlPattern: /\/data\/stock\/[^/]+\/earnings\.json$/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'earnings-cache',
              expiration: { maxAgeSeconds: 60 * 60 * 24 * 30 },
            },
          },
          // 기술 지표: 파이프라인 실행 시 갱신 → 24시간 캐시
          {
            urlPattern: /\/data\/stock\/[^/]+\/indicators\.json$/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'indicators-cache',
              expiration: { maxAgeSeconds: 60 * 60 * 24 },
            },
          },
          // 뉴스: 파이프라인 실행 시 갱신 → 6시간 캐시
          {
            urlPattern: /\/data\/articles\.json$/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'articles-cache',
              expiration: { maxAgeSeconds: 60 * 60 * 6 },
            },
          },
          // 옵션·기타 주식 데이터: 4시간 캐시
          {
            urlPattern: /\/data\/stock\//,
            handler: 'CacheFirst',
            options: {
              cacheName: 'stock-cache',
              expiration: { maxAgeSeconds: 60 * 60 * 4 },
            },
          },
          // 시장 지수: 4시간 캐시
          {
            urlPattern: /\/data\/market\//,
            handler: 'CacheFirst',
            options: {
              cacheName: 'market-cache',
              expiration: { maxAgeSeconds: 60 * 60 * 4 },
            },
          },
        ],
      },
      devOptions: {
        enabled: false,
      },
    }),
  ],
  base,
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5173,
  },
  }
})
