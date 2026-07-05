import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'

import { reticle } from '@reticlehq/core/vite';
// Dev: proxy all /api/* to the YARP API gateway (:6060 locally — macOS AirPlay holds :5000).
// Gateway routes by path prefix → Platform (:5201), Finance (:5202), Assist (:5203).
const GATEWAY_URL = process.env.VITE_GATEWAY_URL ?? 'http://localhost:6060'

export default defineConfig(() => {
  return {
    plugins: [reticle(), // port omitted → connects to the Reticle daemon on its default :4400
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
      strictPort: true,
      proxy: {
        '/api': {
          target: GATEWAY_URL,
          changeOrigin: true,
          ws: true,
          rewrite: (p) => p.replace(/^\/api/, ''),
        },
      },
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
