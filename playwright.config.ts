import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: 'list',
  use: { baseURL: 'http://127.0.0.1:3100', trace: 'retain-on-failure' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'npm run start -w @flux/web -- --hostname 127.0.0.1 --port 3100',
    url: 'http://127.0.0.1:3100/sign-in',
    reuseExistingServer: false,
    timeout: 60000,
  },
});
