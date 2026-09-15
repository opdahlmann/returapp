using MongoDB.Driver;
using Returapp.Api.Models;
using Returapp.Api.Seed;
using Returapp.Api.Services;

namespace Returapp.Api.Endpoints;

public static class PickupEndpoints
{
    public record CreateBody(string? CategoryId, string? Desc, double Qty, string? Unit, string? Cond, string? Dims, string? Address, string? Postnr,
        string? Day, string? Slot, bool Unattended, string? Contact, string? Phone, List<string>? PhotoIds);

    public static readonly string[] Active = [PickupStatus.Ny, PickupStatus.Tildelt, PickupStatus.Planlagt, PickupStatus.Underveis];

    /// Superbruker alt; giver egne; gjest egne (gid); admin/sjåfør ordre i eget firma. Ellers 404 (eksistens skjules).
    public static bool CanRead(Caller c, Pickup p) =>
        c.Has("super")
        || (c.UserId != null && p.GiverUserId == c.UserId)
        || (c.IsGuest && c.GuestId != null && p.GuestId == c.GuestId)
        || ((c.Has("admin") || c.Has("driver")) && p.CompanyId != null && p.CompanyId == c.CompanyId);

    public static void MapPickups(this WebApplication app)
    {
        var g = app.MapGroup("/api/pickups").RequireAuthorization();

        g.MapPost("", async (CreateBody b, HttpContext ctx, Db db, Notifier notify, Geo geo) =>
        {
            var caller = ctx.User.Caller();
            if (!caller.IsGuest && !caller.Has("giver")) return AuthEndpoints.Err(403, "Du må være giver for å melde henting");
            var cat = await db.Categories.Find(c => c.Id == b.CategoryId).FirstOrDefaultAsync();
            if (cat == null) return AuthEndpoints.Err(400, "Velg en kategori");
            if (b.Qty <= 0 || b.Qty > 100_000) return AuthEndpoints.Err(400, "Oppgi antall / mengde");
            if (!Seeder.Units.Contains(b.Unit)) return AuthEndpoints.Err(400, "Ugyldig enhet");
            if (!Seeder.Conds.Contains(b.Cond)) return AuthEndpoints.Err(400, "Ugyldig tilstand");
            if ((b.Address ?? "").Trim().Length < 3) return AuthEndpoints.Err(400, "Adresse og postnummer må fylles ut");
            var postnr = await db.Postnr.Find(p => p.Id == b.Postnr).FirstOrDefaultAsync();
            if (postnr == null) return AuthEndpoints.Err(400, "Ukjent postnummer");
            if (b.Slot != null && !Seeder.Slots.Contains(b.Slot)) return AuthEndpoints.Err(400, "Ugyldig tidsvindu");
            if (b.Day != null && (!DateOnly.TryParseExact(b.Day, "yyyy-MM-dd", out var day) || day < Fmt.Today() || day > Fmt.Today().AddDays(90)))
                return AuthEndpoints.Err(400, "Ugyldig dag");
            if ((b.Desc ?? "").Length > 2000 || (b.Dims ?? "").Length > 100) return AuthEndpoints.Err(400, "Teksten er for lang");

            var user = caller.UserId == null ? null : await db.Users.Find(u => u.Id == caller.UserId).FirstOrDefaultAsync();
            var contact = (b.Contact ?? user?.Name ?? "").Trim();
            var phone = Phone.Normalize(b.Phone) ?? user?.Phone;
            if (caller.IsGuest && (contact.Length < 2 || phone == null)) return AuthEndpoints.Err(400, "Skriv inn navn og mobilnummer, så får du SMS om hentingen");
            if (phone == null) return AuthEndpoints.Err(400, "Legg inn et kontaktnummer");

            var company = await ReferenceEndpoints.CoveringCompany(db, postnr.Kommune);
            var id = await db.NextPickupId();
            var now = DateTime.UtcNow;
            var coords = await geo.Lookup(b.Address!.Trim(), postnr.Id);
            var p = new Pickup
            {
                Id = id, Seq = int.Parse(id[2..]), CategoryId = cat.Id, Title = $"{Fmt.Qty(b.Qty)} {b.Unit} {cat.Name.ToLower(Fmt.Nb)}",
                Desc = (b.Desc ?? "").Trim(), GiverUserId = user?.Id, GuestId = caller.IsGuest ? caller.GuestId : null, GuestPhone = caller.IsGuest ? phone : null,
                GiverOrg = !string.IsNullOrWhiteSpace(user?.Org) ? user.Org : $"Privat – {contact}", Contact = contact, Phone = phone,
                Address = b.Address.Trim(), Postnr = postnr.Id, Kommune = postnr.Kommune, Lat = coords?.Lat, Lng = coords?.Lng,
                Qty = b.Qty, Unit = b.Unit!, Cond = b.Cond!, Dims = (b.Dims ?? "").Trim(), Day = b.Day, Slot = b.Slot, Unattended = b.Unattended,
                Status = PickupStatus.Ny, CompanyId = company?.Id, EstKg = Weight.EstimateKg(cat, b.Unit!, b.Qty),
                StatusLog = [new(PickupStatus.Ny, now, caller.UserId)], CreatedAt = now, UpdatedAt = now,
            };
            p.Photos = await PhotoEndpoints.Attach(db, caller, b.PhotoIds, id);
            await db.Pickups.InsertOneAsync(p);

            if (company != null) await notify.CompanyAdmins(company.Id, "pickup.new", $"Ny henteordre {id}", $"{p.Title} i {p.Postnr} {p.Kommune}", id);
            var confirm = company != null ? $"{id} er meldt. {company.Name} er varslet og tar kontakt om tidspunkt." : $"{id} er registrert. Vi varsler deg når noen dekker {p.Postnr}.";
            if (user != null) await notify.User(user.Id, "pickup.created", "Henting meldt", confirm, id, Channels.Email);
            else await notify.Sms(phone, confirm);

            return Results.Created($"/api/pickups/{id}", (await Dtos(db, [p]))[0]);
        });

        g.MapGet("", async (string? scope, string? status, string? filter, HttpContext ctx, Db db) =>
        {
            var c = ctx.User.Caller();
            var f = Builders<Pickup>.Filter;
            FilterDefinition<Pickup> q;
            switch (scope ?? "mine")
            {
                case "mine":
                    q = c.IsGuest ? f.Eq(p => p.GuestId, c.GuestId) : f.Eq(p => p.GiverUserId, c.UserId);
                    if (filter == "aktive") q &= f.In(p => p.Status, Active);
                    else if (filter == "ferdige") q &= f.Nin(p => p.Status, Active);
                    break;
                case "company":
                    if (!c.Has("admin") || c.CompanyId == null) return AuthEndpoints.Err(403, "Kun for hentefirma");
                    q = f.Eq(p => p.CompanyId, c.CompanyId);
                    if (status != null) q &= f.Eq(p => p.Status, status);
                    break;
                case "driver":
                    if (!c.Has("driver")) return AuthEndpoints.Err(403, "Kun for sjåfør");
                    q = f.Eq(p => p.DriverId, c.UserId);
                    if (status != null) q &= f.Eq(p => p.Status, status);
                    break;
                case "market":
                    if (!c.Has("driver") || c.CompanyId == null) return AuthEndpoints.Err(403, "Kun for sjåfør");
                    q = f.Eq(p => p.CompanyId, c.CompanyId) & f.Eq(p => p.Open, true) & f.Eq(p => p.Status, PickupStatus.Ny);
                    break;
                case "all":
                    if (!c.Has("super")) return AuthEndpoints.Err(403, "Kun for superbruker");
                    q = filter switch
                    {
                        "ubehandlet" => f.Eq(p => p.Status, PickupStatus.Ny),
                        "utenfirma" => f.Eq(p => p.CompanyId, null),
                        "behandlet" => f.Ne(p => p.Status, PickupStatus.Ny),
                        _ => f.Empty,
                    };
                    break;
                default:
                    return AuthEndpoints.Err(400, "Ukjent scope");
            }
            var list = await db.Pickups.Find(q).SortByDescending(p => p.CreatedAt).Limit(500).ToListAsync();
            return Results.Ok(await Dtos(db, list));
        });

        g.MapGet("/{id}", async (string id, HttpContext ctx, Db db) =>
        {
            var p = await db.Pickups.Find(x => x.Id == id).FirstOrDefaultAsync();
            return p == null || !CanRead(ctx.User.Caller(), p) ? AuthEndpoints.Err(404, "Fant ikke hentingen") : Results.Ok((await Dtos(db, [p]))[0]);
        });

        g.MapPost("/{id}/cancel", async (string id, HttpContext ctx, Db db, Notifier notify) =>
        {
            var c = ctx.User.Caller();
            var p = await db.Pickups.Find(x => x.Id == id).FirstOrDefaultAsync();
            var own = p != null && ((c.UserId != null && p.GiverUserId == c.UserId) || (c.IsGuest && p.GuestId == c.GuestId));
            if (p == null || !own) return AuthEndpoints.Err(404, "Fant ikke hentingen");
            var now = DateTime.UtcNow;
            var updated = await db.Pickups.FindOneAndUpdateAsync(x => x.Id == id && Active.Contains(x.Status),
                Builders<Pickup>.Update.Set(x => x.Status, PickupStatus.Avbrutt).Set(x => x.CancelledAt, now).Set(x => x.Open, false).Set(x => x.UpdatedAt, now)
                    .Push(x => x.StatusLog, new StatusLogEntry(PickupStatus.Avbrutt, now, c.UserId)),
                new FindOneAndUpdateOptions<Pickup> { ReturnDocument = ReturnDocument.After });
            if (updated == null) return AuthEndpoints.Err(409, "Hentingen kan ikke avbrytes lenger");
            if (updated.CompanyId != null) await notify.CompanyAdmins(updated.CompanyId, "pickup.cancelled", $"Henting avbrutt {id}", $"{updated.Title} er avbrutt av giver.", id);
            if (updated.DriverId != null) await notify.User(updated.DriverId, "pickup.cancelled", $"Henting avbrutt {id}", $"{updated.Title} er avbrutt av giver.", id, Channels.Sms);
            return Results.Ok((await Dtos(db, [updated]))[0]);
        });

        g.MapGet("/{id}/receipt.pdf", async (string id, HttpContext ctx, Db db, IConfiguration cfg) =>
        {
            var p = await db.Pickups.Find(x => x.Id == id).FirstOrDefaultAsync();
            if (p == null || !CanRead(ctx.User.Caller(), p) || p.Status != PickupStatus.Hentet) return AuthEndpoints.Err(404, "Fant ingen kvittering");
            var cat = await db.Categories.Find(c => c.Id == p.CategoryId).FirstOrDefaultAsync();
            var driver = p.DriverId == null ? "" : await db.Users.Find(u => u.Id == p.DriverId).Project(u => u.Name).FirstOrDefaultAsync() ?? "";
            var company = p.CompanyId == null ? "" : await db.Companies.Find(c => c.Id == p.CompanyId).Project(c => c.Name).FirstOrDefaultAsync() ?? "";
            return Results.File(Pdf.Receipt(p, cat?.Name ?? "Annet", driver, company, Weight.Co2(p.EstKg, cfg)), "application/pdf", $"kvittering-{p.Id}.pdf");
        });

        g.MapGet("/{id}/label.pdf", async (string id, HttpContext ctx, Db db, IConfiguration cfg) =>
        {
            var p = await db.Pickups.Find(x => x.Id == id).FirstOrDefaultAsync();
            if (p == null || !CanRead(ctx.User.Caller(), p)) return AuthEndpoints.Err(404, "Fant ikke hentingen");
            return Results.File(Pdf.Label(p, $"{cfg["App:BaseUrl"]}/p/{p.Id}"), "application/pdf", $"merkelapp-{p.Id}.pdf");
        });
    }

    /// Ordre + oppslag frontend trenger (kategori, firma, sjåfør, meldinger). Statusetikett/farger beregnes i frontend.
    public static async Task<List<object>> Dtos(Db db, List<Pickup> list)
    {
        var cats = (await db.Categories.Find(_ => true).ToListAsync()).ToDictionary(c => c.Id);
        var companyIds = list.Select(p => p.CompanyId).OfType<string>().Distinct().ToList();
        var companies = (await db.Companies.Find(c => companyIds.Contains(c.Id)).ToListAsync()).ToDictionary(c => c.Id);
        var driverIds = list.Select(p => p.DriverId).OfType<string>().Distinct().ToList();
        var drivers = (await db.Users.Find(u => driverIds.Contains(u.Id)).ToListAsync()).ToDictionary(u => u.Id);
        return list.Select(p =>
        {
            var cat = cats.GetValueOrDefault(p.CategoryId);
            var company = p.CompanyId == null ? null : companies.GetValueOrDefault(p.CompanyId);
            var driver = p.DriverId == null ? null : drivers.GetValueOrDefault(p.DriverId);
            return (object)new
            {
                p.Id, p.CategoryId, categoryName = cat?.Name ?? "Annet", categoryIcon = cat?.Icon ?? "annet", p.Title, p.Desc,
                p.GiverUserId, p.GiverOrg, p.Contact, p.Phone, p.Address, p.Postnr, p.Kommune, p.Lat, p.Lng,
                p.Qty, p.Unit, p.Cond, p.Dims, p.Day, p.Slot, p.Unattended, p.Status, p.Open,
                p.CompanyId, companyName = company?.Name, companyPhone = company?.Phone,
                p.DriverId, driverName = driver?.Name, driverPhone = driver?.Phone,
                p.Photos, p.PickedPhotos, p.EstKg, p.PickedAt, p.PickedQty, p.PickedNote, p.Deviation, p.CancelledAt, p.StatusLog, p.CreatedAt,
                messageCount = p.Messages.Count, lastMessage = p.Messages.LastOrDefault(),
            };
        }).ToList();
    }
}
