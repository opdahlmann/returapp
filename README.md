# Returapp

Enkel retur og gjenbruk fra byggeplassen. Angular 22 PWA + .NET 10 Minimal API + MongoDB.

- Design (fasit): `docs/design/Returapp-standalone.html`
- Plan: `IMPLEMENTERINGSPLAN.md`

## Kom i gang

Krever .NET 10 SDK, Node 22+, og en MongoDB (ekstern dev-server eller Docker).

```sh
cp .env.example backend/.env    # fyll inn Mongo__ConnectionString og Jwt__Secret
```

Backend (http://localhost:5080):

```sh
cd backend
dotnet run --project src/Returapp.Api
dotnet test                     # starter Mongo i Docker (Testcontainers), eller sett TEST_MONGO
```

Frontend (http://localhost:4200):

```sh
cd frontend
npm install
npm start
```

Alt i Docker (web på http://localhost:8080):

```sh
docker compose up --build                  # api mot Mongo fra backend/.env
docker compose --profile local up --build  # med lokal Mongo (sett Mongo__ConnectionString=mongodb://mongo:27017)
```

`.env`-filer er ignorert av git og skal aldri sjekkes inn.
