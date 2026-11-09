import { fileURLToPath } from 'url'
import path from 'path'
import fs from 'fs'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// Build-time version stamp. Injected into the bundle AND written to
// /version.json on disk so the live SPA can poll it and detect when a
// new build has been deployed (→ show "new version available" banner).
const BUILD_VERSION = process.env.BUILD_VERSION
  || process.env.GITHUB_SHA
  || Date.now().toString(36);

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// Tiny plugin: write /public/version.json so the dist contains a
// predictable endpoint the live SPA can poll for the latest build id.
const writeVersionJson = () => ({
  name: 'rbm-write-version-json',
  apply: 'build',
  closeBundle() {
    try {
      const outFile = path.resolve(__dirname, 'dist/version.json');
      fs.writeFileSync(outFile, JSON.stringify({ version: BUILD_VERSION, builtAt: new Date().toISOString() }));
    } catch { /* non-fatal */ }
  },
});

// Sub-path deployment (D-20261110-01): `/` standalone, `/staff/planning/`
// embedded in the CBP. Must end with `/`.
const BASE = process.env.VITE_BASE_PATH || '/';
if (!BASE.startsWith('/') || !BASE.endsWith('/')) {
  throw new Error(`VITE_BASE_PATH must start and end with "/", got "${BASE}"`);
}
const stripBase = (p) => (BASE === '/' ? p : p.replace(BASE.slice(0, -1), ''));

const apiProxy = {
  target: process.env.VITE_API_PROXY_TARGET || 'http://localhost:4000',
  changeOrigin: true,
  rewrite: stripBase,
};
const syncProxy = {
  target: process.env.VITE_SYNC_PROXY_TARGET || 'http://localhost:3006',
  changeOrigin: true,
  rewrite: (p) => stripBase(p).replace(/^\/sync/, ''),
};

export default defineConfig({
  base: BASE,
  define: {
    __APP_VERSION__: JSON.stringify(BUILD_VERSION),
  },
  plugins: [react(), tailwindcss(), writeVersionJson()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    host: '0.0.0.0',
    port: 5000,
    allowedHosts: true,
    proxy: {
      // Default target is the local api-server on :4000. It can be overridden
      // with VITE_API_PROXY_TARGET so this app can run alongside other Africa
      // CDC apps that also default to :4000 (e.g. on a shared dev box) without
      // editing this file. Production routing is handled by nginx, not here.
      '/api': apiProxy,
      ...(BASE !== '/' && { [`${BASE}api`]: apiProxy }),
      // sync-service (CBP staff import) — nginx serves /sync/ in staging;
      // this mirrors it for local dev (sync-service on :3006, which mounts
      // its routes at the root, hence the prefix rewrite).
      '/sync': syncProxy,
      ...(BASE !== '/' && { [`${BASE}sync`]: syncProxy }),
    },
  },
  build: {
    // Page-level lazy loading already drops the main chunk well below 700 KB.
    // We bump the warning ceiling because the icon vendor chunk (lucide-react)
    // is intentionally larger and is still small after gzip.
    chunkSizeWarningLimit: 700,
    rollupOptions: {
      output: {
        // Manual vendor split — keeps the main chunk lean by isolating large
        // third-party libraries into long-cacheable vendor bundles. The order
        // of the conditions matters: the first match wins.
        // eslint-disable-next-line complexity -- deliberate vendor split ladder; refactor to a map would obscure intent.
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined;

          // React core — almost every page imports it, so it must be its own
          // long-lived chunk for optimal caching.
          if (
            id.includes('node_modules/react/') ||
            id.includes('node_modules/react-dom/') ||
            id.includes('node_modules/react-router-dom/') ||
            id.includes('node_modules/react-router/') ||
            id.includes('node_modules/scheduler/')
          ) {
            return 'react-vendor';
          }

          // lucide-react ships ~1500 SVG icon components — by far the heaviest
          // dep. Isolating it means the rest of the app doesn't get penalised.
          if (id.includes('node_modules/lucide-react/')) {
            return 'icons';
          }

          // Radix UI primitives (popover, dialog, dropdown, etc.) ship a lot
          // of small files that compress well together.
          if (id.includes('node_modules/@radix-ui/')) {
            return 'ui-vendor';
          }

          // Date utilities — date-fns + react-day-picker form a coherent unit.
          if (
            id.includes('node_modules/date-fns/') ||
            id.includes('node_modules/react-day-picker/')
          ) {
            return 'date-vendor';
          }

          // Auth / HTTP client utilities.
          if (
            id.includes('node_modules/axios/') ||
            id.includes('node_modules/jwt-decode/')
          ) {
            return 'http-vendor';
          }

          // Toast / styling helpers — small but used everywhere.
          if (
            id.includes('node_modules/sonner/') ||
            id.includes('node_modules/clsx/') ||
            id.includes('node_modules/tailwind-merge/') ||
            id.includes('node_modules/class-variance-authority/')
          ) {
            return 'style-vendor';
          }

          // Everything else: return undefined so Rollup uses its default
          // chunking strategy. Hoisting the long tail of small deps into a
          // single "vendor" bucket creates circular chunk warnings because
          // some of those modules re-import react/scheduler which we already
          // hoisted into react-vendor.
          return undefined;
        },
      },
    },
  },
})
