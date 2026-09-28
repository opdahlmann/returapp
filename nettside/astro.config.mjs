// @ts-check
import sitemap from '@astrojs/sitemap';
import { defineConfig } from 'astro/config';

// returapp.no: statisk produktside, ingen rammeverk i nettleseren, bare bokmål.
// Bygg → dist/ → nginx (infra/nettside/). Plan og begrunnelser: docs/nettside-plan.md.
export default defineConfig({
  site: 'https://returapp.no',
  trailingSlash: 'never',
  build: { format: 'file' }, // /funksjoner.html → nginx serverer den som /funksjoner, som canonical
  prefetch: { prefetchAll: true, defaultStrategy: 'hover' },
  integrations: [sitemap({ filter: (page) => !page.endsWith('/404') })],
  // Tokens leses rett fra appen (frontend/src/tokens.css); dev-serveren må få lov til å lese utenfor nettside/.
  vite: { server: { fs: { allow: ['..'] } } },
});
