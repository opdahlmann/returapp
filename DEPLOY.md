# Returapp – publisering med Dokploy

Returapp kjører i Dokploy som to applikasjoner per miljø (API og web), bygget fra Dockerfiles i `infra/`.
Ingen Docker Compose, ingen image-registry, ingen volumer. Bakgrunn og begrunnelser: `IMPLEMENTERINGSPLAN.md` § 2.8.

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

Push__Provider=<Console i dev uten nøkler | WebPush når VAPID-nøkler er satt>
# Generer nøkler én gang: dotnet run --project backend/src/Returapp.Api -- vapid
Push__PublicKey=
Push__PrivateKey=
Push__Subject=mailto:drift@returapp.no

App__BaseUrl=<https://dev-app.returapp.no i dev | https://app.returapp.no i prod>
App__SeedDemo=<true i dev | false i prod>
```

**Aldri** sett `App__DevEndpoints` i Dokploy. Den åpner `/api/dev/*`: innloggingskoder (`last-sms`), e-poster med lenker (`last-mail`), sletting av testdata og tilbakestilling av demo-data. API-et logger en advarsel ved oppstart hvis den er på.

`ASPNETCORE_HTTP_PORTS` og `ASPNETCORE_ENVIRONMENT` settes av Dockerfilen og skal ikke inn her.

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
6. **Helsesjekk og rollback**: imagene har `HEALTHCHECK` (API: `/ready`, web: `/`). Under appens Advanced → Swarm Settings → Update Config:
   ```json
   { "Parallelism": 1, "Delay": 10000000000, "FailureAction": "rollback", "Monitor": 60000000000, "Order": "start-first" }
   ```
   Ny versjon startes ved siden av den gamle, og Swarm ruller tilbake hvis den ikke blir frisk innen ett minutt (tidene er nanosekunder).
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

## 8 · Før prod-deploy

- [ ] DNS for `api.returapp.no` og `app.returapp.no` peker på Dokploy-verten.
- [ ] Egen prod-database og egen databasebruker (ikke dev-brukeren). Demo-brukerne i `README.md` finnes bare i dev.
- [ ] `App__SeedDemo=false`, `App__BaseUrl=https://app.returapp.no`, `App__DevEndpoints` **ikke** satt.
- [ ] Nye hemmeligheter for prod: `Jwt__Secret` (`openssl rand -hex 32`), Twilio, SMTP, VAPID (`-- vapid`).
- [ ] `Sms__Provider=Twilio`, `Mail__Provider=Smtp`, `Push__Provider=WebPush`. Med `Console` sendes ingenting – innlogging med SMS er da umulig.
- [ ] Update Config med rollback (§ 4 steg 6) på begge appene.
- [ ] Backup-cron satt opp og én gjenoppretting testet (§ 9).
- [ ] Røyktest (§ 5) grønn.

## 9 · Drift

### Logger

- API skriver én JSON-linje per logghendelse til stdout i prod (`ASPNETCORE_ENVIRONMENT=Production`), lesbar i appens **Logs**-fane. Filtrer på `"LogLevel":"Error"` eller `"Warning"`.
- Uventede feil i nettleseren sendes til `POST /api/client-errors` (melding, sti uten token, versjon) og havner i samme logg som `Klientfeil …`. Maks 5 per sidevisning og 20 per minutt per IP. Ingenting lagres i databasen.
- web (nginx) logger forespørsler til stdout.

### Backup

Alle data, også bilder og filer, ligger i MongoDB – en `mongodump` av databasen er hele backupen. Den kjører på databaseserveren, utenfor Dokploy og appen. Eksempel med egen backup-bruker (rolle `backup`), nattlig kl. 03:15 og 14 dagers historikk:

```sh
# /etc/cron.d/returapp-backup
15 3 * * * root mongodump --uri="mongodb://backup:<passord>@localhost:<port>/?authSource=admin" --db=<prod-database> --gzip --archive=/var/backups/returapp/returapp-$(date +\%F).gz && find /var/backups/returapp -name 'returapp-*.gz' -mtime +14 -delete
```

Kopier arkivene til et annet sted enn databaseserveren (f.eks. objektlagring) – en backup på samme disk hjelper ikke hvis serveren forsvinner.

Gjenoppretting (test den minst én gang i kvartalet på en annen server eller i en midlertidig database som slettes etter testen):

```sh
mongorestore --uri="mongodb://<admin>@<host>:<port>/?authSource=admin" --gzip --archive=returapp-2026-09-15.gz --nsInclude='<prod-database>.*' --drop
```

### Sikkerhet

| Krav | Hvor |
| --- | --- |
| TLS og HTTP→HTTPS | Traefik (domeneinnstillingene i Dokploy) |
| HSTS (1 år, inkl. subdomener) | nginx for `app.returapp.no`, API-et for `api.returapp.no` |
| `Jwt__Secret` ≥ 32 tegn | Valideres ved oppstart – API-et starter ikke uten |
| Rate-limit på `/api/auth/*` per klient-IP | ASP.NET RateLimiter, klient-IP fra Traefiks `X-Forwarded-For` (én hop) |
| Maks 10 MB request body | nginx `client_max_body_size` og Kestrel `MaxRequestBodySize` |
| Ingen CORS | Appen kaller `/api` på eget domene |
| Ingen stack traces ut | ProblemDetails; `ASPNETCORE_ENVIRONMENT=Production` |
| `X-Content-Type-Options: nosniff` | Alle svar fra nginx og API |
| Bilder med riktig MIME og `Content-Disposition: inline`, bare for de som kan se ordren | `GET /api/photos/{id}` |
| Ikke-root containere, ingen volumer | API: brukeren `app`. web: `nginx-unprivileged` (uid 101) |
| Ingen skriving til disk | Alt i MongoDB; CI kjører API-et med `--read-only` |
| Dev-endepunkter av | `App__DevEndpoints` aldri i Dokploy; advarsel i loggen hvis på |

### Hemmeligheter

Dokploy lagrer Environment i klartekst. Egne hemmeligheter per miljø. Roter ved mistanke om lekkasje: ny `Jwt__Secret` gjør alle access-tokens (15 min) ugyldige, men innloggede brukere fornyes via refresh-token. Skal alle logges ut, tøm i tillegg `refreshTokens` på brukerne (`db.users.updateMany({}, {$set: {refreshTokens: []}})`). Nye Twilio/SMTP-nøkler byttes hos leverandøren først. VAPID-nøkler bør ikke roteres – eksisterende push-abonnement slutter da å virke.
