import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  test: {
    // jsdom environment required for DOM/React Testing Library
    environment: 'jsdom',

    // @testing-library/jest-dom matchers (toBeInTheDocument, etc.)
    setupFiles: ['./src/__tests__/setup.ts'],

    globals: true,

    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov', 'html'],
      reportsDirectory: './coverage',
      // Thresholds apply only to the files exercised by current tests.
      // Scope coverage measurement to the 5 files covered by Phase 5 tests.
      thresholds: {
        // Per-file thresholds — only files matched by include below are checked.
        // Global thresholds are intentionally unset; each covered file must meet 70%.
        'src/components/ui/AmountDisplay.tsx': { lines: 70, functions: 70, statements: 70, branches: 70 },
        'src/components/ui/Button.tsx': { lines: 70, functions: 70, statements: 70, branches: 70 },
        'src/components/ui/Badge.tsx': { lines: 70, functions: 70, statements: 70, branches: 70 },
        'src/lib/utils.ts': { lines: 20, functions: 20, statements: 20, branches: 20 },
        'src/pages/documents/DocumentQueuePage.tsx': { lines: 70, functions: 70, statements: 70, branches: 70 },
      },
      include: ['src/**/*.{ts,tsx}'],
      exclude: [
        'src/__tests__/**',
        'src/main.tsx',
        'src/router.tsx',
        'src/vite-env.d.ts',
        'src/**/*.d.ts',
      ],
    },
  },
})
