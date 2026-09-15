# Returapp – publisering med Dokploy

Returapp kjører i Dokploy som to applikasjoner per miljø (API og web), bygget fra Dockerfiles i `infra/`.
Ingen Docker Compose, ingen image-registry, ingen volumer. Bakgrunn og begrunnelser: `IMPLEMENTERINGSPLAN.md` § 2.8.

> `infra/api/Dockerfile` kommer i fase 1 og `infra/web/Dockerfile` + `nginx.conf` i fase 3. Før det finnes ingenting å deploye.

## 1 · Apper

| App i Dokploy | Branch | Dockerfile Path | Build Context | Port | Domene |
| --- | --- | --- | --- | --- | --- |
| `returapp-dev-api` | `opd` | `infra/api/Dockerfile` | `.` | 8080 | `dev-api.returapp.no` |
| `returapp-dev-web` | `opd` | `infra/web/Dockerfile` | `.` | 80 | `dev-app.returapp.no` |
| `returapp-api` | `main` | `infra/api/Dockerfile` | `.` | 8080 | `api.returapp.no` |
| `returapp-web` | `main` | `infra/web/Dockerfile` | `.` | 80 | `app.returapp.no` |

- Build Type: **Dockerfile** (ikke Compose, Nixpacks eller Railpack).
- Build-time Arguments: **ingen**. Dockerfilene bygger production som standard, også for dev.
- Networks-seksjonen røres ikke (alle apper ligger på `dokploy-network`).
- Alle domener: HTTPS på, Let's Encrypt, HTTP→HTTPS-redirect.
- Angular-appen kaller relativ `/api` på sitt eget domene. `web` proxyer internt til API-appen via tjenestenavnet, aldri via `api.returapp.no`. Derfor trengs ingen CORS.
- API-domenet brukes til helsesjekk, overvåkning og integrasjoner.
- `returapp.no` uten subdomene er reservert for en egen nettside og brukes ikke av Returapp.

## 2 · Hvor variablene skal

| Felt i Dokploy | Tilsvarer | Brukes til | Etter endring |
| --- | --- | --- | --- |
| **Environment** | `docker run -e` | Alt nedenfor | **Redeploy** |
| **Build-time Arguments** | `docker build --build-arg` | Ingenting i Returapp | **Rebuild** |

## 3 · Environment per app

### API (`returapp-dev-api` / `returapp-api`)

Samme nøkler som i `.env.development.example`. Verdier for dev (`opd`) og prod (`main`):

```
Mongo__ConnectionString=mongodb://<bruker>:<passord>@<host>:<port>/admin?authSource=admin&directConnection=true
Mongo__Database=<Returapp2Dev i dev | egen prod-database>

Jwt__Secret=<min 32 tilfeldige tegn – ulik i dev og prod>
Jwt__Issuer=returapp
Jwt__AccessMinutes=15
Jwt__RefreshDays=30

Sms__Provider=<Console i dev | Twilio i prod>
Sms__From=Returapp
Twilio__AccountSid=
Twilio__AuthToken=

Mail__Provider=<Console i dev | Smtp i prod>
Mail__From=noreply@returapp.no
Smtp__Host=
Smtp__Port=587
Smtp__User=
Smtp__Pass=

Push__PublicKey=
Push__PrivateKey=
Push__Subject=mailto:drift@returapp.no

App__BaseUrl=<https://dev-app.returapp.no i dev | https://app.returapp.no i prod>
App__SeedDemo=<true i dev | false i prod>
App__Co2Factor=0.9
```

**Aldri** sett `App__DevEndpoints` i Dokploy. Den åpner `/api/dev/last-sms`, som viser innloggingskoder.

`ASPNETCORE_URLS` og `ASPNETCORE_ENVIRONMENT` settes av Dockerfilen og skal ikke inn her.

### Web (`returapp-dev-web` / `returapp-web`)

Nøyaktig én variabel:

```
API_UPSTREAM=http://<tjenestenavnet til API-appen i samme miljø>:8080
```

Tjenestenavnet genereres av Dokploy. Finn det i API-appens **Logs**-fane: containervelgeren viser
`<tjenestenavn>.1.<id>`. Bruk delen før `.1.`.

## 4 · Oppsett steg for steg

1. **DNS**: A-record for `dev-api`, `dev-app`, `api` og `app` under `returapp.no` → Dokploy-vertens IP, **før** første deploy (ellers feiler Let's Encrypt).
2. **Prosjekt** `returapp` i Dokploy.
3. **API først**: Create Application → innstillinger fra § 1 → Environment fra § 3 → Domain → Deploy. Noter tjenestenavnet.
4. **Web**: Create Application → innstillinger fra § 1 → `API_UPSTREAM` → Domain (HTTPS på, Let's Encrypt, HTTP→HTTPS-redirect) → Deploy.
5. **Auto-deploy** ved push til branchen slås på for begge.
6. **Helsesjekk og rollback**: imagene har `HEALTHCHECK` (API: `/ready`). Sett Swarm update config til rollback når en ny versjon ikke blir frisk.
7. Gjenta 3–6 for det andre miljøet. Dev (`opd`) settes opp først: API etter fase 1, web etter fase 3.

## 5 · Røyktest etter deploy

Eksemplene er prod. For dev: `dev-api.returapp.no` og `dev-app.returapp.no`.

1. `https://api.returapp.no/health` → 200 (API-et lever).
2. `https://api.returapp.no/ready` → 200 (databasen svarer).
3. Åpne en dyp lenke, f.eks. `https://app.returapp.no/p/R-2041` → appen laster (SPA-fallback).
4. Logg inn på `https://app.returapp.no` (beviser `/api`-proxyen). Dev: brukerne øverst i `README.md`.
5. Last opp et bilde i «Meld henting» (beviser 10 MB-grensen gjennom Traefik → nginx → API og lagring i MongoDB).
6. `docker service ls` på Dokploy-verten → alle Returapp-tjenester `1/1`.

## 6 · Teste imagene lokalt (samme oppsett som i Dokploy)

```sh
docker build -f infra/api/Dockerfile -t returapp-api .
docker run --rm --read-only --tmpfs /tmp --env-file .env.development -p 8080:8080 returapp-api
curl -fsS http://localhost:8080/ready

docker build -f infra/web/Dockerfile -t returapp-web .
docker run --rm -e API_UPSTREAM=http://host.docker.internal:8080 -p 8081:80 returapp-web
# åpne http://localhost:8081
```

`--read-only` viser med en gang om noe prøver å skrive til disk (alt skal ligge i MongoDB).

## 7 · Feilsøking

| Symptom | Årsak | Fiks |
| --- | --- | --- |
| `.env: No such file or directory` ved bygg | Build Type er Compose/Nixpacks/Railpack | Bytt til Dockerfile |
| `COPY` finner ikke `package.json` / `.csproj` | Build Context er Dockerfile-mappa | Build Context `.` |
| Build arg satt, men ingen effekt | Lagt i Environment | Flytt til Build-time Arguments og **Rebuild** |
| Web laster, men `/api` gir 502 (mens `api.returapp.no/health` svarer) | `API_UPSTREAM` peker på feil eller gammelt tjenestenavn | Les tjenestenavnet i API-appens Logs-fane, Redeploy web |
| API starter ikke, feilmelding om `Mongo__…` eller `Jwt__Secret` | Påkrevd variabel mangler eller er for kort | Sett variabelen i Environment, Redeploy |
| `/ready` 503, innlogging gir 500 | `authMechanism=DEFAULT` i tilkoblingsstrengen (Compass legger den på) | Fjern parameteren |
| Bildeopplasting gir 413 | Fil over 10 MB | Forventet. Grensen er satt i nginx og API |
| Alle brukere får «for mange forsøk» samtidig | Rate-limiteren ser proxy-IP i stedet for klient-IP (f.eks. Cloudflare foran Traefik) | Se `IMPLEMENTERINGSPLAN.md` risiko 13 |
| `dotnet restore` feiler i bygg (exit 155) | SDK-imaget matcher ikke `backend/global.json` | Pin SDK-imaget til samme versjon |
| Let's Encrypt-sertifikat utstedes ikke | DNS-recorden for subdomenet mangler eller peker feil | Sjekk A-record, vent på DNS, Redeploy |
| Cloudflare 522 | Traefik lytter ikke på 80/443 | Dokploy → Settings → Server |
| Cloudflare 502 | Tjenesten er `0/0` | Redeploy appen |

## 8 · Drift

- **Logger**: stdout, leses i Logs-fanen i Dokploy.
- **Backup**: `mongodump`-cron på databaseserveren (utenfor Dokploy).
- **Hemmeligheter**: Dokploy lagrer Environment i klartekst. Egne hemmeligheter per miljø. Roter ved mistanke om lekkasje.
