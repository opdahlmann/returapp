using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.DependencyInjection;
using Returapp.Api.Services;

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
        Environment.SetEnvironmentVariable("Push__Provider", "Console");
        Environment.SetEnvironmentVariable("App__AuthRateLimitPerMinute", "100000");
        Environment.SetEnvironmentVariable("App__Geocode", "false");
    }

    public Db Db => Services.GetRequiredService<Db>();

    public string? LastSms(string phone) => Services.GetRequiredService<ConsoleSmsSender>().Last.GetValueOrDefault(phone);
    public Mail? LastMail(string to) => Services.GetRequiredService<ConsoleMailSender>().Last.GetValueOrDefault(to);
    public string? LastPush(string endpoint) => Services.GetRequiredService<ConsolePushSender>().Last.GetValueOrDefault(endpoint);

    public HttpClient Client(string? accessToken = null)
    {
        var c = CreateClient();
        if (accessToken != null) c.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", accessToken);
        return c;
    }

    public async Task<JsonElement> Tokens(string email, string password = Seed.Seeder.DemoPassword)
    {
        var res = await CreateClient().PostAsJsonAsync("/api/auth/login", new { email, password });
        res.EnsureSuccessStatusCode();
        return await res.Content.ReadFromJsonAsync<JsonElement>();
    }

    public async Task<HttpClient> LoginAs(string email) => Client((await Tokens(email)).GetProperty("accessToken").GetString());

    // Unikt norsk testnummer per kall: +474 + 7 siffer.
    public static string TestPhone() => "+474" + Random.Shared.Next(1_000_000, 9_999_999);
}

[CollectionDefinition("api")]
public class ApiCollection : ICollectionFixture<ApiFixture>;
