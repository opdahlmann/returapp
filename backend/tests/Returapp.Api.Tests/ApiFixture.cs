using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.DependencyInjection;

namespace Returapp.Api.Tests;

// Kjører mot den ene dev-databasen fra .env.development (lokalt) eller Mongo__*-variabler (CI).
// Oppretter aldri databaser og sletter aldri noe den ikke har laget selv – tester isolerer seg med RunId.
public class ApiFixture : WebApplicationFactory<Program>
{
    public static readonly string RunId = DateTime.UtcNow.ToString("yyMMddHHmmss") + Random.Shared.Next(1000, 9999);

    static ApiFixture()
    {
        Environment.SetEnvironmentVariable("ASPNETCORE_ENVIRONMENT", "Development");
        Environment.SetEnvironmentVariable("App__DevEndpoints", "true");
        Environment.SetEnvironmentVariable("App__SeedDemo", "true");
        Environment.SetEnvironmentVariable("Sms__Provider", "Console");
        Environment.SetEnvironmentVariable("Mail__Provider", "Console");
    }

    public Db Db => Services.GetRequiredService<Db>();
}

[CollectionDefinition("api")]
public class ApiCollection : ICollectionFixture<ApiFixture>;
