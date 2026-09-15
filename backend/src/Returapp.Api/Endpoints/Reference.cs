using System.Globalization;
using System.Text.RegularExpressions;
using MongoDB.Driver;
using Returapp.Api.Models;
using Returapp.Api.Services;

namespace Returapp.Api.Endpoints;

public static class ReferenceEndpoints
{
    public record CategoryBody(string? Name, string? Icon, Dictionary<string, double>? KgPerUnit);
    public record OrderBody(List<string> Ids);
    public record AlertBody(string Postnr, string? Phone);

    public static readonly string[] CategoryIcons = ["paller", "dorer", "vinduer", "elektro", "innredning", "mobler", "kjokken", "sanitaer", "trevirke", "isolasjon", "metall", "annet", "box", "leaf", "layers"];
    public static readonly StringComparer NbOrder = StringComparer.Create(new CultureInfo("nb-NO"), true);

    public static void MapReference(this WebApplication app)
    {
        // Offentlig: brukes av gjest og wizard for sted og dekning.
        app.MapGet("/api/postnr/{nr}", async (string nr, Db db) =>
        {
            var p = await db.Postnr.Find(x => x.Id == nr).FirstOrDefaultAsync();
            if (p == null) return AuthEndpoints.Err(404, "Ukjent postnummer");
            var company = await CoveringCompany(db, p.Kommune);
            return Results.Ok(new { postnr = p.Id, p.Poststed, p.Kommune, covered = company != null, companyId = company?.Id, companyName = company?.Name });
        });

        // Superbruker: hvem henter hvor. Uten søk vises kommuner med dekning, søknad eller ordre; med søk alle treff (maks 50).
        app.MapGet("/api/postnr/kommuner", async (string? q, Db db) =>
        {
            var counts = await PostnrPerKommune(db);
            var companies = await db.Companies.Find(c => c.Status != CompanyStatus.Avvist).ToListAsync();
            var active = companies.Where(c => c.Status == CompanyStatus.Aktiv).ToList();
            IEnumerable<string> names;
            if (string.IsNullOrWhiteSpace(q))
            {
                var withOrders = await db.Pickups.Distinct(p => p.Kommune, _ => true).ToListAsync();
                names = counts.Keys.Where(k => companies.Any(c => c.Coverage.Contains(k)) || withOrders.Contains(k));
            }
            else names = counts.Keys.Where(k => k.Contains(q.Trim(), StringComparison.OrdinalIgnoreCase)).Take(50);
            return Results.Ok(names.Order(NbOrder).Select(k => new
            {
                kommune = k,
                postnr = counts[k].Count,
                firms = active.Where(c => c.Coverage.Contains(k)).Select(c => c.Name).ToList(),
            }));
        }).RequireAuthorization("super");

        app.MapGet("/api/categories", async (Db db) => Results.Ok(await db.Categories.Find(_ => true).SortBy(c => c.Order).ToListAsync()));

        var cats = app.MapGroup("/api/categories").RequireAuthorization("super");

        cats.MapPost("", async (CategoryBody b, Db db) =>
        {
            var name = (b.Name ?? "").Trim();
            if (name.Length < 2) return AuthEndpoints.Err(400, "Skriv inn et navn");
            if (b.Icon != null && !CategoryIcons.Contains(b.Icon)) return AuthEndpoints.Err(400, "Ukjent ikon");
            var id = Slug(name);
            for (var i = 2; await db.Categories.Find(c => c.Id == id).AnyAsync(); i++) id = $"{Slug(name)}-{i}";
            var last = await db.Categories.Find(_ => true).SortByDescending(c => c.Order).FirstOrDefaultAsync();
            var cat = new Category
            {
                Id = id, Name = name, Icon = b.Icon ?? "annet", Order = (last?.Order ?? -1) + 1,
                KgPerUnit = b.KgPerUnit ?? new() { ["stk"] = 18, ["m2"] = 18, ["lm"] = 18, ["paller"] = 18, ["kg"] = 1 },
            };
            await db.Categories.InsertOneAsync(cat);
            return Results.Created($"/api/categories/{id}", cat);
        });

        cats.MapPatch("/{id}", async (string id, CategoryBody b, Db db) =>
        {
            var set = new List<UpdateDefinition<Category>>();
            if (b.Name != null)
            {
                if (b.Name.Trim().Length < 2) return AuthEndpoints.Err(400, "Skriv inn et navn");
                set.Add(Builders<Category>.Update.Set(c => c.Name, b.Name.Trim()));
            }
            if (b.Icon != null)
            {
                if (!CategoryIcons.Contains(b.Icon)) return AuthEndpoints.Err(400, "Ukjent ikon");
                set.Add(Builders<Category>.Update.Set(c => c.Icon, b.Icon));
            }
            if (b.KgPerUnit != null) set.Add(Builders<Category>.Update.Set(c => c.KgPerUnit, b.KgPerUnit));
            if (set.Count == 0) return AuthEndpoints.Err(400, "Ingenting å endre");
            var cat = await db.Categories.FindOneAndUpdateAsync(c => c.Id == id, Builders<Category>.Update.Combine(set), new FindOneAndUpdateOptions<Category> { ReturnDocument = ReturnDocument.After });
            return cat == null ? AuthEndpoints.Err(404, "Fant ikke kategorien") : Results.Ok(cat);
        });

        cats.MapDelete("/{id}", async (string id, Db db) =>
        {
            if (await db.Pickups.Find(p => p.CategoryId == id).AnyAsync()) return AuthEndpoints.Err(409, "Kategorien brukes av henteordre og kan ikke slettes");
            return (await db.Categories.DeleteOneAsync(c => c.Id == id)).DeletedCount == 0 ? AuthEndpoints.Err(404, "Fant ikke kategorien") : Results.NoContent();
        });

        cats.MapPut("/order", async (OrderBody b, Db db) =>
        {
            var existing = await db.Categories.Find(_ => true).Project(c => c.Id).ToListAsync();
            if (b.Ids.Count != existing.Count || !existing.All(b.Ids.Contains)) return AuthEndpoints.Err(400, "Rekkefølgen må inneholde alle kategoriene");
            await db.Categories.BulkWriteAsync(b.Ids.Select((id, i) => new UpdateOneModel<Category>(Builders<Category>.Filter.Eq(c => c.Id, id), Builders<Category>.Update.Set(c => c.Order, i))));
            return Results.Ok(await db.Categories.Find(_ => true).SortBy(c => c.Order).ToListAsync());
        });

        // "Varsle meg når noen dekker postnummeret" – innlogget bruker eller gjest med mobilnummer.
        app.MapPost("/api/coverage-alerts", async (AlertBody b, HttpContext ctx, Db db) =>
        {
            var caller = ctx.User.Caller();
            if (!await db.Postnr.Find(p => p.Id == b.Postnr).AnyAsync()) return AuthEndpoints.Err(400, "Ukjent postnummer");
            var phone = Phone.Normalize(b.Phone);
            if (caller.UserId == null && phone == null) return AuthEndpoints.Err(400, "Skriv inn mobilnummeret ditt, så sender vi SMS");
            var exists = caller.UserId != null
                ? await db.CoverageAlerts.Find(a => a.Postnr == b.Postnr && a.UserId == caller.UserId && a.NotifiedAt == null).AnyAsync()
                : await db.CoverageAlerts.Find(a => a.Postnr == b.Postnr && a.Phone == phone && a.NotifiedAt == null).AnyAsync();
            if (!exists) await db.CoverageAlerts.InsertOneAsync(new CoverageAlert { Postnr = b.Postnr, UserId = caller.UserId, Phone = caller.UserId == null ? phone : null, CreatedAt = DateTime.UtcNow });
            return Results.Ok();
        }).RequireAuthorization();
    }

    /// Aktivt firma som dekker kommunen (eldste godkjente først, så valget er stabilt).
    public static Task<Company?> CoveringCompany(Db db, string kommune) =>
        db.Companies.Find(c => c.Status == CompanyStatus.Aktiv && c.Coverage.Contains(kommune)).SortBy(c => c.Since).FirstOrDefaultAsync()!;

    public record KommuneInfo(string Kommunenr, int Count);

    public static async Task<Dictionary<string, KommuneInfo>> PostnrPerKommune(Db db) =>
        (await db.Postnr.Aggregate().Group(p => p.Kommune, g => new { Kommune = g.Key, Kommunenr = g.First().Kommunenr, Count = g.Count() }).ToListAsync())
        .ToDictionary(x => x.Kommune, x => new KommuneInfo(x.Kommunenr, x.Count));

    // "Stein og betong" → "stein-og-betong", "Sanitær/VVS" → "sanitaer-vvs"
    public static string Slug(string name)
    {
        var s = name.ToLowerInvariant().Replace("æ", "ae").Replace("ø", "o").Replace("å", "a");
        return Regex.Replace(s, "[^a-z0-9]+", "-").Trim('-') is { Length: > 0 } slug ? slug : "kategori";
    }
}
