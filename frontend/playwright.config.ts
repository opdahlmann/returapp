import { defineConfig, devices } from '@playwright/test';

// E2E mot lokal API (dev-databasen) + ng serve. Viewport = prototypens skjerm (402×874).
export default defineConfig({
  testDir: 'e2e',
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: process.env['E2E_BASE_URL'] ?? 'http://localhost:4200',
    locale: 'nb-NO',
    timezoneId: 'Europe/Oslo',
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 402, height: 874 } } }],
  // E2E_BASE_URL satt = kjør mot ferdige containere (CI/lokal image-test), ellers start API + ng serve.
  webServer: process.env['E2E_BASE_URL'] ? undefined : [
    { command: 'dotnet run --project ../backend/src/Returapp.Api', url: 'http://localhost:5080/health', reuseExistingServer: true, timeout: 180_000 },
    { command: 'npx ng serve --port 4200', url: 'http://localhost:4200', reuseExistingServer: true, timeout: 180_000 },
  ],
});
