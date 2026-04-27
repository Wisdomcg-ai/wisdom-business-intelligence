import { defineConfig } from 'vitest/config'
import path from 'path'

export default defineConfig({
  // Override the project tsconfig's `jsx: "preserve"` for the vitest build
  // pipeline. preserve leaves JSX literals in the output, which the SSR
  // module-runner transform (called by vitest) then fails to parse.
  // For tests we transpile JSX to React.createElement calls via the classic
  // runtime — this matches what Next.js does at runtime and avoids needing
  // an extra @vitejs/plugin-react dependency.
  oxc: {
    jsx: {
      runtime: 'automatic',
    },
  },
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
