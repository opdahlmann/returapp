# Returapp

## Testbrukere (dev-databasen `Returapp2Dev`)

Opprettes av demo-seeden første gang API-et starter mot en tom database (`App__SeedDemo=true`). Kun testdata.

| Navn | Brukernavn (e-post) | Mobil (SMS-innlogging) | Passord | Rolle(r) | Firma / org |
| --- | --- | --- | --- | --- | --- |
| Jonas Hem | `jonas.hem@skanska.no` | 912 34 567 | `demo1234` | Giver | Skanska – Tangen brygge |
| Silje Nordbø | `silje@ombruksfabrikken.no` | 950 12 345 | `demo1234` | Retur-admin | Ombruksfabrikken AS |
| Kari Aasen | `kari@ombruksfabrikken.no` | 912 45 678 | `demo1234` | Sjåfør | Ombruksfabrikken AS |
| Ola Berntsen | `ola@ombruksfabrikken.no` | 954 32 100 | `demo1234` | Giver, Sjåfør | Ombruksfabrikken AS |
| Mona Lie | `mona@gjenbrukslageret.no` | 480 11 223 | `demo1234` | Sjåfør, Retur-admin | Gjenbrukslageret Oslo |
| Demo Superbruker | `demo@returapp.no` | – | `demo1234` | Giver, Superbruker | Returapp |
| Hans Dahl | – | 900 88 776 | – (kun SMS) | Giver | Privat |

SMS-innlogging i dev: koden skrives i API-loggen og kan hentes fra `GET /api/dev/last-sms?phone=…` (kun lokalt, `App__DevEndpoints=true`).

Tester (`dotnet test`) lager i tillegg egne, midlertidige brukere merket med en kjøre-id. De er ikke beregnet for innlogging.

---

Enkel retur og gjenbruk fra byggeplassen. Angular 22 PWA + .NET 10 Minimal API + MongoDB.

- Design (fasit): `docs/design/Returapp-standalone.html`
- Plan: `IMPLEMENTERINGSPLAN.md`
- Publisering (Dokploy): `DEPLOY.md` – app på https://app.returapp.no (dev: https://dev-app.returapp.no), API på https://api.returapp.no (dev: https://dev-api.returapp.no)

## Kom i gang

Krever .NET 10 SDK (10.0.102), Node 22+ og tilgang til dev-databasen. Docker trengs kun for å teste imagene lokalt.

```sh
cp .env.development.example .env.development   # fyll inn Mongo__ConnectionString og Jwt__Secret
```

Backend (http://localhost:5080, helsesjekk `/health` og `/ready`):

```sh
dotnet run --project backend/src/Returapp.Api
dotnet test backend                             # mot samme dev-database, oppretter ingen egne databaser
```

Frontend (http://localhost:4200, `/api` proxyes til backend):

```sh
cd frontend
npm install
npm start
```

API-imaget lokalt (samme som Dokploy):

```sh
docker build -f infra/api/Dockerfile -t returapp-api .
docker run --rm --read-only --tmpfs /tmp --env-file .env.development -p 8080:8080 returapp-api
```

`.env.*`-filer er ignorert av git og skal aldri sjekkes inn. Appen skriver aldri til lokal disk. Alle filer ligger i MongoDB.
