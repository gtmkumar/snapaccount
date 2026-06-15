import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'

// Dev: proxy all /api/* to the YARP API gateway (:5000).
// Gateway routes by path prefix → Platform (:5201), Finance (:5202), Assist (:5203).
const GATEWAY_URL = process.env.VITE_GATEWAY_URL ?? 'http://localhost:5000'

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
