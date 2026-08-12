import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    // The vk-derivation test spins up bb.js's multithreaded wasm and
    // sumchecks two real circuits; give it room.
    testTimeout: 300_000,
    hookTimeout: 300_000,
  },
})
