import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/browser',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  timeout: process.env.BLOG_TEST_BROWSER === 'webkit' ? 60000 : 30000,
  expect: {
    timeout: process.env.BLOG_TEST_BROWSER === 'webkit' ? 15000 : 5000,
  },
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: 'http://127.0.0.1:4188',
    browserName: process.env.BLOG_TEST_BROWSER || 'chromium',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'pnpm dev --port 4188',
    url: 'http://127.0.0.1:4188/',
    reuseExistingServer: false,
  },
});
