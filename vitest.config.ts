import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  // @vitejs/plugin-react handles JSX transform for tests (origin/main pattern).
  // Phase 43 component tests use this — earlier oxc.jsx override is unnecessary.
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/__tests__/setup.ts'],
    include: [
      'src/__tests__/**/*.test.ts',
      'src/__tests__/**/*.test.tsx',
      'src/**/*.test.ts',
      'src/**/*.test.tsx',
    ],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})
