import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: 'tests',
  fullyParallel: true,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:5173',
    viewport: { width: 1280, height: 800 },
    // Chrome installé sur la machine ; remplace par `npx playwright install chromium` si besoin.
    channel: 'chrome',
  },
  webServer: {
    command: 'pnpm dev',
    url: 'http://localhost:5173',
    reuseExistingServer: true,
  },
})
