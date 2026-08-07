import { fileURLToPath } from 'node:url'
import { coverageConfigDefaults, defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: {
      obsidian: fileURLToPath(new URL('./test/obsidian-stub.ts', import.meta.url))
    }
  },
  test: {
    exclude: ['build', 'node_modules'],
    coverage: {
      include: ['src/**/*.ts'],
      exclude: [
        'src/main.ts',
        'src/views/**',
        'src/modals/**',
        'src/settings/SettingTab.ts',
        'src/i18n/**',
        ...coverageConfigDefaults.exclude
      ],
      provider: 'v8'
    },
    testTimeout: 30000
  }
})
