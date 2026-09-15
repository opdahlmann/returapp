using MongoDB.Driver;
using Returapp.Api.Models;
using Returapp.Api.Services;

namespace Returapp.Api.Endpoints;

public static class CompanyEndpoints
{
    public record CoverageBody(List<string> Kommuner);
    public record CompanyPatch(string? Name, string? Phone, string? City);
    public record DepartmentBody(string? Name, string? Type, string? Address, string? Phone, string? Hours, string? Accepts);
    public record InviteDriverBody(string? Name, string? Phone, string? Vehicle, List<string>? Areas);

    public static void MapCompanies(this WebApplication app)
    {
        var companies = app.MapGroup("/api/companies").RequireAuthorization("user");

        companies.MapGet("/{id}", async (string id, HttpContext ctx, Db db) =>
        {
            var c = ctx.User.Caller();
            if (!c.CanManageCompany(id)) return AuthEndpoints.Err(404, "Fant ikke firmaet");
            var company = await db.Companies.Find(x => x.Id == id).FirstOrDefaultAsync();
            if (company == null) return AuthEndpoints.Err(404, "Fant ikke firmaet");
            var drivers = await db.Users.CountDocumentsAsync(u => u.CompanyId == id && u.Roles.Driver && u.Active);
            var all = await ReferenceEndpoints.PostnrPerKommune(db);
            var coveredPostnr = company.Coverage.Where(all.ContainsKey).Sum(k => all[k].Count);
            return Results.Ok(new { company.Id, company.Name, company.City, company.Orgnr, company.Phone, company.Status, company.Since, company.Coverage, company.Departments, driverCount = drivers, coveredPostnr });
        });

        companies.MapPatch("/{id}", async (string id, CompanyPatch b, HttpContext ctx, Db db) =>
        {
            if (!ctx.User.Caller().CanManageCompany(id)) return AuthEndpoints.Err(404, "Fant ikke firmaet");
            var set = new List<UpdateDefinition<Company>> { Builders<Company>.Update.Set(c => c.UpdatedAt, DateTime.UtcNow) };
            if (b.Name is { Length: >= 2 }) set.Add(Builders<Company>.Update.Set(c => c.Name, b.Name.Trim()));
            if (b.City is { Length: >= 2 }) set.Add(Builders<Company>.Update.Set(c => c.City, b.City.Trim()));
            if (b.Phone != null) set.Add(Builders<Company>.Update.Set(c => c.Phone, Phone.Normalize(b.Phone) ?? b.Phone.Trim()));
            var company = await db.Companies.FindOneAndUpdateAsync(c => c.Id == id, Builders<Company>.Update.Combine(set), new FindOneAndUpdateOptions<Company> { ReturnDocument = ReturnDocument.After });
            return company == null ? AuthEndpoints.Err(404, "Fant ikke firmaet") : Results.Ok(company);
        });

        companies.MapPost("/{id}/departments", async (string id, DepartmentBody b, HttpContext ctx, Db db) =>
        {
            if (!ctx.User.Caller().CanManageCompany(id)) return AuthEndpoints.Err(404, "Fant ikke firmaet");
            if (Department(b) is not { } dept) return AuthEndpoints.Err(400, "Skriv inn navn og adresse");
            var company = await db.Companies.FindOneAndUpdateAsync(c => c.Id == id, Builders<Company>.Update.Push(c => c.Departments, dept), new FindOneAndUpdateOptions<Company> { ReturnDocument = ReturnDocument.After });
            return company == null ? AuthEndpoints.Err(404, "Fant ikke firmaet") : Results.Ok(company.Departments);
        });

        companies.MapPut("/{id}/departments/{index:int}", async (string id, int index, DepartmentBody b, HttpContext ctx, Db db) =>
        {
            if (!ctx.User.Caller().CanManageCompany(id)) return AuthEndpoints.Err(404, "Fant ikke firmaet");
            if (Department(b) is not { } dept) return AuthEndpoints.Err(400, "Skriv inn navn og adresse");
            var company = await db.Companies.Find(c => c.Id == id).FirstOrDefaultAsync();
            if (company == null || index < 0 || index >= company.Departments.Count) return AuthEndpoints.Err(404, "Fant ikke avdelingen");
            company.Departments[index] = dept;
            await db.Companies.UpdateOneAsync(c => c.Id == id, Builders<Company>.Update.Set(c => c.Departments, company.Departments));
            return Results.Ok(company.Departments);
        });

        companies.MapDelete("/{id}/departments/{index:int}", async (string id, int index, HttpContext ctx, Db db) =>
        {
            if (!ctx.User.Caller().CanManageCompany(id)) return AuthEndpoints.Err(404, "Fant ikke firmaet");
            var company = await db.Companies.Find(c => c.Id == id).FirstOrDefaultAsync();
            if (company == null || index < 0 || index >= company.Departments.Count) return AuthEndpoints.Err(404, "Fant ikke avdelingen");
            company.Departments.RemoveAt(index);
            await db.Companies.UpdateOneAsync(c => c.Id == id, Builders<Company>.Update.Set(c => c.Departments, company.Departments));
            return Results.Ok(company.Departments);
        });

        companies.MapGet("/{id}/drivers", async (string id, HttpContext ctx, Db db) =>
        {
            if (!ctx.User.Caller().CanManageCompany(id)) return AuthEndpoints.Err(404, "Fant ikke firmaet");
            var drivers = await db.Users.Find(u => u.CompanyId == id && u.Roles.Driver && u.Active).SortBy(u => u.Name).ToListAsync();
            var ids = drivers.Select(d => d.Id).ToList();
            var counts = await db.Pickups.Aggregate().Match(p => ids.Contains(p.DriverId!)).Group(p => new { p.DriverId, p.Status }, g => new { g.Key.DriverId, g.Key.Status, Count = g.Count() }).ToListAsync();
            int Count(string driver, params string[] statuses) => counts.Where(x => x.DriverId == driver && statuses.Contains(x.Status)).Sum(x => x.Count);
            return Results.Ok(drivers.Select(d => new
            {
                d.Id, d.Name, d.Phone, d.Vehicle, areas = d.Areas ?? [],
                planned = Count(d.Id, PickupStatus.Planlagt, PickupStatus.Underveis, PickupStatus.Tildelt),
                done = Count(d.Id, PickupStatus.Hentet),
            }));
        });

        companies.MapPost("/{id}/invite-driver", async (string id, InviteDriverBody b, HttpContext ctx, Db db, IConfiguration cfg, Notifier notify) =>
        {
            var c = ctx.User.Caller();
            if (!c.CanManageCompany(id)) return AuthEndpoints.Err(404, "Fant ikke firmaet");
            var phone = Phone.Normalize(b.Phone);
            if ((b.Name ?? "").Trim().Length < 2 || phone == null) return AuthEndpoints.Err(400, "Skriv inn navn og mobilnummer");
            var company = await db.Companies.Find(x => x.Id == id).FirstAsync();
            var (token, hash) = Jwt.NewToken();
            await db.Invites.InsertOneAsync(new Invite
            {
                TokenHash = hash, Name = b.Name!.Trim(), Phone = phone, Roles = new() { Driver = true }, CompanyId = id, Vehicle = b.Vehicle?.Trim(), Areas = b.Areas,
                InvitedByUserId = c.UserId, CreatedAt = DateTime.UtcNow, Expires = DateTime.UtcNow.AddDays(7),
            });
            await notify.Sms(phone, $"{company.Name} inviterer deg som sjåfør. Aktiver kontoen her: {cfg["App:BaseUrl"]}/invite/{token}");
            return Results.Ok();
        });

        // Tall til Firma- og Statistikk-skjermen. Beregnes i minnet fra firmaets ordre siste 120 dager.
        // ponytail: in-memory over 120 dager; bytt til én $facet-pipeline hvis et firma får mange tusen ordre i måneden
        companies.MapGet("/{id}/stats", async (string id, HttpContext ctx, Db db, IConfiguration cfg) =>
        {
            if (!ctx.User.Caller().CanManageCompany(id)) return AuthEndpoints.Err(404, "Fant ikke firmaet");
            return Results.Ok(await Stats(db, cfg, id, DateTime.UtcNow));
        });

        // Kommunene admin kan velge: alle i fylkene firmaet holder til/dekker (fylke = to første siffer i kommunenr), pluss de som allerede dekkes.
        companies.MapGet("/{id}/coverage", async (string id, HttpContext ctx, Db db) =>
        {
            if (!ctx.User.Caller().CanManageCompany(id)) return AuthEndpoints.Err(404, "Fant ikke firmaet");
            var company = await db.Companies.Find(c => c.Id == id).FirstOrDefaultAsync();
            return company == null ? AuthEndpoints.Err(404, "Fant ikke firmaet") : Results.Ok(await CoverageView(db, company));
        });

        companies.MapPut("/{id}/coverage", async (string id, CoverageBody b, HttpContext ctx, Db db, Coverage coverage) =>
        {
            if (!ctx.User.Caller().CanManageCompany(id)) return AuthEndpoints.Err(404, "Fant ikke firmaet");
            var company = await db.Companies.Find(c => c.Id == id).FirstOrDefaultAsync();
            if (company == null) return AuthEndpoints.Err(404, "Fant ikke firmaet");
            var known = await ReferenceEndpoints.PostnrPerKommune(db);
            var kommuner = (b.Kommuner ?? []).Distinct().ToList();
            if (kommuner.FirstOrDefault(k => !known.ContainsKey(k)) is { } unknown) return AuthEndpoints.Err(400, $"Ukjent kommune: {unknown}");

            var added = kommuner.Except(company.Coverage).ToList();
            company.Coverage = kommuner;
            await db.Companies.UpdateOneAsync(c => c.Id == id, Builders<Company>.Update.Set(c => c.Coverage, kommuner).Set(c => c.UpdatedAt, DateTime.UtcNow));
            await coverage.Added(company, added);
            return Results.Ok(await CoverageView(db, company));
        });
    }

    static Department? Department(DepartmentBody b) =>
        (b.Name ?? "").Trim().Length < 2 || (b.Address ?? "").Trim().Length < 3 ? null : new Department
        {
            Name = b.Name!.Trim(), Type = b.Type == "hoved" ? "hoved" : "avdeling", Address = b.Address!.Trim(),
            Phone = Phone.Normalize(b.Phone) ?? b.Phone?.Trim() ?? "", Hours = b.Hours?.Trim() ?? "", Accepts = b.Accepts?.Trim() ?? "",
        };

    static readonly string[] MonthNames = ["januar", "februar", "mars", "april", "mai", "juni", "juli", "august", "september", "oktober", "november", "desember"];

    public static async Task<object> Stats(Db db, IConfiguration cfg, string companyId, DateTime nowUtc)
    {
        var local = Fmt.Local(nowUtc);
        var weekStart = TimeZoneInfo.ConvertTimeToUtc(local.Date.AddDays(-((7 + (int)local.DayOfWeek - 1) % 7)), Fmt.Oslo);
        var monthStart = TimeZoneInfo.ConvertTimeToUtc(new DateTime(local.Year, local.Month, 1), Fmt.Oslo);
        var since = nowUtc.AddDays(-120);
        var list = await db.Pickups.Find(p => p.CompanyId == companyId && p.CreatedAt >= since).ToListAsync();

        var picked = list.Where(p => p.Status == PickupStatus.Hentet && p.PickedAt != null).ToList();
        var week = picked.Where(p => p.PickedAt >= weekStart).ToList();
        var month = picked.Where(p => p.PickedAt >= monthStart).ToList();
        var monthDeviations = list.Count(p => p.Status == PickupStatus.Avvik && p.Deviation?.At >= monthStart);
        var response = list.Select(p => (p.CreatedAt, Planned: p.StatusLog.FirstOrDefault(l => l.Status == PickupStatus.Planlagt)?.At))
            .Where(x => x.Planned != null && x.CreatedAt >= nowUtc.AddDays(-90)).Select(x => (x.Planned!.Value - x.CreatedAt).TotalDays).ToList();
        var cats = (await db.Categories.Find(_ => true).ToListAsync()).ToDictionary(c => c.Id, c => c.Name);
        // Topp 4 navngitte kategorier; kategorien "Annet" og resten samles i én "Annet"-rad.
        var perCategory = month.Where(p => p.CategoryId != "annet" && cats.ContainsKey(p.CategoryId)).GroupBy(p => p.CategoryId)
            .Select(g => (Name: cats[g.Key], Kg: g.Sum(p => p.EstKg))).OrderByDescending(x => x.Kg).ToList();
        var top = perCategory.Take(4).Select(x => new { name = x.Name, kg = x.Kg }).ToList();
        var rest = perCategory.Skip(4).Sum(x => x.Kg) + month.Where(p => p.CategoryId == "annet" || !cats.ContainsKey(p.CategoryId)).Sum(p => p.EstKg);
        if (rest > 0) top.Add(new { name = "Annet", kg = rest });
        var monthKg = month.Sum(p => p.EstKg);
        return new
        {
            weekCount = week.Count,
            weekKg = week.Sum(p => p.EstKg),
            responseDays = response.Count == 0 ? 0 : Math.Round(response.Average(), 1),
            monthName = MonthNames[local.Month - 1],
            monthCount = month.Count,
            monthKg,
            noDeviationPct = month.Count + monthDeviations == 0 ? 100 : (int)Math.Round(100.0 * month.Count / (month.Count + monthDeviations)),
            co2Kg = Weight.Co2(monthKg, cfg),
            perCategory = top,
        };
    }

    static async Task<object> CoverageView(Db db, Company company)
    {
        var all = await ReferenceEndpoints.PostnrPerKommune(db);
        var cityKommune = await db.Postnr.Find(p => p.Kommune == company.City || p.Poststed == company.City).Project(p => p.Kommune).FirstOrDefaultAsync();
        var fylker = company.Coverage.Append(cityKommune ?? "").Where(all.ContainsKey).Select(k => all[k].Kommunenr[..2]).ToHashSet();
        var items = all.Where(k => fylker.Contains(k.Value.Kommunenr[..2]) || company.Coverage.Contains(k.Key))
            .Select(k => new { kommune = k.Key, postnr = k.Value.Count, covered = company.Coverage.Contains(k.Key) })
            .OrderBy(x => x.covered ? company.Coverage.IndexOf(x.kommune) : int.MaxValue)
            .ThenBy(x => x.kommune, ReferenceEndpoints.NbOrder)
            .ToList();
        return new { items, coveredPostnr = items.Where(x => x.covered).Sum(x => x.postnr) };
    }
}

/// Når et aktivt firma får nye kommuner: varsle de som ba om det, og gi firmaet ordre som ventet uten firma.
public class Coverage(Db db, Notifier notify)
{
    public async Task Added(Company company, List<string> kommuner)
    {
        if (company.Status != CompanyStatus.Aktiv || kommuner.Count == 0) return;
        var postnrs = await db.Postnr.Find(p => kommuner.Contains(p.Kommune)).Project(p => p.Id).ToListAsync();

        foreach (var alert in await db.CoverageAlerts.Find(a => postnrs.Contains(a.Postnr) && a.NotifiedAt == null).ToListAsync())
        {
            var text = $"Nå henter {company.Name} i {alert.Postnr}. Du kan melde henting i Returapp.";
            if (alert.UserId != null) await notify.User(alert.UserId, "coverage", "Nå dekkes postnummeret ditt", text, channels: Channels.Sms | Channels.Email);
            else if (alert.Phone != null) await notify.Sms(alert.Phone, text);
            await db.CoverageAlerts.UpdateOneAsync(a => a.Id == alert.Id, Builders<CoverageAlert>.Update.Set(a => a.NotifiedAt, DateTime.UtcNow));
        }

        var waiting = await db.Pickups.Find(p => p.CompanyId == null && p.Status == PickupStatus.Ny && kommuner.Contains(p.Kommune)).ToListAsync();
        foreach (var p in waiting)
        {
            await db.Pickups.UpdateOneAsync(x => x.Id == p.Id && x.CompanyId == null, Builders<Pickup>.Update.Set(x => x.CompanyId, company.Id).Set(x => x.UpdatedAt, DateTime.UtcNow));
            await notify.CompanyAdmins(company.Id, "pickup.new", $"Ny henteordre {p.Id}", $"{p.Title} i {p.Postnr} {p.Kommune}", p.Id);
            var body = $"{p.Id} er sendt til {company.Name}, som tar kontakt om henting.";
            if (p.GiverUserId != null) await notify.User(p.GiverUserId, "pickup.company", "Hentefirma funnet", body, p.Id, Channels.Sms);
            else if (p.GuestPhone != null) await notify.Sms(p.GuestPhone, body);
        }
    }
}
