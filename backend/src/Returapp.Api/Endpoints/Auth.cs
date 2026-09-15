using Microsoft.AspNetCore.Identity;
using MongoDB.Bson;
using MongoDB.Driver;
using Returapp.Api.Models;
using Returapp.Api.Services;

namespace Returapp.Api.Endpoints;

public static class AuthEndpoints
{
    public record PhoneBody(string Phone);
    public record VerifyBody(string Phone, string Code);
    public record LoginBody(string Email, string Password);
    public record TokenBody(string RefreshToken);
    public record EmailBody(string Email);
    public record ResetBody(string Token, string Password);
    public record InviteAcceptBody(string Token, string? Name, string? Password);
    public record DevCleanup(List<string>? PickupIds, List<string>? Phones, List<string>? CompanyIds, List<string>? Emails);
    public record MePatch(string? Name, string? Org, string? Email, string? Phone, string? PhoneCode, string? Postnr, string? Theme, Notif? Notif);

    static readonly PasswordHasher<User> Hasher = new();

    public static IResult Err(int status, string title) => Results.Problem(title: title, statusCode: status);

    public static void MapAuth(this WebApplication app)
    {
        var auth = app.MapGroup("/api/auth").RequireRateLimiting("auth");

        auth.MapPost("/otp/send", async (PhoneBody b, OtpService otp) =>
        {
            var phone = Phone.Normalize(b.Phone);
            if (phone == null) return Err(400, "Skriv inn et gyldig mobilnummer");
            return await otp.Send(phone) is { } e ? Err(e.Status, e.Title) : Results.Ok(new { phone });
        });

        auth.MapPost("/otp/verify", async (VerifyBody b, OtpService otp, Db db, Jwt jwt) =>
        {
            var phone = Phone.Normalize(b.Phone);
            if (phone == null) return Err(400, "Skriv inn et gyldig mobilnummer");
            if (await otp.Verify(phone, b.Code) is { } e) return Err(e.Status, e.Title);

            var user = await db.Users.Find(u => u.Phone == phone).FirstOrDefaultAsync();
            if (user == null)
            {
                user = new User { Phone = phone, Roles = new() { Giver = true }, CreatedAt = DateTime.UtcNow, UpdatedAt = DateTime.UtcNow };
                await db.Users.InsertOneAsync(user);
            }
            if (!user.Active) return Err(403, "Kontoen er deaktivert");
            // Gjest-ordre med samme mobilnummer blir brukerens egne ("Opprett konto" gir historikken).
            await db.Pickups.UpdateManyAsync(p => p.GuestPhone == phone && p.GiverUserId == null, Builders<Pickup>.Update.Set(p => p.GiverUserId, user.Id));
            return Results.Ok(await Issue(db, jwt, user));
        });

        auth.MapPost("/login", async (LoginBody b, Db db, Jwt jwt) =>
        {
            var email = b.Email?.Trim().ToLowerInvariant();
            var user = await db.Users.Find(u => u.Email == email).FirstOrDefaultAsync();
            if (user?.PasswordHash == null || Hasher.VerifyHashedPassword(user, user.PasswordHash, b.Password ?? "") == PasswordVerificationResult.Failed)
                return Err(401, "Feil e-post eller passord");
            if (!user.Active) return Err(403, "Kontoen er deaktivert");
            return Results.Ok(await Issue(db, jwt, user));
        });

        auth.MapPost("/refresh", async (TokenBody b, Db db, Jwt jwt) =>
        {
            var hash = Jwt.Hash(b.RefreshToken ?? "");
            var user = await db.Users.FindOneAndUpdateAsync(
                u => u.RefreshTokens.Any(t => t.Hash == hash && t.Expires > DateTime.UtcNow),
                Builders<User>.Update.PullFilter(u => u.RefreshTokens, t => t.Hash == hash)); // roterer: gammelt token kan aldri brukes igjen
            if (user == null || !user.Active) return Err(401, "Innloggingen er utløpt");
            return Results.Ok(await Issue(db, jwt, user));
        });

        auth.MapPost("/logout", async (TokenBody b, Db db) =>
        {
            var hash = Jwt.Hash(b.RefreshToken ?? "");
            await db.Users.UpdateOneAsync(u => u.RefreshTokens.Any(t => t.Hash == hash), Builders<User>.Update.PullFilter(u => u.RefreshTokens, t => t.Hash == hash));
            return Results.NoContent();
        });

        auth.MapPost("/guest", (Jwt jwt) => Results.Ok(new { accessToken = jwt.Guest(ObjectId.GenerateNewId().ToString()), guest = true }));

        auth.MapPost("/forgot", async (EmailBody b, Db db, IMailSender mail, IConfiguration cfg) =>
        {
            var email = b.Email?.Trim().ToLowerInvariant();
            var user = await db.Users.Find(u => u.Email == email && u.Active).FirstOrDefaultAsync();
            if (user != null) await SendReset(db, mail, cfg, user);
            return Results.Ok(); // samme svar uansett, så e-postadresser ikke kan kartlegges
        });

        auth.MapPost("/reset", async (ResetBody b, Db db) =>
        {
            if ((b.Password ?? "").Length < 8) return Err(400, "Passordet må ha minst 8 tegn");
            var reset = await db.PasswordResets.FindOneAndDeleteAsync(r => r.TokenHash == Jwt.Hash(b.Token ?? "") && r.Expires > DateTime.UtcNow);
            if (reset == null) return Err(400, "Lenken er ugyldig eller utløpt");
            var user = await db.Users.Find(u => u.Id == reset.UserId).FirstAsync();
            await db.Users.UpdateOneAsync(u => u.Id == user.Id, Builders<User>.Update
                .Set(u => u.PasswordHash, Hasher.HashPassword(user, b.Password!))
                .Set(u => u.RefreshTokens, [])
                .Set(u => u.UpdatedAt, DateTime.UtcNow));
            return Results.Ok();
        });

        auth.MapGet("/invite/{token}", async (string token, Db db) =>
        {
            var inv = await ValidInvite(db, token);
            if (inv == null) return Err(404, "Invitasjonen er ugyldig eller utløpt");
            var company = inv.CompanyId == null ? null : await db.Companies.Find(c => c.Id == inv.CompanyId).Project(c => c.Name).FirstOrDefaultAsync();
            return Results.Ok(new { inv.Name, inv.Phone, inv.Email, inv.Roles, companyName = company, needsPassword = inv.Email != null });
        });

        auth.MapPost("/invite/accept", async (InviteAcceptBody b, Db db, Jwt jwt) =>
        {
            var inv = await ValidInvite(db, b.Token);
            if (inv == null) return Err(400, "Invitasjonen er ugyldig eller utløpt");
            var name = (b.Name ?? inv.Name ?? "").Trim();
            if (name.Length < 2) return Err(400, "Skriv inn navnet ditt");
            if (b.Password != null && b.Password.Length < 8) return Err(400, "Passordet må ha minst 8 tegn");

            var user = inv.Phone != null
                ? await db.Users.Find(u => u.Phone == inv.Phone).FirstOrDefaultAsync()
                : await db.Users.Find(u => u.Email == inv.Email).FirstOrDefaultAsync();
            user ??= new User { Id = ObjectId.GenerateNewId().ToString(), Phone = inv.Phone, Email = inv.Email, CreatedAt = DateTime.UtcNow };
            user.Name = name;
            user.Roles = new() { Giver = user.Roles.Giver || inv.Roles.Giver, Driver = user.Roles.Driver || inv.Roles.Driver, Admin = user.Roles.Admin || inv.Roles.Admin, Super = user.Roles.Super || inv.Roles.Super };
            user.CompanyId = inv.CompanyId ?? user.CompanyId;
            user.Vehicle = inv.Vehicle ?? user.Vehicle;
            user.Areas = inv.Areas ?? user.Areas;
            if (user.CompanyId != null && string.IsNullOrEmpty(user.Org))
                user.Org = await db.Companies.Find(c => c.Id == user.CompanyId).Project(c => c.Name).FirstOrDefaultAsync() ?? "";
            if (b.Password != null && user.Email != null) user.PasswordHash = Hasher.HashPassword(user, b.Password);
            user.Active = true;
            user.UpdatedAt = DateTime.UtcNow;
            await db.Users.ReplaceOneAsync(u => u.Id == user.Id, user, new ReplaceOptions { IsUpsert = true });
            await db.Invites.UpdateOneAsync(i => i.Id == inv.Id, Builders<Invite>.Update.Set(i => i.UsedAt, DateTime.UtcNow));
            return Results.Ok(await Issue(db, jwt, user));
        });

        var me = app.MapGroup("/api/me").RequireAuthorization("user");

        me.MapGet("", async (HttpContext ctx, Db db) =>
        {
            var user = await db.Users.Find(u => u.Id == ctx.User.Caller().UserId).FirstOrDefaultAsync();
            return user == null ? Err(401, "Innloggingen er utløpt") : Results.Ok(await Me(db, user));
        });

        me.MapPatch("", async (MePatch b, HttpContext ctx, Db db, OtpService otp) =>
        {
            var id = ctx.User.Caller().UserId;
            var user = await db.Users.Find(u => u.Id == id).FirstAsync();
            var set = new List<UpdateDefinition<User>> { Builders<User>.Update.Set(u => u.UpdatedAt, DateTime.UtcNow) };
            if (b.Name != null) set.Add(Builders<User>.Update.Set(u => u.Name, b.Name.Trim()));
            if (b.Org != null) set.Add(Builders<User>.Update.Set(u => u.Org, b.Org.Trim()));
            if (b.Email != null)
            {
                var email = b.Email.Trim().ToLowerInvariant();
                if (email.Length > 0 && !email.Contains('@')) return Err(400, "Ugyldig e-postadresse");
                set.Add(email.Length == 0 ? Builders<User>.Update.Unset(u => u.Email) : Builders<User>.Update.Set(u => u.Email, email));
            }
            if (b.Phone != null)
            {
                var phone = Phone.Normalize(b.Phone);
                if (phone == null) return Err(400, "Skriv inn et gyldig mobilnummer");
                if (phone != user.Phone)
                {
                    // Nytt nummer må bekreftes med kode sendt til nummeret, ellers kan man overta andres SMS-innlogging.
                    if (b.PhoneCode == null) return Err(400, "Bekreft nytt mobilnummer med koden vi sendte på SMS");
                    if (await otp.Verify(phone, b.PhoneCode) is { } e) return Err(e.Status, e.Title);
                    set.Add(Builders<User>.Update.Set(u => u.Phone, phone));
                }
            }
            if (b.Postnr != null)
            {
                if (b.Postnr.Length != 4 || !b.Postnr.All(char.IsDigit)) return Err(400, "Postnummer må ha 4 siffer");
                set.Add(Builders<User>.Update.Set(u => u.Postnr, b.Postnr));
            }
            if (b.Theme != null)
            {
                if (b.Theme is not ("light" or "dark")) return Err(400, "Ugyldig tema");
                set.Add(Builders<User>.Update.Set(u => u.Theme, b.Theme));
            }
            if (b.Notif != null) set.Add(Builders<User>.Update.Set(u => u.Notif, b.Notif));
            try
            {
                user = await db.Users.FindOneAndUpdateAsync(u => u.Id == id, Builders<User>.Update.Combine(set), new FindOneAndUpdateOptions<User> { ReturnDocument = ReturnDocument.After });
            }
            catch (MongoCommandException ex) when (ex.Code == 11000)
            {
                return Err(409, "E-postadressen eller mobilnummeret er allerede i bruk");
            }
            return Results.Ok(await Me(db, user));
        });

        if (app.Configuration.GetValue<bool>("App:DevEndpoints"))
        {
            // Kun lokalt og i tester: leser OTP-koder og lenker fra Console-senderne. Aldri i Dokploy.
            app.MapGet("/api/dev/last-sms", (string phone, IServiceProvider sp) =>
                sp.GetService<ConsoleSmsSender>()?.Last.GetValueOrDefault(Phone.Normalize(phone) ?? phone) is { } text ? Results.Ok(new { text }) : Results.NotFound());
            app.MapGet("/api/dev/last-mail", (string to, IServiceProvider sp) =>
                sp.GetService<ConsoleMailSender>()?.Last.GetValueOrDefault(to.ToLowerInvariant()) is { } m ? Results.Ok(new { m.Subject, m.Body }) : Results.NotFound());
            // E2E-tester rydder egne data: ordre merket "[e2e]" (med bilder og varsler), og SMS-brukere/varsel-abonnement for testnummer.
            app.MapPost("/api/dev/reset-demo", async (Db db, ILogger<DevCleanup> log) =>
            {
                await Seed.Seeder.ResetDemo(db, log);
                return Results.Ok();
            });
            app.MapPost("/api/dev/cleanup", async (DevCleanup b, Db db) =>
            {
                var ids = await db.Pickups.Find(p => (b.PickupIds ?? new()).Contains(p.Id) && p.Desc.StartsWith("[e2e]")).Project(p => p.Id).ToListAsync();
                await db.Pickups.DeleteManyAsync(p => ids.Contains(p.Id));
                await db.Files.DeleteManyAsync(f => ids.Contains(f.PickupId!));
                await db.Notifications.DeleteManyAsync(n => ids.Contains(n.PickupId!));
                var phones = (b.Phones ?? new()).Select(Phone.Normalize).OfType<string>().ToList();
                var users = await db.Users.DeleteManyAsync(u => phones.Contains(u.Phone!) && u.Email == null && u.Name == "");
                await db.CoverageAlerts.DeleteManyAsync(a => phones.Contains(a.Phone!));
                // Inviterte e2e-brukere: bare adresser på @test.returapp.no.
                var emails = (b.Emails ?? new()).Select(e => e.ToLowerInvariant()).Where(e => e.EndsWith("@test.returapp.no")).ToList();
                var emailUsers = await db.Users.Find(u => emails.Contains(u.Email!)).Project(u => u.Id).ToListAsync();
                await db.PasswordResets.DeleteManyAsync(r => emailUsers.Contains(r.UserId));
                await db.Notifications.DeleteManyAsync(n => emailUsers.Contains(n.UserId));
                await db.Invites.DeleteManyAsync(i => emails.Contains(i.Email!));
                await db.Users.DeleteManyAsync(u => emailUsers.Contains(u.Id));
                var companies = await db.Companies.Find(c => (b.CompanyIds ?? new()).Contains(c.Id) && c.Name.StartsWith("E2E ")).Project(c => c.Id).ToListAsync();
                await db.Companies.DeleteManyAsync(c => companies.Contains(c.Id));
                await db.Invites.DeleteManyAsync(i => companies.Contains(i.CompanyId!));
                await db.Support.DeleteManyAsync(s => s.Text.Contains("E2E "));
                await db.Notices.DeleteManyAsync(n => n.Text.StartsWith("[e2e]"));
                await db.Notifications.DeleteManyAsync(n => n.Body.StartsWith("[e2e]") || n.Body.Contains("E2E "));
                return Results.Ok(new { pickups = ids.Count, users = users.DeletedCount });
            });
        }
    }

    public static async Task SendReset(Db db, IMailSender mail, IConfiguration cfg, User user)
    {
        var (token, hash) = Jwt.NewToken();
        await db.PasswordResets.InsertOneAsync(new PasswordReset { UserId = user.Id, TokenHash = hash, CreatedAt = DateTime.UtcNow, Expires = DateTime.UtcNow.AddHours(1) });
        await mail.Send(new Mail(user.Email!, "Nytt passord til Returapp",
            $"Hei {user.Name}!\n\nTrykk på lenken for å velge nytt passord (gyldig i 1 time):\n{cfg["App:BaseUrl"]}/reset/{token}\n\nHar du ikke bedt om dette, kan du se bort fra e-posten."));
    }

    static Task<Invite?> ValidInvite(Db db, string? token) =>
        db.Invites.Find(i => i.TokenHash == Jwt.Hash(token ?? "") && i.UsedAt == null && i.Expires > DateTime.UtcNow).FirstOrDefaultAsync()!;

    static async Task<object> Issue(Db db, Jwt jwt, User user)
    {
        var (token, hash) = Jwt.NewToken();
        await db.Users.UpdateOneAsync(u => u.Id == user.Id,
            Builders<User>.Update.PushEach(u => u.RefreshTokens, [new RefreshToken(hash, DateTime.UtcNow.AddDays(jwt.RefreshDays))], slice: -10));
        return new { accessToken = jwt.Access(user), refreshToken = token, user = await Me(db, user) };
    }

    public static async Task<object> Me(Db db, User u)
    {
        var company = u.CompanyId == null ? null : await db.Companies.Find(c => c.Id == u.CompanyId).Project(c => new { c.Id, c.Name }).FirstOrDefaultAsync();
        return new { u.Id, u.Name, u.Email, u.Phone, u.Org, u.Roles, u.CompanyId, company, u.Postnr, u.Theme, u.Notif, u.Vehicle, u.Areas, pushDevices = u.PushSubscriptions.Count };
    }
}
