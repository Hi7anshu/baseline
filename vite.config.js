import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

/**
 * Ship only the catalogue fields this app reads.
 *
 * openGym's dataset carries step-by-step instructions and media filenames for all 1,324
 * exercises, which is most of its 888 KB. Nothing here renders them — the app needs the name,
 * body part, equipment and muscle fields to attribute a set. Stripping at build time keeps
 * `src/vendor/` byte-identical to upstream, so a future re-vendor is still a straight copy.
 */
function slimCatalogue() {
  const KEEP = ['id', 'n', 'bp', 'eq', 'tg', 'mg', 'sm']
  return {
    name: 'slim-exercise-catalogue',
    enforce: 'pre',
    transform(code, id) {
      if (!id.replace(/\\/g, '/').endsWith('vendor/lib/exercises-data.js')) return null
      const open = code.indexOf('[')
      const close = code.lastIndexOf(']')
      if (open < 0 || close < 0) return null
      const rows = JSON.parse(code.slice(open, close + 1)).map(ex => {
        const out = {}
        for (const k of KEEP) if (ex[k] !== undefined && ex[k] !== '' ) out[k] = ex[k]
        return out
      })
      return { code: `export const EXDB=${JSON.stringify(rows)}`, map: null }
    },
  }
}

export default defineConfig({
  base: '/',
  plugins: [
    slimCatalogue(),
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon-192.png', 'icon-512.png', 'apple-touch-icon.png'],
      manifest: {
        name: 'Fatigue — Hevy Analytics',
        short_name: 'Fatigue',
        description: 'Per-muscle fatigue and recovery analytics for your Hevy training log.',
        theme_color: '#0d1117',
        background_color: '#0d1117',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,png,svg,woff2}'],
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024
      }
    })
  ],
  build: { target: 'es2022', chunkSizeWarningLimit: 1200 }
})
