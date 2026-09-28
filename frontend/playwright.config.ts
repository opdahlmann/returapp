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
  projects: [
    { name: 'chromium', testIgnore: ['reference/**', 'demo/**', 'skjermbilder/**'], use: { ...devices['Desktop Chrome'], viewport: { width: 402, height: 874 } } },
    // iOS-lignende motor i CI (E2E_WEBKIT=1). Visuelle tester kjøres bare i chromium – referansebildene er tatt der.
    ...(process.env['E2E_WEBKIT'] ? [{ name: 'webkit', testIgnore: ['reference/**', 'visual/**', 'demo/**', 'skjermbilder/**'], use: { ...devices['Desktop Safari'], viewport: { width: 402, height: 874 } } }] : []),
    // Referansebilder av prototypen tas bare på forespørsel: CAPTURE=1 npx playwright test --project reference
    // Den utpakkede demoen (docs/design/Returapp-demo.html) mot referansebildene, uten nett: DEMO=1 npx playwright test --project demo
    ...(process.env['DEMO'] ? [{ name: 'demo', testMatch: 'demo/**', use: { ...devices['Desktop Chrome'], viewport: { width: 402, height: 874 } } }] : []),
    // Skjermbilder av appen til nettsiden (nettside/src/assets/skjermbilder): SKJERMBILDER=1 npx playwright test --project skjermbilder
    ...(process.env['SKJERMBILDER'] ? [{ name: 'skjermbilder', testMatch: 'skjermbilder/**', use: { ...devices['Desktop Chrome'], viewport: { width: 402, height: 874 }, deviceScaleFactor: 3, locale: 'nb-NO', timezoneId: 'Europe/Oslo' } }] : []),
    ...(process.env['CAPTURE'] ? [{ name: 'reference', testMatch: 'reference/**', use: { ...devices['Desktop Chrome'] } }] : []),
  ],
  // E2E_BASE_URL satt = kjør mot ferdige containere (CI/lokal image-test), ellers start API + ng serve.
  webServer: process.env['E2E_BASE_URL'] || process.env['DEMO'] ? undefined : [
    { command: 'dotnet run --project ../backend/src/Returapp.Api', url: 'http://localhost:5080/health', reuseExistingServer: true, timeout: 180_000 },
    { command: 'npx ng serve --port 4200 --no-hmr', url: 'http://localhost:4200', reuseExistingServer: true, timeout: 180_000 },
  ],
});
