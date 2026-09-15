using System.Globalization;
using Microsoft.AspNetCore.HttpOverrides;
using Returapp.Api;
using Returapp.Api.Seed;

// Serveren skal oppføre seg likt uansett maskinens locale (nb-NO gir f.eks. U+2212-minus i Mongo-indeksnavn).
// Norsk formatering gjøres eksplisitt der den trengs.
CultureInfo.DefaultThreadCurrentCulture = CultureInfo.DefaultThreadCurrentUICulture = CultureInfo.InvariantCulture;
CultureInfo.CurrentCulture = CultureInfo.CurrentUICulture = CultureInfo.InvariantCulture;
DotEnv.Load();

var builder = WebApplication.CreateBuilder(args);
builder.Services.AddProblemDetails();
builder.Services.AddSingleton<Db>();
builder.Services.Configure<ForwardedHeadersOptions>(o =>
{
    // TLS termineres i Traefik; nginx sender Traefiks X-Forwarded-* videre uendret → én hop.
    o.ForwardedHeaders = ForwardedHeaders.XForwardedFor | ForwardedHeaders.XForwardedProto;
    o.ForwardLimit = 1;
    o.KnownIPNetworks.Clear();
    o.KnownProxies.Clear();
});

var app = builder.Build();

var missing = new[] { "Mongo:ConnectionString", "Mongo:Database", "Jwt:Secret" }.Where(k => string.IsNullOrWhiteSpace(app.Configuration[k])).ToList();
if (missing.Count > 0) throw new InvalidOperationException("Mangler påkrevd konfig: " + string.Join(", ", missing.Select(k => k.Replace(":", "__"))));
if (app.Configuration["Jwt:Secret"]!.Length < 32) throw new InvalidOperationException("Jwt__Secret må være minst 32 tegn");

app.UseForwardedHeaders();
app.UseExceptionHandler();
app.UseStatusCodePages();

var db = app.Services.GetRequiredService<Db>();
await db.EnsureIndexes();
await Seeder.Run(db, app.Configuration, app.Logger);

app.MapGet("/health", () => Results.Ok(new { ok = true }));
app.MapGet("/ready", async () =>
{
    try { await db.Ping(); return Results.Ok(new { ok = true, db = true }); }
    catch { return Results.Json(new { ok = false, db = false }, statusCode: 503); }
});

app.Run();

static class DotEnv
{
    // Leser .env.{ASPNETCORE_ENVIRONMENT} fra nærmeste foreldermappe. Satte miljøvariabler vinner. I container finnes ingen slik fil.
    public static void Load()
    {
        var file = $".env.{(Environment.GetEnvironmentVariable("ASPNETCORE_ENVIRONMENT") ?? "Production").ToLowerInvariant()}";
        for (var dir = new DirectoryInfo(AppContext.BaseDirectory); dir != null; dir = dir.Parent)
        {
            var path = Path.Combine(dir.FullName, file);
            if (!File.Exists(path)) continue;
            foreach (var line in File.ReadLines(path))
            {
                var i = line.IndexOf('=');
                if (i < 1 || line.TrimStart().StartsWith('#')) continue;
                var key = line[..i].Trim();
                if (Environment.GetEnvironmentVariable(key) == null) Environment.SetEnvironmentVariable(key, line[(i + 1)..].Trim());
            }
            return;
        }
    }
}
