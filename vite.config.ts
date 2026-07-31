import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      strategies: 'generateSW',
      registerType: 'prompt',
      injectRegister: null,
      includeAssets: [
        'icon.svg',
        'apple-touch-icon.png',
        'pwa-192x192.png',
        'pwa-512x512.png',
        'pwa-maskable-512x512.png',
      ],
      manifest: {
        id: '/',
        name: 'Absolute Sudoku',
        short_name: 'Sudoku',
        description:
          'Sudoku preciso, completo e offline para jogar por toda a vida.',
        lang: 'pt-BR',
        dir: 'ltr',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'any',
        background_color: '#f3f1eb',
        theme_color: '#f3f1eb',
        categories: ['games', 'entertainment'],
        prefer_related_applications: false,
        icons: [
          {
            src: '/pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: '/pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: '/pwa-maskable-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
        shortcuts: [
          {
            name: 'Continuar jogando',
            short_name: 'Continuar',
            description: 'Abrir a partida atual',
            url: '/?intent=resume',
          },
          {
            name: 'Desafio diário',
            short_name: 'Diário',
            description: 'Abrir o desafio de hoje',
            url: '/?intent=daily',
          },
        ],
      },
      workbox: {
        cleanupOutdatedCaches: true,
        clientsClaim: false,
        skipWaiting: false,
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api(?:\/|$)/],
        globPatterns: [
          '**/*.{html,js,css,svg,png,ico,woff,woff2,webmanifest}',
        ],
      },
      devOptions: {
        enabled: false,
      },
    }),
  ],
})
