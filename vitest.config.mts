import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    alias: {
      obsidian: './__mocks__/obsidian.ts'
    }
  },
})
