# Dokploy: Build Type Dockerfile, Build Context ".", Dockerfile Path infra/api/Dockerfile. Se DEPLOY.md.
FROM mcr.microsoft.com/dotnet/sdk:10.0.102 AS build
ARG DOTNET_CONFIGURATION=Release
WORKDIR /src
COPY backend/global.json ./
COPY backend/src/Returapp.Api/Returapp.Api.csproj src/Returapp.Api/
RUN dotnet restore src/Returapp.Api/Returapp.Api.csproj
COPY backend/src/Returapp.Api/ src/Returapp.Api/
RUN dotnet publish src/Returapp.Api/Returapp.Api.csproj -c $DOTNET_CONFIGURATION -o /app --no-restore

FROM mcr.microsoft.com/dotnet/aspnet:10.0
ARG ASPNETCORE_ENV=Production
RUN apt-get update && apt-get install -y --no-install-recommends curl && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=build /app .
ENV ASPNETCORE_HTTP_PORTS=8080 ASPNETCORE_ENVIRONMENT=$ASPNETCORE_ENV
EXPOSE 8080
USER app
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 CMD curl -fsS http://localhost:8080/ready || exit 1
ENTRYPOINT ["dotnet", "Returapp.Api.dll"]
