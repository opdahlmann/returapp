# The Dokploy way — oppskrift for å publisere et prosjekt

Destillert fra Nabotavle (fem apper: .NET-API + tre Angular-frontender + Astro-nettside). Gjenbrukbar
for ethvert prosjekt med «API + statiske frontender». Full runbook for akkurat dette repoet: `DEPLOY.md`.

## 1 · Grunnregler (det som faktisk virket)

1. **Én Dokploy-applikasjon per deploybar, Build Type = Dockerfile.** Ikke compose, ikke Nixpacks/Railpack
   (de leter etter en `.env` i kildemappa og feiler). Maks to filer per app i repoet:
   `infra/<app>/Dockerfile` (+ `nginx.conf` for frontender).
2. **Build Context Path = `.` (repo-roten)**, Dockerfile Path = `infra/<app>/Dockerfile`. Monorepo-bygg
   trenger hele arbeidsområdet; setter du konteksten til Dockerfile-mappa feiler `COPY package.json …`.
3. **Dockerfilen bygger production som standard.** Et dev-miljø er samme filer + build args + egne domener.
4. **Frontendene kaller API-et same-origin (`/api`, `/hubs`).** nginx i frontend-imaget proxyer videre til
   API-containeren. Ingen CORS, ingen absolutte API-URL-er i frontend-koden, ingen Traefik-path-regler.
5. **Ingen `.env`-fil i imaget.** All runtime-konfig er ekte miljøvariabler satt i Dokploy. `.env.*` er kun
   for lokal kjøring og er gitignorert; `.env.*.example` er malen som sjekkes inn.
6. **Ingen volumer for filer.** Binærfiler ligger i databasen; containerne er tilstandsløse. (Databasen står
   på egen server, ikke på Dokploy-verten.)
7. **TLS termineres i Traefik.** Containerne lytter på ren HTTP (nginx `:80`, Kestrel `:8080`). API-et må
   stole på `X-Forwarded-Proto`/`X-Forwarded-For` (`UseForwardedHeaders`), og aldri slå på
   `UseHttpsRedirection()`.

## 2 · Hvor variablene skal i Dokploy — de to feltene

Dette er den vanligste feilen. Dokploy har **to** steder, og en variabel i feil felt gjør ingenting.

| Felt i Dokploy | Tilsvarer | Brukes til | Etter endring |
| --- | --- | --- | --- |
| **Environment** (fanen «Environment») | `docker run -e` — leses av prosessen i containeren | `MongoDb__*`, `Jwt__*`, `Brevo__*`, `API_UPSTREAM` | **Redeploy** holder |
| **Build-time Arguments** (boks under Build Type = Dockerfile) | `docker build --build-arg` — `ARG` i Dockerfilen, usynlig ved kjøretid | `NG_CONFIGURATION=development`, `DOTNET_CONFIGURATION=Debug`, `ASPNETCORE_ENV=Development` | **Rebuild** kreves |

Tommelfingerregel: *bakes det inn i imaget → Build-time Arguments; leses det når containeren starter →
Environment.* Prod-appene trenger **ingen** build args (Dockerfilen har prod som default).

## 3 · Per app — hva som skal inn

### API (.NET)
- Port **8080**, domene `api.<domene>`. `ASPNETCORE_URLS` og `ASPNETCORE_ENVIRONMENT` settes av Dockerfilen.
- **Environment** (runtime) — nøkler med `__` for nøsting (`MongoDb__Database` → `MongoDb:Database`):

```
MongoDb__ConnectionString=mongodb://<bruker>:<passord>@<host>:<port>/admin?authSource=admin&directConnection=true
MongoDb__Database=Nabotavle
Jwt__Issuer=https://nabotavle.no
Jwt__Audience=nabotavle-api
Jwt__AccessTokenLifetimeMinutes=60
Jwt__PrivateKeyPem=<RSA-privatnøkkel i PEM — PÅKREVD i prod, tom = flyktig nøkkel som logger alle ut ved restart>
Brevo__ApiKey=            # tom = kun-logg-modus (ingen ekte sending)
Brevo__SenderEmail=ingen-svar@nabotavle.no
Brevo__SenderName=Nabotavle
Brevo__WebhookSecret=
Sms__ApiKey=              # tom = kun-logg-modus
Sms__Sender=Nabotavle
Sms__WebhookSecret=
Leads__NotifyEmail=kontakt@nabotavle.no
Support__NotifyEmail=kontakt@nabotavle.no
```

- **Build-time Arguments** — kun for et dev-miljø: `DOTNET_CONFIGURATION=Debug` og `ASPNETCORE_ENV=Development`.
- Påkrevd konfig valideres ved oppstart (`ValidateOnStart`): mangler `MongoDb__*`, nekter API-et å starte.
  Det er en feature — feilen kommer med én gang, ikke ved første request.

### Frontender (Angular → nginx, Astro → nginx)
- Port **80**, egne domener (`app.*`, `styre.*`, `admin.*`, nettsiden på apex + `www`).
- **Environment** — nøyaktig én variabel:

```
API_UPSTREAM=http://<API-appens tjenestenavn>:8080
```

  Dokploy lar deg ikke velge containernavn, men Docker-DNS slår alltid opp **tjenestenavnet Dokploy
  genererer**. Finn det i API-appens Logs-fane: containervelgeren viser `<tjenestenavn>.1.<id>`, f.eks.
  `nabotavle-devapinabotavleno-kzk37v`. Alle apper ligger på `dokploy-network` som standard — ikke rør
  Networks-seksjonen.
- **Build-time Arguments** — kun for et dev-miljø: `NG_CONFIGURATION=development`. (Astro: ingen.)

## 4 · Dockerfile- og nginx-mønsteret (kopierbart)

**Frontend-Dockerfile:** multi-stage — `node:22-alpine` (`npm ci` mot innsjekket lockfile → `ng build <app>
--configuration ${NG_CONFIGURATION}`) → `nginx:alpine`. Bruk ECR Public / MCR som base for å unngå Docker
Hub-ratelimit. Pin .NET-SDK-imaget til nøyaktig `global.json`-versjonen (flytende `sdk:10.0` krysser
ikke feature-båndet, og `dotnet restore` feiler).

**nginx.conf som mal:** kopier til `/etc/nginx/templates/default.conf.template` og la nginx-imaget fylle
inn variabelen ved oppstart — kun den ene:

```dockerfile
COPY infra/<app>/nginx.conf /etc/nginx/templates/default.conf.template
ENV API_UPSTREAM=http://api:8080 NGINX_ENVSUBST_FILTER=^API_UPSTREAM$
```

```nginx
resolver 127.0.0.11 valid=10s ipv6=off;      # Docker-DNS, slås opp per request
location ^~ /api/ {
    set $api_upstream ${API_UPSTREAM};       # variabel → nginx starter selv om API-et er nede
    proxy_pass $api_upstream;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}
location / { try_files $uri $uri/ /index.html; }   # SPA-fallback
```

`NGINX_ENVSUBST_FILTER` er viktig: uten den bytter envsubst ut **alle** `$…` i fila, også nginx sine egne
variabler, og konfigen blir ødelagt.

## 5 · Lokalt: `.env`-filene

- Én fil per miljø i repo-roten: `.env.development` / `.env.production` (gitignorert), valgt av
  `ASPNETCORE_ENVIRONMENT`. Maler: `.env.*.example` (innsjekket). Samme nøkler som i § 3.
- `ASPNETCORE_URLS` står **bare** i de lokale filene (`http://localhost:5199` i dev, matcher
  `proxy.conf.json`) — i container setter Dockerfilen den.
- Klipp-og-lim-hjelp: `infra/<app>/.env.development` (gitignorert) inneholder ordrett det som skal inn i
  Build-time Arguments og Environment for hver app, med kommentar om hvilket felt. Lag tilsvarende for prod.
- Tester laster aldri `.env` (`NABOTAVLE_SKIP_DOTENV=1`) og bruker en Testcontainers-database.

## 6 · Oppsett steg for steg (nytt prosjekt)

1. DNS → Dokploy-vertens IP for alle domener **før** deploy (ellers feiler Let's Encrypt).
2. Prosjekt i Dokploy; per app: Create Application → Build Type **Dockerfile** → git-repo + branch
   (`main` = prod, `opd` = dev) → Dockerfile Path `infra/<app>/Dockerfile` → Build Context `.` → Port →
   Domain (HTTPS på, Let's Encrypt, HTTP→HTTPS-redirect).
3. API først: Environment fra § 3 → Deploy. Noter tjenestenavnet fra Logs-fanen.
4. Hver frontend: Environment `API_UPSTREAM=http://<tjenestenavn>:8080` → Deploy.
5. Dev-miljø: samme apper igjen med `dev-`-domener, branch `opd`, build args fra § 3 → Rebuild.
6. Røyktest: `https://api.<domene>/health` → 200, `/ready` → 200 (databaseping; bruk den som
   helsesjekk for auto-rollback), logg inn i appen (beviser `/api`-proxyen), `docker service ls` → alle `1/1`.

## 7 · Feil vi har truffet — og svaret

| Symptom | Årsak | Fiks |
| --- | --- | --- |
| `infra/<app>/.env: No such file or directory` ved bygg | Build Type var Compose/Nixpacks | Bytt til Dockerfile |
| `COPY package.json` finner ikke fila | Build Context = Dockerfile-mappa | Build Context `.` |
| Build arg satt, men ingen effekt | Lagt i Environment | Flytt til Build-time Arguments + **Rebuild** |
| Frontend laster, men `/api` gir 502 | `API_UPSTREAM` peker på feil/utdatert tjenestenavn | Les tjenestenavnet fra API-ens Logs-fane, Redeploy |
| `/ready` = Unhealthy, innlogging 500 | `authMechanism=DEFAULT` i Mongo-strengen (Compass legger den på) | Fjern parameteren; .NET-driveren støtter den ikke |
| `Standalone servers do not support transactions` | Mongo uten replica set | Kjør Mongo som (ett-node) replica set |
| Mongo: `node is not in primary or recovering state` | Containeren gjenskapt, RS-konfig peker på gammelt vertsnavn | `rs.reconfig(cfg, {force:true})` med `localhost:27017` (se `DEPLOY.md` § 7) |
| Cloudflare **522** | Traefik borte fra swarmen (ingenting lytter på 80/443) | Dokploy → Settings → Server, eller `install.sh` (idempotent) |
| Cloudflare **502** | Tjenesten `0/0` eller på gammelt `dokploy-network` etter reinstall | Redeploy appen |
| Alle brukere logget ut etter restart | Tom `Jwt__PrivateKeyPem` | Sett en ekte PEM-nøkkel i Environment |
| `dotnet restore` exit 155 i bygg | Flytende SDK-tag vs `global.json` | Pin SDK-imaget til eksakt versjon |

## 8 · Ikke gjør dette

- Ikke legg til envsubst-maler, compose-filer eller «en tredje fil» for ruting. Blir løsningen mer enn
  Dockerfile + nginx.conf + variabler i Dokploy, er den sannsynligvis feil.
- Ikke sett absolutte API-URL-er eller CORS i frontenden for å «komme rundt» proxyen.
- Ikke legg høysensitive hemmeligheter i Dokploy hvis du kan unngå det — Dokploy lagrer Environment i
  klartekst. Roter nøkler som har ligget der.
