# Dokploy: Build Type Dockerfile, Build Context ".", Dockerfile Path infra/web/Dockerfile. Se DEPLOY.md.
FROM public.ecr.aws/docker/library/node:24-alpine AS build
ARG NG_CONFIGURATION=production
WORKDIR /src
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY frontend/ ./
RUN npx ng build --configuration $NG_CONFIGURATION

FROM public.ecr.aws/nginx/nginx:alpine
COPY infra/web/nginx.conf /etc/nginx/templates/default.conf.template
COPY --from=build /src/dist/frontend/browser /usr/share/nginx/html
# Kun API_UPSTREAM byttes inn – uten filteret ville envsubst ødelagt nginx sine egne $-variabler.
ENV API_UPSTREAM=http://api:8080 NGINX_ENVSUBST_FILTER=^API_UPSTREAM$
EXPOSE 80
HEALTHCHECK --interval=30s --timeout=5s --retries=3 CMD wget -qO- http://127.0.0.1/ >/dev/null || exit 1
