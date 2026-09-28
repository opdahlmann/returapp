# returapp.no

Statisk produktside for Returapp, bygget med Astro uten rammeverk i nettleseren. Plan, beslutninger og steg: `docs/nettside-plan.md`.

- Kjøre: `npm install` og `npm run dev` (port 4321). Krever Node 22.12 eller nyere.
- Bygge: `npm run build` gir `dist/`. `npm run sjekk` bygger, kontrollerer `dist/` og kjører Playwright.
- Fonter, ikoner og demoen kopieres inn fra `frontend/` og `docs/design/` av `skript/kopier-inn.mjs` før dev og bygg. Demoen lages av `skript/demo-pakk-ut.mjs`.
- Skjermbildene i `src/assets/skjermbilder/` er tatt av appen med `npm run skjermbilder` (krever API og `ng serve` lokalt).
- Drift: `infra/nettside/Dockerfile` og `nginx.conf`, se `DEPLOY.md`.
