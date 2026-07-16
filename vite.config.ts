import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  base: '/goal-tracker/',
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'prompt',
      injectRegister: null,
      includeAssets: ['favicon.svg'],
      manifest: {
        name: 'Workout Goal Tracker',
        short_name: 'Workout Tracker',
        description: 'Track workouts with playlist-based sessions',
        theme_color: '#1e293b',
        background_color: '#0f172a',
        display: 'standalone',
        orientation: 'portrait',
        icons: [
          {
            src: 'favicon.svg',
            sizes: 'any',
            type: 'image/svg+xml',
            purpose: 'any maskable',
          },
        ],
      },
    }),
    {
      name: 'inject-build-version',
      transformIndexHtml() {
        const now = new Date()
        const pad = (n: number) => n.toString().padStart(2, '0')
        const ts = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}`
        return [
          {
            tag: 'meta',
            attrs: { name: 'build-version', content: ts },
            injectTo: 'head' as const,
          },
        ]
      },
    },
  ],
})
