import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/browser', workers: 1, fullyParallel: false,
  timeout: 30_000, expect: { timeout: 5000 },
  reporter: [['list'], ['json', { outputFile: 'output/playwright/results.json' }]],
  outputDir: 'output/playwright/results',
  webServer: { command: 'node scripts/demo-server.mjs', url: 'http://127.0.0.1:4173', reuseExistingServer: false, timeout: 10_000 },
});
