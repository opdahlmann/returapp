using MongoDB.Driver;
using Returapp.Api.Models;
using Returapp.Api.Services;

namespace Returapp.Api.Endpoints;

public static class CompanyEndpoints
{
    public record CoverageBody(List<string> Kommuner);

    public static void MapCompanies(this WebApplication app)
    {
        var companies = app.MapGroup("/api/companies").RequireAuthorization("user");

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
