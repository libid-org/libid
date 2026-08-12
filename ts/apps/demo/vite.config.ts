import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'

/**
 * Cross-origin isolation + routing for the claim flows.
 *
 * - COOP/COEP on ALL responses (middleware, not `server.headers`: the
 *   latter misses rewritten/HTML requests): bb.js and the tlsn wasm use
 *   SharedArrayBuffer, which browsers gate behind cross-origin isolation.
 * - `**\/spawn.js` → /spawn.js: tlsn's wasm-pack loader spawns its worker
 *   helper relative to a hashed snippet URL; the rewrite pins it to the
 *   staged copy at the origin root.
 * - /zk/x-popup and /auth/gmail/callback → /relay.html: both provider
 *   callbacks land on the same relay page (the jobId in `state` routes the
 *   payload; see @libid/claim's relay module).
 *
 * CSP note for production hosts (dev serves none): the provers need
 * `worker-src blob: 'self'`, `connect-src` must allow the notary
 * (ws://localhost:* ws://127.0.0.1:* wss: in dev) plus `data: blob:`, and
 * `script-src` must allow the staged same-origin wasm loaders.
 */
const here = dirname(fileURLToPath(import.meta.url))

function claimHarness(): Plugin {
  const rewrite = (url: string): string => {
    const path = url.split('?')[0]
    if (path !== '/spawn.js' && path.endsWith('/spawn.js')) return '/spawn.js'
    if (path === '/zk/x-popup' || path === '/auth/gmail/callback') {
      return '/relay.html'
    }
    return url
  }
  return {
    name: 'libid-claim-harness',
    configureServer(server) {
      server.middlewares.use((req, _res, next) => {
        if (req.url) req.url = rewrite(req.url)
        next()
      })
      server.middlewares.use((_req, res, next) => {
        res.setHeader('Cross-Origin-Opener-Policy', 'same-origin')
        res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp')
        next()
      })
    },
    configurePreviewServer(server) {
      server.middlewares.use((req, res, next) => {
        if (req.url) req.url = rewrite(req.url)
        res.setHeader('Cross-Origin-Opener-Policy', 'same-origin')
        res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp')
        next()
      })
    },
  }
}

export default defineConfig({
  plugins: [claimHarness(), react()],
  server: {
    port: 5173,
    strictPort: true,
  },
  optimizeDeps: {
    // bb.js and the noir packages ship wasm + workers that break under
    // esbuild pre-bundling; serve them as real modules.
    exclude: [
      '@aztec/bb.js',
      '@noir-lang/noir_js',
      '@noir-lang/acvm_js',
      '@noir-lang/noirc_abi',
      '@libid/claim',
    ],
  },
  worker: {
    // The claim provers are module workers (they import noir_js / bb.js).
    format: 'es',
  },
  build: {
    target: 'esnext',
    rollupOptions: {
      input: {
        main: resolve(here, 'index.html'),
        relay: resolve(here, 'relay.html'),
      },
    },
  },
})
