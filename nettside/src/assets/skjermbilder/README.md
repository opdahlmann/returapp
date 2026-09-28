# Skjermbilder fra appen

Tatt 28. september 2026 av appen på commit `92b25de` med `npm run skjermbilder` (Playwright-prosjektet `skjermbilder` i `frontend/`, spec `frontend/e2e/skjermbilder/skjermbilder.spec.ts`). Demo-dataene ble satt tilbake først (`POST /api/dev/reset-demo`), så datoer regnes fra den dagen.

- `light/` og `dark/`: samme 12 skjermer i begge temaer, 1206×2622 px (402×874 × 3).
- Navnene er skjerm-id fra `frontend/e2e/visual/screens.ts` med `/` byttet til `-`.
- Ta dem på nytt når appen endrer utseende: kjør kommandoen over med API og `ng serve` tilgjengelig (Playwright starter dem selv), og oppdater datoen og commit-id-en her.
