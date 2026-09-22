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
        // Floor from measured suite (2026-09): lines ~56%. Keep CI green; ratchet later.
        lines: 55,
        functions: 40,
        statements: 55
      }
    }
  }
})
