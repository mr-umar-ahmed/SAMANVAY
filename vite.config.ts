import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'icons/apple-touch-icon.png', 'media/train-poster.jpg'],
      manifest: {
        name: 'SAMANVAY — Integrated Block Planning',
        short_name: 'SAMANVAY',
        description:
          'AI-powered automatic block planning for Indian Railways (SIH 2026, PS 26027). Integrates TMS, SMMS, TDMS, COA and FOIS to plan weekly, monthly and 26-week maintenance blocks.',
        theme_color: '#FFFFFF',
        background_color: '#FFFFFF',
        display: 'standalone',
        start_url: '/',
        scope: '/',
        lang: 'en-IN',
        categories: ['productivity', 'utilities', 'travel'],
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
        shortcuts: [
          { name: 'Citizen advisories', short_name: 'Advisories', url: '/citizen', icons: [{ src: 'icons/icon-192.png', sizes: '192x192' }] },
          { name: 'Report a hazard', short_name: 'Report', url: '/citizen/report', icons: [{ src: 'icons/icon-192.png', sizes: '192x192' }] },
          { name: 'Field possession card', short_name: 'Field', url: '/app/field', icons: [{ src: 'icons/icon-192.png', sizes: '192x192' }] },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        // the preloader video is streamed, never precached
        globIgnores: ['**/media/*.mp4', '**/media/*.webm'],
        maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
        navigateFallback: '/index.html',
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/fonts\.(googleapis|gstatic)\.com\/.*/i,
            handler: 'CacheFirst',
            options: { cacheName: 'google-fonts', expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 365 } },
          },
          {
            urlPattern: /^https:\/\/[abc]\.tile\.openstreetmap\.org\/.*/i,
            handler: 'CacheFirst',
            options: { cacheName: 'osm-tiles', expiration: { maxEntries: 400, maxAgeSeconds: 60 * 60 * 24 * 30 } },
          },
        ],
      },
      devOptions: { enabled: false },
    }),
  ],
  worker: { format: 'es' },
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 1200,
  },
  server: { port: 5173, strictPort: false },
});
