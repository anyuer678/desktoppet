import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts', 'src/**/*.d.ts'],
      thresholds: {
        // 2026-11 measured after statsRuntime tests:
        // statements 58.12%, lines 59.62%, functions 43.95%.
        // Keep a small buffer below measured values to avoid CI noise.
        lines: 59,
        functions: 43,
        statements: 57
      }
    }
  }
})
