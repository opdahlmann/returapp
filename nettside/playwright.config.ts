import { defineConfig, devices } from '@playwright/test';

// Nettsidens egne tester mot dist/ (skript/server.mjs på 4322, samme regler som nginx). E2E_BASE_URL satt = kjør mot et ferdig image (nginx), som i CI.
export default defineConfig({
  testDir: 'tests',
  timeout: 30_000,
  retries: 0,
  reporter: 'list',
  use: { baseURL: process.env['E2E_BASE_URL'] ?? 'http://localhost:4322', trace: 'retain-on-failure', locale: 'nb-NO' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: process.env['E2E_BASE_URL'] ? undefined : { command: 'node skript/server.mjs 4322', url: 'http://localhost:4322/', reuseExistingServer: false, timeout: 15_000 },
});
