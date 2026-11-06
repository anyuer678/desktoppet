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
        // 2026-11 measured after backup IPC tests: statements 59.33%, lines 60.95%, functions 44.79%.
        // Keep a small buffer below measured values to avoid CI noise across Node versions.
        lines: 60,
        functions: 44,
        statements: 58
      }
    }
  }
})
