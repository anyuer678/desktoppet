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
        // 2026-11 measured: statements 56.02%, lines 57.46%, functions 42.03%.
        // Keep a small buffer below measured values to avoid CI noise.
        lines: 57,
        functions: 41,
        statements: 55
      }
    }
  }
})
