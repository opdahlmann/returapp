using System.Globalization;
using System.Threading.RateLimiting;
using Microsoft.AspNetCore.Http.Features;
using Microsoft.AspNetCore.HttpOverrides;
using Microsoft.IdentityModel.Tokens;
using Returapp.Api;
using Returapp.Api.Endpoints;
using Returapp.Api.Seed;
using Returapp.Api.Services;

// Serveren skal oppføre seg likt uansett maskinens locale (nb-NO gir f.eks. U+2212-minus i Mongo-indeksnavn).
// Norsk formatering gjøres eksplisitt der den trengs.
CultureInfo.DefaultThreadCurrentCulture = CultureInfo.DefaultThreadCurrentUICulture = CultureInfo.InvariantCulture;
CultureInfo.CurrentCulture = CultureInfo.CurrentUICulture = CultureInfo.InvariantCulture;
if (args.FirstOrDefault() == "vapid")
{
    // dotnet run --project src/Returapp.Api -- vapid  → lim inn i .env.development / Dokploy Environment
    var keys = WebPush.VapidHelper.GenerateVapidKeys();
    Console.WriteLine($"Push__PublicKey={keys.PublicKey}\nPush__PrivateKey={keys.PrivateKey}");
    return;
}
DotEnv.Load();

var builder = WebApplication.CreateBuilder(args);
// Prod: én JSON-linje per logg til stdout (Logs-fanen i Dokploy). Dev: vanlig lesbar konsoll.
// DataProtection-advarslene om nøkler som ikke lagres dempes i appsettings: appen bruker ikke DataProtection (egne JWT-er).
if (!builder.Environment.IsDevelopment())
    builder.Logging.ClearProviders().AddJsonConsole(o => o.JsonWriterOptions = new() { Encoder = System.Text.Encodings.Web.JavaScriptEncoder.UnsafeRelaxedJsonEscaping });
// Samme grense som nginx (client_max_body_size 10m).
builder.WebHost.ConfigureKestrel(o => o.Limits.MaxRequestBodySize = 10 * 1024 * 1024);
builder.Services.AddHsts(o => { o.MaxAge = TimeSpan.FromDays(365); o.IncludeSubDomains = true; });
builder.Services.AddProblemDetails();
builder.Services.AddSingleton<Db>();
builder.Services.AddSingleton<Jwt>();
builder.Services.AddScoped<OtpService>();
builder.Services.AddScoped<Notifier>();
builder.Services.AddScoped<Coverage>();
builder.Services.AddHttpClient<Geo>();
// Opplastinger bufres i minnet, aldri som temp-fil (krav: ingen lokal disk).
builder.Services.Configure<FormOptions>(o =>
{
    o.MemoryBufferThreshold = PhotoEndpoints.MaxBytes + 512_000;
    o.MultipartBodyLengthLimit = PhotoEndpoints.MaxBytes + 512_000;
});
if (builder.Configuration["Sms:Provider"] == "Twilio") builder.Services.AddHttpClient<ISmsSender, TwilioSmsSender>();
else builder.Services.AddSingleton<ConsoleSmsSender>().AddSingleton<ISmsSender>(sp => sp.GetRequiredService<ConsoleSmsSender>());
if (builder.Configuration["Mail:Provider"] == "Smtp") builder.Services.AddSingleton<IMailSender, SmtpMailSender>();
else builder.Services.AddSingleton<ConsoleMailSender>().AddSingleton<IMailSender>(sp => sp.GetRequiredService<ConsoleMailSender>());
if (builder.Configuration["Push:Provider"] == "WebPush" && !string.IsNullOrEmpty(builder.Configuration["Push:PrivateKey"])) builder.Services.AddSingleton<IPushSender, WebPushSender>();
else builder.Services.AddSingleton<ConsolePushSender>().AddSingleton<IPushSender>(sp => sp.GetRequiredService<ConsolePushSender>());

builder.Services.AddAuthentication().AddJwtBearer(o =>
{
    o.MapInboundClaims = false;
    o.TokenValidationParameters = new TokenValidationParameters
    {
        ValidIssuer = Jwt.Issuer,
        ValidAudience = Jwt.Issuer,
        IssuerSigningKey = Jwt.Key(builder.Configuration),
        RoleClaimType = "roles",
        NameClaimType = "sub",
    };
});
builder.Services.AddAuthorizationBuilder()
    .AddPolicy("user", p => p.RequireClaim("sub"))
    .AddPolicy("super", p => p.RequireRole("super"));
builder.Services.AddRateLimiter(o =>
{
    o.RejectionStatusCode = 429;
    o.AddPolicy("auth", ctx => RateLimitPartition.GetFixedWindowLimiter(ctx.Connection.RemoteIpAddress?.ToString() ?? "ukjent",
        _ => new FixedWindowRateLimiterOptions { PermitLimit = builder.Configuration.GetValue("App:AuthRateLimitPerMinute", 30), Window = TimeSpan.FromMinutes(1) }));
    o.AddPolicy("client-errors", ctx => RateLimitPartition.GetFixedWindowLimiter(ctx.Connection.RemoteIpAddress?.ToString() ?? "ukjent",
        _ => new FixedWindowRateLimiterOptions { PermitLimit = 20, Window = TimeSpan.FromMinutes(1) }));
});
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

if (app.Configuration.GetValue<bool>("App:DevEndpoints")) app.Logger.LogWarning("App__DevEndpoints er på – dev-endepunkter (innloggingskoder, demo-reset) er åpne. Skal aldri være satt i Dokploy.");

app.UseForwardedHeaders();
if (!app.Environment.IsDevelopment()) app.UseHsts(); // bare over https (X-Forwarded-Proto fra Traefik)
app.Use((ctx, next) =>
{
    ctx.Response.Headers.XContentTypeOptions = "nosniff";
    return next();
});
app.UseExceptionHandler();
app.UseStatusCodePages();
app.UseRateLimiter();
app.UseAuthentication();
app.UseAuthorization();

var db = app.Services.GetRequiredService<Db>();
await db.EnsureIndexes();
await Seeder.Run(db, app.Configuration, app.Logger);

app.MapGet("/health", () => Results.Ok(new { ok = true }));
app.MapGet("/ready", async () =>
{
    try { await db.Ping(); return Results.Ok(new { ok = true, db = true }); }
    catch { return Results.Json(new { ok = false, db = false }, statusCode: 503); }
});
app.MapAuth();
app.MapReference();
app.MapCompanies();
app.MapPhotos();
app.MapPickups();
app.MapRoutes();
app.MapSuper();
app.MapNotifications();
app.MapExport();
// Feil fra frontend (ErrorHandler): bare melding, sti og versjon – logges, lagres ikke.
app.MapPost("/api/client-errors", (ClientError e, ILogger<ClientError> log) =>
{
    log.LogWarning("Klientfeil {Version} {Url}: {Message}", Trim(e.Version, 20), Trim(e.Url, 200), Trim(e.Message, 500));
    return Results.NoContent();
    static string Trim(string? s, int max) => (s ?? "").ReplaceLineEndings(" ") is var t && t.Length > max ? t[..max] : t;
}).RequireRateLimiting("client-errors");

app.Run();

record ClientError(string? Message, string? Url, string? Version);

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
