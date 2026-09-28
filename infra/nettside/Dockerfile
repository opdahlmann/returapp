# returapp.no: statisk Astro-side → nginx. Byggkontekst er repo-roten (bygget låner fra frontend/ og docs/design/).
# Dokploy: Build Type Dockerfile, Dockerfile Path infra/nettside/Dockerfile, Build Context ., port 80, ingen miljøvariabler.
# Basebilder fra ECR Public som infra/web/ (unngår Docker Hub-ratelimit).

FROM public.ecr.aws/docker/library/node:24-alpine AS build
WORKDIR /app/nettside
COPY nettside/package.json nettside/package-lock.json ./
RUN npm ci
# Det nettsiden låner fra resten av repoet, på samme relative stier som lokalt (../frontend, ../docs).
COPY frontend/src/tokens.css /app/frontend/src/tokens.css
COPY frontend/public/fonts /app/frontend/public/fonts
COPY frontend/public/icons /app/frontend/public/icons
COPY docs/design/Returapp-demo.html /app/docs/design/Returapp-demo.html
COPY nettside/astro.config.mjs nettside/tsconfig.json ./
COPY nettside/public public
COPY nettside/src src
COPY nettside/skript skript
# prebuild (kopier-inn), astro check og astro build
RUN npm run build

FROM public.ecr.aws/nginx/nginx-unprivileged:alpine
COPY infra/nettside/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/nettside/dist /usr/share/nginx/html
EXPOSE 80
HEALTHCHECK --interval=30s --timeout=5s --retries=3 CMD wget -qO- http://127.0.0.1/ >/dev/null || exit 1
