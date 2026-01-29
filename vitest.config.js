import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    testTimeout: 10000,
    pool: 'forks',
    env: {
      NERVUR_TEST: '1',
    },
  },
})
