import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'

// Dev-only: map each API path prefix to its backend service's fixed host port.
// Ports are pinned in backend/AppHost/AppHost.cs (WithDevLoopDefaults httpPort).
// Each service mounts its routes under an absolute prefix (its GroupName), so the
// proxy strips the leading `/api` and forwards e.g. /api/gst/x -> :5104/gst/x.
// Routing through this proxy keeps requests same-origin (:3000), which sidesteps
// the macOS AirPlay process squatting on :5000 and avoids CORS entirely.
const SERVICE_PORTS: Record<string, number> = {
  auth: 5101,
  search: 5101,
  documents: 5102,
  accounting: 5103,
  gst: 5104,
  loans: 5105,
  itr: 5106,
  chat: 5107,
  notifications: 5108,
  reports: 5109,
  subscriptions: 5110,
  ai: 5111,
  callbacks: 5112,
}

const stripApiPrefix = (p: string): string => p.replace(/^\/api/, '')

const apiProxy = Object.fromEntries(
  Object.entries(SERVICE_PORTS).map(([prefix, port]) => [
    `/api/${prefix}`,
    {
      target: `http://localhost:${port}`,
      changeOrigin: true,
      ws: prefix === 'chat',
      rewrite: stripApiPrefix,
    },
  ]),
)

export default defineConfig(() => {
  return {
    plugins: [
      react(),
      tailwindcss(),
    ],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
    server: {
      port: 3000,
      proxy: apiProxy,
    },
    build: {
      rollupOptions: {
        output: {
          manualChunks: {
            vendor: ['react', 'react-dom'],
            router: ['react-router'],
            query: ['@tanstack/react-query'],
            table: ['@tanstack/react-table'],
            charts: ['recharts'],
            firebase: ['firebase/app', 'firebase/auth'],
          },
        },
      },
    },
  }
})
