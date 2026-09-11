import { execSync } from 'node:child_process'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// Stamped into the build and shown on the Data screen. Installed as a PWA, the app can keep
// running an older service worker for a while after a deploy, and with nothing on screen saying
// which build is loaded there is no way to tell that apart from a fix not working — which cost
// a round trip once already.
const buildStamp = () => {
  try {
    const sha = execSync('git rev-parse --short HEAD').toString().trim()
    const when = execSync('git log -1 --format=%cs').toString().trim()
    return `${when} · ${sha}`
  } catch {
    return 'dev'
  }
}

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

// GitHub Pages serves a project site from /<repo>/, so the build needs to know its subpath.
// Kept as an env var rather than hardcoded: `npm run dev` and any root-domain host still work
// unchanged, and moving to a custom domain later is one variable, not a code change.
const base = process.env.VITE_BASE || '/'

export default defineConfig({
  base,
  define: { __BUILD__: JSON.stringify(buildStamp()) },
  plugins: [
    slimCatalogue(),
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon-192.png', 'icon-512.png', 'apple-touch-icon.png'],
      manifest: {
        name: 'Baseline — Training, Sleep & Body',
        short_name: 'Baseline',
        description: 'Sleep, recovery, training, food and body composition in one place, with your Hevy log read in.',
        theme_color: '#0d1117',
        background_color: '#0d1117',
        display: 'standalone',
        orientation: 'portrait',
        id: base,
        scope: base,
        start_url: base,
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
