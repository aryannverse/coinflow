import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      '@test': fileURLToPath(new URL('./test', import.meta.url)),
      'server-only': fileURLToPath(new URL('./test/empty.ts', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    exclude: ['src/**/*.int.test.ts', 'node_modules/**'],
  },
})
