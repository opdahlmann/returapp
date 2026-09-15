using System.Text.RegularExpressions;
using MongoDB.Bson;
using MongoDB.Driver;
using Returapp.Api.Models;
using Returapp.Api.Services;

namespace Returapp.Api.Endpoints;

public static class SuperEndpoints
{
    public record UserPatch(Roles? Roles, bool? Active, string? CompanyId);
    public record UserInvite(string? Name, string? Email, string? Phone, Roles? Roles, string? CompanyId);
    public record NoticeBody(string? Text, string? To);
    public record ReplyBody(string? Text);
    public record SupportBody(string? Text);
    public record ApplyBody(string? Name, string? Orgnr, string? City, string? Phone, string? ContactName, string? Email, List<string>? Kommuner);

    public static void MapSuper(this WebApplication app)
    {
        var s = app.MapGroup("/api").RequireAuthorization("super");

        s.MapGet("/stats/platform", async (Db db) =>
        {
            var monthStart = TimeZoneInfo.ConvertTimeToUtc(new DateTime(Fmt.Local(DateTime.UtcNow).Year, Fmt.Local(DateTime.UtcNow).Month, 1), Fmt.Oslo);
            var totals = await db.Pickups.Aggregate().Match(p => p.Status == PickupStatus.Hentet).Group(p => 1, g => new { Kg = g.Sum(p => p.EstKg), Count = g.Count() }).FirstOrDefaultAsync();
            var pending = await db.Companies.Find(c => c.Status == CompanyStatus.Venter).SortBy(c => c.CreatedAt).ToListAsync();
            var latestSupport = await db.Support.Find(x => x.Open).SortByDescending(x => x.CreatedAt).FirstOrDefaultAsync();
            return Results.Ok(new
            {
                monthCount = await db.Pickups.CountDocumentsAsync(p => p.Status == PickupStatus.Hentet && p.PickedAt >= monthStart),
                totalKg = totals?.Kg ?? 0,
                activeCompanies = await db.Companies.CountDocumentsAsync(c => c.Status == CompanyStatus.Aktiv),
                users = await db.Users.CountDocumentsAsync(u => u.Active),
                pendingCompanies = pending.Select(c => new { c.Id, c.Name, c.Coverage }),
                noCompany = await db.Pickups.CountDocumentsAsync(p => p.CompanyId == null && p.Status == PickupStatus.Ny),
                openSupport = await db.Support.CountDocumentsAsync(x => x.Open),
                latestSupport = latestSupport?.Text,
            });
        });

        s.MapGet("/companies", async (Db db) =>
        {
            var companies = await db.Companies.Find(_ => true).ToListAsync();
            var orders = (await db.Pickups.Aggregate().Match(p => p.CompanyId != null).Group(p => p.CompanyId, g => new { Id = g.Key, Count = g.Count() }).ToListAsync()).ToDictionary(x => x.Id!, x => x.Count);
            // Registreringsrekkefølge som i designet (nye søknader nederst; «Trenger deg» på oversikten peker dit).
            return Results.Ok(companies.OrderBy(c => c.CreatedAt).Select(c => new
            {
                c.Id, c.Name, c.City, c.Orgnr, c.Phone, c.Status, c.Since, c.CreatedAt, c.Coverage, c.Departments, c.ContactName, c.ContactEmail, c.ContactPhone,
                orders = orders.GetValueOrDefault(c.Id),
            }));
        });

        s.MapPost("/companies/{id}/approve", async (string id, HttpContext ctx, Db db, Coverage coverage, Notifier notify, IMailSender mail, IConfiguration cfg) =>
        {
            var company = await db.Companies.FindOneAndUpdateAsync(c => c.Id == id && c.Status != CompanyStatus.Aktiv,
                Builders<Company>.Update.Set(c => c.Status, CompanyStatus.Aktiv).Set(c => c.Since, DateTime.UtcNow).Set(c => c.UpdatedAt, DateTime.UtcNow),
                new FindOneAndUpdateOptions<Company> { ReturnDocument = ReturnDocument.After });
            if (company == null) return AuthEndpoints.Err(409, "Firmaet er allerede godkjent eller finnes ikke");
            await coverage.Added(company, company.Coverage);
            await notify.CompanyAdmins(company.Id, "company.approved", "Firmaet er godkjent", $"{company.Name} kan nå motta oppdrag i Returapp.");
            // Søknad uten admin-bruker: kontaktpersonen får invitasjon som retur-admin.
            if (!await db.Users.Find(u => u.CompanyId == id && u.Roles.Admin).AnyAsync() && (company.ContactEmail != null || company.ContactPhone != null))
                await SendInvite(db, notify, mail, cfg, ctx.User.Caller().UserId, company.ContactName, company.ContactEmail, company.ContactPhone, new Roles { Admin = true }, id,
                    $"{company.Name} er godkjent som hentefirma i Returapp.");
            return Results.Ok();
        });

        s.MapPost("/companies/{id}/reject", async (string id, Db db) =>
            (await db.Companies.UpdateOneAsync(c => c.Id == id && c.Status == CompanyStatus.Venter, Builders<Company>.Update.Set(c => c.Status, CompanyStatus.Avvist).Set(c => c.UpdatedAt, DateTime.UtcNow))).ModifiedCount == 0
                ? AuthEndpoints.Err(409, "Bare ventende søknader kan avvises") : Results.Ok());

        s.MapGet("/users", async (string? q, Db db) =>
        {
            var filter = Builders<User>.Filter.Empty;
            if (!string.IsNullOrWhiteSpace(q))
            {
                var rx = new BsonRegularExpression(Regex.Escape(q.Trim()), "i");
                filter = Builders<User>.Filter.Or(Builders<User>.Filter.Regex(u => u.Name, rx), Builders<User>.Filter.Regex(u => u.Email, rx), Builders<User>.Filter.Regex(u => u.Org, rx), Builders<User>.Filter.Regex(u => u.Phone, rx));
            }
            // Registreringsrekkefølge som i designet. ponytail: maks 50 uten søk – legg til paging når brukerlisten vokser.
            var users = await db.Users.Find(filter).SortBy(u => u.CreatedAt).ThenBy(u => u.Id).Limit(50).ToListAsync();
            var companyIds = users.Select(u => u.CompanyId).OfType<string>().Distinct().ToList();
            var names = (await db.Companies.Find(c => companyIds.Contains(c.Id)).ToListAsync()).ToDictionary(c => c.Id, c => c.Name);
            return Results.Ok(users.Select(u => new { u.Id, u.Name, u.Email, u.Phone, u.Org, u.Roles, u.CompanyId, companyName = u.CompanyId == null ? null : names.GetValueOrDefault(u.CompanyId), u.Active }));
        });

        s.MapPatch("/users/{id}", async (string id, UserPatch b, HttpContext ctx, Db db) =>
        {
            var me = ctx.User.Caller();
            if (id == me.UserId && (b.Roles is { Super: false } || b.Active == false)) return AuthEndpoints.Err(400, "Du kan ikke fjerne din egen superbruker-tilgang");
            var set = new List<UpdateDefinition<User>> { Builders<User>.Update.Set(u => u.UpdatedAt, DateTime.UtcNow) };
            if (b.Roles != null) set.Add(Builders<User>.Update.Set(u => u.Roles, b.Roles));
            if (b.Active != null)
            {
                set.Add(Builders<User>.Update.Set(u => u.Active, b.Active.Value));
                if (!b.Active.Value) set.Add(Builders<User>.Update.Set(u => u.RefreshTokens, []));
            }
            if (b.CompanyId != null)
            {
                if (b.CompanyId != "" && !await db.Companies.Find(c => c.Id == b.CompanyId).AnyAsync()) return AuthEndpoints.Err(400, "Ukjent firma");
                set.Add(b.CompanyId == "" ? Builders<User>.Update.Unset(u => u.CompanyId) : Builders<User>.Update.Set(u => u.CompanyId, b.CompanyId));
            }
            var user = await db.Users.FindOneAndUpdateAsync(u => u.Id == id, Builders<User>.Update.Combine(set), new FindOneAndUpdateOptions<User> { ReturnDocument = ReturnDocument.After });
            return user == null ? AuthEndpoints.Err(404, "Fant ikke brukeren") : Results.Ok(new { user.Id, user.Roles, user.Active, user.CompanyId });
        });

        s.MapPost("/users/invite", async (UserInvite b, HttpContext ctx, Db db, Notifier notify, IMailSender mail, IConfiguration cfg) =>
        {
            var email = b.Email?.Trim().ToLowerInvariant();
            var phone = Phone.Normalize(b.Phone);
            if ((b.Name ?? "").Trim().Length < 2 || (email is not { } && phone == null) || (email != null && !email.Contains('@'))) return AuthEndpoints.Err(400, "Skriv inn navn og e-post eller mobilnummer");
            if (b.Roles == null || !(b.Roles.Giver || b.Roles.Driver || b.Roles.Admin || b.Roles.Super)) return AuthEndpoints.Err(400, "Velg minst én rolle");
            if ((b.Roles.Driver || b.Roles.Admin) && b.CompanyId == null) return AuthEndpoints.Err(400, "Sjåfør og admin må knyttes til et firma");
            await SendInvite(db, notify, mail, cfg, ctx.User.Caller().UserId, b.Name!.Trim(), email, email == null ? phone : null, b.Roles, b.CompanyId, "Du er invitert til Returapp.");
            return Results.Ok();
        });

        s.MapPost("/users/{id}/reset-password", async (string id, Db db, IMailSender mail, IConfiguration cfg) =>
        {
            var user = await db.Users.Find(u => u.Id == id).FirstOrDefaultAsync();
            if (user == null) return AuthEndpoints.Err(404, "Fant ikke brukeren");
            if (user.Email == null) return AuthEndpoints.Err(400, "Brukeren har ingen e-post og logger inn med SMS");
            await AuthEndpoints.SendReset(db, mail, cfg, user);
            return Results.Ok();
        });

        s.MapGet("/notices", async (Db db) => Results.Ok(await db.Notices.Find(_ => true).SortByDescending(n => n.CreatedAt).Limit(50).ToListAsync()));

        s.MapPost("/notices", async (NoticeBody b, HttpContext ctx, Db db, Notifier notify) =>
        {
            var text = (b.Text ?? "").Trim();
            if (text.Length < 3 || text.Length > 500) return AuthEndpoints.Err(400, "Skriv en melding først");
            var notice = new Notice { Text = text, To = b.To == "hentefirma" ? "hentefirma" : "alle", SentByUserId = ctx.User.Caller().UserId, CreatedAt = DateTime.UtcNow };
            await db.Notices.InsertOneAsync(notice);
            var recipients = notice.To == "hentefirma"
                ? await db.Users.Find(u => u.Active && (u.Roles.Admin || u.Roles.Driver)).Project(u => u.Id).ToListAsync()
                : await db.Users.Find(u => u.Active).Project(u => u.Id).ToListAsync();
            await db.Notifications.InsertManyAsync(recipients.Select(id => new Notification { UserId = id, Type = "notice", Title = "Systemvarsel", Body = text, CreatedAt = notice.CreatedAt }));
            await notify.PushMany(recipients, "Systemvarsel", text, "/");
            return Results.Ok(notice);
        });

        app.MapPost("/api/support", async (SupportBody b, HttpContext ctx, Db db) =>
        {
            var text = (b.Text ?? "").Trim();
            if (text.Length < 3 || text.Length > 2000) return AuthEndpoints.Err(400, "Skriv hva det gjelder (maks 2000 tegn)");
            var user = await db.Users.Find(u => u.Id == ctx.User.Caller().UserId).FirstAsync();
            var org = user.CompanyId == null ? user.Org : await db.Companies.Find(c => c.Id == user.CompanyId).Project(c => c.Name).FirstOrDefaultAsync() ?? user.Org;
            var sc = new SupportCase { FromUserId = user.Id, FromName = user.Name, Org = org, Text = text, CreatedAt = DateTime.UtcNow, UpdatedAt = DateTime.UtcNow };
            await db.Support.InsertOneAsync(sc);
            return Results.Created($"/api/support/{sc.Id}", new { sc.Id });
        }).RequireAuthorization("user");

        s.MapGet("/support", async (Db db) => Results.Ok(await db.Support.Find(_ => true).SortByDescending(x => x.CreatedAt).Limit(100).ToListAsync()));

        s.MapPost("/support/{id}/reply", async (string id, ReplyBody b, HttpContext ctx, Db db, Notifier notify) =>
        {
            var text = (b.Text ?? "").Trim();
            if (text.Length < 2) return AuthEndpoints.Err(400, "Skriv et svar");
            var sc = await db.Support.FindOneAndUpdateAsync(x => x.Id == id, Builders<SupportCase>.Update.Push(x => x.Replies, new SupportReply(ctx.User.Caller().UserId!, text, DateTime.UtcNow)).Set(x => x.UpdatedAt, DateTime.UtcNow),
                new FindOneAndUpdateOptions<SupportCase> { ReturnDocument = ReturnDocument.After });
            if (sc == null) return AuthEndpoints.Err(404, "Fant ikke saken");
            if (sc.FromUserId != null) await notify.User(sc.FromUserId, "support.reply", "Svar fra Returapp support", text, channels: Channels.Email | Channels.Sms);
            return Results.Ok(sc);
        });

        s.MapPost("/support/{id}/close", async (string id, Db db) =>
            (await db.Support.UpdateOneAsync(x => x.Id == id, Builders<SupportCase>.Update.Set(x => x.Open, false).Set(x => x.UpdatedAt, DateTime.UtcNow))).MatchedCount == 0
                ? AuthEndpoints.Err(404, "Fant ikke saken") : Results.Ok());

        // Aktive systemvarsler (siste 24 t) for innlogget bruker – «hentefirma» bare for admin/sjåfør.
        app.MapGet("/api/notices/active", async (HttpContext ctx, Db db) =>
        {
            var c = ctx.User.Caller();
            var since = DateTime.UtcNow.AddHours(-24);
            var firm = c.Has("admin") || c.Has("driver");
            return Results.Ok(await db.Notices.Find(n => n.CreatedAt >= since && (n.To == "alle" || firm)).SortByDescending(n => n.CreatedAt).ToListAsync());
        }).RequireAuthorization();

        // Offentlig søknad om å bli hentefirma – lenkes fra «Del lenke til Returapp».
        app.MapPost("/api/companies/apply", async (ApplyBody b, Db db, Notifier notify) =>
        {
            var email = b.Email?.Trim().ToLowerInvariant();
            var phone = Phone.Normalize(b.Phone);
            var orgnr = new string((b.Orgnr ?? "").Where(char.IsDigit).ToArray());
            if ((b.Name ?? "").Trim().Length < 2 || orgnr.Length != 9 || (b.City ?? "").Trim().Length < 2 || phone == null || (b.ContactName ?? "").Trim().Length < 2 || email is null || !email.Contains('@'))
                return AuthEndpoints.Err(400, "Fyll ut alle feltene (org.nr har 9 siffer)");
            var known = await ReferenceEndpoints.PostnrPerKommune(db);
            var kommuner = (b.Kommuner ?? []).Where(known.ContainsKey).Distinct().ToList();
            if (kommuner.Count == 0) return AuthEndpoints.Err(400, "Velg minst én kommune dere kan hente i");
            if (await db.Companies.Find(c => c.Orgnr == orgnr && c.Status != CompanyStatus.Avvist).AnyAsync()) return AuthEndpoints.Err(409, "Firmaet er allerede registrert");
            var company = new Company
            {
                Name = b.Name!.Trim(), Orgnr = orgnr, City = b.City!.Trim(), Phone = phone, Status = CompanyStatus.Venter, Coverage = kommuner,
                ContactName = b.ContactName!.Trim(), ContactEmail = email, ContactPhone = phone, CreatedAt = DateTime.UtcNow, UpdatedAt = DateTime.UtcNow,
            };
            await db.Companies.InsertOneAsync(company);
            await db.Support.InsertOneAsync(new SupportCase { FromName = company.Name, Org = "Hentefirma", Text = $"Ny søknad om å bli hentefirma: {company.Name} ({string.Join(", ", kommuner)}).", CreatedAt = DateTime.UtcNow, UpdatedAt = DateTime.UtcNow });
            foreach (var id in await db.Users.Find(u => u.Roles.Super && u.Active).Project(u => u.Id).ToListAsync())
                await notify.User(id, "company.applied", "Ny søknad fra hentefirma", $"{company.Name} – {string.Join(", ", kommuner)}");
            return Results.Created($"/api/companies/{company.Id}", new { company.Id });
        }).RequireRateLimiting("auth");
    }

    static async Task SendInvite(Db db, Notifier notify, IMailSender mail, IConfiguration cfg, string? byUserId, string? name, string? email, string? phone, Roles roles, string? companyId, string intro)
    {
        var (token, hash) = Jwt.NewToken();
        await db.Invites.InsertOneAsync(new Invite { TokenHash = hash, Name = name, Email = email, Phone = email == null ? phone : null, Roles = roles, CompanyId = companyId, InvitedByUserId = byUserId, CreatedAt = DateTime.UtcNow, Expires = DateTime.UtcNow.AddDays(7) });
        var link = $"{cfg["App:BaseUrl"]}/invite/{token}";
        if (email != null) await mail.Send(new Mail(email, "Invitasjon til Returapp", $"Hei {name}!\n\n{intro} Aktiver kontoen din her (gyldig i 7 dager):\n{link}"));
        else if (phone != null) await notify.Sms(phone, $"{intro} Aktiver kontoen: {link}");
    }
}
