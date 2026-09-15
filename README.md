# Returapp

Enkel retur og gjenbruk fra byggeplassen. Angular 22 PWA + .NET 10 Minimal API + MongoDB.

- Design (fasit): `docs/design/Returapp-standalone.html`
- Plan: `IMPLEMENTERINGSPLAN.md`
- Publisering (Dokploy): `DEPLOY.md` – app på https://app.returapp.no (dev: https://dev-app.returapp.no), API på https://api.returapp.no (dev: https://dev-api.returapp.no)

## Kom i gang

Krever .NET 10 SDK, Node 22+ og tilgang til en MongoDB (dev-server). Docker trengs kun for tester (Testcontainers) og for å teste imagene lokalt.

```sh
cp .env.development.example .env.development   # fyll inn Mongo__ConnectionString og Jwt__Secret
```

Backend (http://localhost:5080):

```sh
dotnet run --project backend/src/Returapp.Api
dotnet test backend                             # starter Mongo i Docker (Testcontainers)
```

Frontend (http://localhost:4200, `/api` proxyes til backend):

```sh
cd frontend
npm install
npm start
```

`.env.*`-filer er ignorert av git og skal aldri sjekkes inn. Appen skriver aldri til lokal disk. Alle filer ligger i MongoDB.
