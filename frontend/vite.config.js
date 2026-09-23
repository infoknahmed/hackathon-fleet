import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico'],
      manifest: {
        name: 'VaakSetu — Bridge of Voice',
        short_name: 'VaakSetu',
        description: 'AAC platform for non-verbal users',
        theme_color: '#0A1929',
        background_color: '#0A1929',
        display: 'standalone',
        start_url: '/',
        icons: [
          { src: '/icon-192.svg', sizes: '192x192', type: 'image/svg+xml', purpose: 'any' },
          { src: '/icon-512.svg', sizes: '512x512', type: 'image/svg+xml', purpose: 'any' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2,json,bin,task,wasm}'],
        maximumFileSizeToCacheInBytes: 8000000,
        runtimeCaching: [
          {
            // API: network-first with cache fallback for offline history.
            urlPattern: /\/api\/.*/i,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'vaaksetu-api',
              networkTimeoutSeconds: 5,
              expiration: { maxEntries: 100, maxAgeSeconds: 86400 * 7 },
            },
          },
          {
            // MediaPipe WASM + model assets (CDN) — cache-first, they never change.
            urlPattern: /mediapipe|cdn\.jsdelivr\.net|storage\.googleapis\.com/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'vaaksetu-vision-models',
              expiration: { maxEntries: 30, maxAgeSeconds: 86400 * 30 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
  ],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true
      }
    }
  }
})
