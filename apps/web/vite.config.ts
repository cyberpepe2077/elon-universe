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
          {
            urlPattern: /\/data\/articles\.json$/,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'articles-cache',
              expiration: { maxAgeSeconds: 60 * 60 * 6 }, // 6시간
            },
          },
          {
            urlPattern: /\/data\/stock\//,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'stock-cache',
              expiration: { maxAgeSeconds: 60 * 60 * 24 }, // 24시간
            },
          },
          {
            urlPattern: /\/data\/market\//,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'market-cache',
              expiration: { maxAgeSeconds: 60 * 60 * 6 }, // 6시간
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
