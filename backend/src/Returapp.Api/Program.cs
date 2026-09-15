using System.Globalization;
using System.Threading.RateLimiting;
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
DotEnv.Load();

var builder = WebApplication.CreateBuilder(args);
builder.Services.AddProblemDetails();
builder.Services.AddSingleton<Db>();
builder.Services.AddSingleton<Jwt>();
builder.Services.AddScoped<OtpService>();
if (builder.Configuration["Sms:Provider"] == "Twilio") builder.Services.AddHttpClient<ISmsSender, TwilioSmsSender>();
else builder.Services.AddSingleton<ConsoleSmsSender>().AddSingleton<ISmsSender>(sp => sp.GetRequiredService<ConsoleSmsSender>());
if (builder.Configuration["Mail:Provider"] == "Smtp") builder.Services.AddSingleton<IMailSender, SmtpMailSender>();
else builder.Services.AddSingleton<ConsoleMailSender>().AddSingleton<IMailSender>(sp => sp.GetRequiredService<ConsoleMailSender>());

builder.Services.AddAuthentication().AddJwtBearer(o =>
{
    o.MapInboundClaims = false;
    o.TokenValidationParameters = new TokenValidationParameters
    {
        ValidIssuer = Jwt.Issuer(builder.Configuration),
        ValidAudience = Jwt.Issuer(builder.Configuration),
        IssuerSigningKey = Jwt.Key(builder.Configuration),
        RoleClaimType = "roles",
        NameClaimType = "sub",
    };
});
builder.Services.AddAuthorizationBuilder()
    .AddPolicy("user", p => p.RequireClaim("sub"))
    .AddPolicy("giver", p => p.RequireRole("giver"))
    .AddPolicy("driver", p => p.RequireRole("driver"))
    .AddPolicy("admin", p => p.RequireRole("admin"))
    .AddPolicy("super", p => p.RequireRole("super"));
builder.Services.AddRateLimiter(o =>
{
    o.RejectionStatusCode = 429;
    o.AddPolicy("auth", ctx => RateLimitPartition.GetFixedWindowLimiter(ctx.Connection.RemoteIpAddress?.ToString() ?? "ukjent",
        _ => new FixedWindowRateLimiterOptions { PermitLimit = builder.Configuration.GetValue("App:AuthRateLimitPerMinute", 30), Window = TimeSpan.FromMinutes(1) }));
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

app.UseForwardedHeaders();
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
app.MapSupport();

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
