import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    alias: {
      obsidian: new URL('./__mocks__/obsidian.ts', import.meta.url).pathname
    }
  },
})
