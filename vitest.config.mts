import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    alias: {
      obsidian: new URL('./__mocks__/obsidian.ts', import.meta.url).pathname,
      '@': new URL('./src', import.meta.url).pathname
    },
    poolOptions: {
      threads: {
        minThreads: 1,
        maxThreads: 4,
      }
    }
  },
})
