using MongoDB.Driver;
using Returapp.Api.Models;
using Returapp.Api.Seed;
using Returapp.Api.Services;

namespace Returapp.Api.Endpoints;

public static class PickupEndpoints
{
    public record CreateBody(string? CategoryId, string? Desc, double Qty, string? Unit, string? Cond, string? Dims, string? Address, string? Postnr,
        string? Day, string? Slot, bool Unattended, string? Contact, string? Phone, List<string>? PhotoIds);

    public record AssignBody(string? DriverId, string? Day, string? Slot);
    public record MarketBody(bool Open);
    public record CompleteBody(double Qty, string? Note, List<string>? PhotoIds);
    public record DeviationBody(string? Reason, string? Note);

    public static readonly string[] Active = [PickupStatus.Ny, PickupStatus.Tildelt, PickupStatus.Planlagt, PickupStatus.Underveis];
    static readonly string[] Assignable = [PickupStatus.Ny, PickupStatus.Tildelt, PickupStatus.Planlagt];

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
            return Results.Ok(await Dtos(db, list, suggest: scope == "company"));
        });

        // Antall per status i eget firma (filterchips og badge i innboksen). Én $group.
        g.MapGet("/counts", async (HttpContext ctx, Db db) =>
        {
            var c = ctx.User.Caller();
            if (!c.Has("admin") || c.CompanyId == null) return AuthEndpoints.Err(403, "Kun for hentefirma");
            var groups = await db.Pickups.Aggregate().Match(p => p.CompanyId == c.CompanyId).Group(p => p.Status, g => new { Status = g.Key, Count = g.Count() }).ToListAsync();
            var open = await db.Pickups.CountDocumentsAsync(p => p.CompanyId == c.CompanyId && p.Open && p.Status == PickupStatus.Ny);
            return Results.Ok(new { counts = groups.ToDictionary(x => x.Status, x => x.Count), open });
        });

        g.MapGet("/{id}", async (string id, HttpContext ctx, Db db) =>
        {
            var c = ctx.User.Caller();
            var p = await db.Pickups.Find(x => x.Id == id).FirstOrDefaultAsync();
            return p == null || !CanRead(c, p) ? AuthEndpoints.Err(404, "Fant ikke hentingen") : Results.Ok((await Dtos(db, [p], suggest: c.Has("admin") || c.Has("super")))[0]);
        });

        // Admin/superbruker tildeler sjåfør (+ dag og tidsvindu = planlagt, ellers tildelt). Sjåfør tar oppdrag fra børsen (første vinner).
        g.MapPost("/{id}/assign", async (string id, AssignBody b, HttpContext ctx, Db db, Notifier notify) =>
        {
            var c = ctx.User.Caller();
            var p = await db.Pickups.Find(x => x.Id == id).FirstOrDefaultAsync();
            if (p == null || !CanRead(c, p)) return AuthEndpoints.Err(404, "Fant ikke hentingen");
            if (p.CompanyId == null) return AuthEndpoints.Err(409, "Ordren har ikke hentefirma ennå");
            if (!Assignable.Contains(p.Status)) return AuthEndpoints.Err(409, "Ordren kan ikke tildeles nå");
            if (b.Day != null && !DateOnly.TryParseExact(b.Day, "yyyy-MM-dd", out _)) return AuthEndpoints.Err(400, "Ugyldig dag");
            if (b.Slot != null && !Seeder.Slots.Contains(b.Slot)) return AuthEndpoints.Err(400, "Ugyldig tidsvindu");
            var planned = b.Day != null && b.Slot != null;
            var manager = c.Has("super") || (c.Has("admin") && c.CompanyId == p.CompanyId);
            var fromMarket = !manager;
            string? driverId;
            if (manager) driverId = b.DriverId;
            else if (c.Has("driver") && c.CompanyId == p.CompanyId)
            {
                if (b.DriverId != null && b.DriverId != c.UserId) return AuthEndpoints.Err(403, "Du kan bare ta oppdrag selv");
                if (!p.Open || p.Status != PickupStatus.Ny) return AuthEndpoints.Err(409, "Oppdraget er ikke på børsen");
                if (!planned) return AuthEndpoints.Err(400, "Velg dag og tidsvindu");
                driverId = c.UserId;
            }
            else return AuthEndpoints.Err(403, "Ingen tilgang");
            if (driverId == null) return AuthEndpoints.Err(400, "Velg sjåfør");
            var driver = await db.Users.Find(u => u.Id == driverId && u.Roles.Driver && u.CompanyId == p.CompanyId && u.Active).FirstOrDefaultAsync();
            if (driver == null) return AuthEndpoints.Err(400, "Sjåføren tilhører ikke firmaet");

            var status = planned ? PickupStatus.Planlagt : PickupStatus.Tildelt;
            var now = DateTime.UtcNow;
            var filter = Builders<Pickup>.Filter.Where(x => x.Id == id && Assignable.Contains(x.Status));
            if (fromMarket) filter &= Builders<Pickup>.Filter.Where(x => x.Open && x.Status == PickupStatus.Ny);
            var updated = await db.Pickups.FindOneAndUpdateAsync(filter,
                Builders<Pickup>.Update.Set(x => x.DriverId, driverId).Set(x => x.Status, status).Set(x => x.Day, planned ? b.Day : null).Set(x => x.Slot, planned ? b.Slot : null)
                    .Set(x => x.Open, false).Set(x => x.UpdatedAt, now).Push(x => x.StatusLog, new StatusLogEntry(status, now, c.UserId)),
                new FindOneAndUpdateOptions<Pickup> { ReturnDocument = ReturnDocument.After });
            if (updated == null) return AuthEndpoints.Err(409, fromMarket ? "Noen andre tok oppdraget" : "Ordren ble endret – prøv igjen");

            var when = planned ? $"{Fmt.Day(b.Day)} {b.Slot}" : "tid ikke avtalt";
            if (driverId != c.UserId)
                await notify.User(driverId, "pickup.assigned", $"Nytt oppdrag {id}", $"{updated.Title} · {updated.Postnr} {updated.Kommune} · {when}", id, planned ? Channels.Sms : Channels.InApp);
            var giverText = planned ? $"{id} er planlagt {when} · {driver.Name}" : $"{id} er tildelt {driver.Name}. Dere får beskjed når tidspunkt er avtalt.";
            if (updated.GiverUserId != null) await notify.User(updated.GiverUserId, planned ? "pickup.planned" : "pickup.assigned", planned ? "Hentingen er planlagt" : "Sjåfør tildelt", giverText, id, planned ? Channels.Sms : Channels.InApp);
            else if (planned && updated.GuestPhone != null) await notify.Sms(updated.GuestPhone, giverText);
            return Results.Ok((await Dtos(db, [updated], suggest: true))[0]);
        });

        g.MapPost("/{id}/start", async (string id, HttpContext ctx, Db db, Notifier notify) =>
        {
            var c = ctx.User.Caller();
            var now = DateTime.UtcNow;
            var p = await db.Pickups.FindOneAndUpdateAsync(x => x.Id == id && x.DriverId == c.UserId && (x.Status == PickupStatus.Planlagt || x.Status == PickupStatus.Tildelt),
                Builders<Pickup>.Update.Set(x => x.Status, PickupStatus.Underveis).Set(x => x.UpdatedAt, now).Push(x => x.StatusLog, new StatusLogEntry(PickupStatus.Underveis, now, c.UserId)),
                new FindOneAndUpdateOptions<Pickup> { ReturnDocument = ReturnDocument.After });
            if (p == null) return await NotYours(db, c, id, "Hentingen kan ikke startes nå");
            var driver = await db.Users.Find(u => u.Id == c.UserId).Project(u => u.Name).FirstOrDefaultAsync();
            var text = $"{driver} er på vei for å hente {p.Title}.";
            if (p.GiverUserId != null) await notify.User(p.GiverUserId, "pickup.started", "Sjåføren er på vei", text, id, Channels.Sms);
            else if (p.GuestPhone != null) await notify.Sms(p.GuestPhone, text);
            return Results.Ok((await Dtos(db, [p]))[0]);
        });

        // Sjåføren bekrefter: minst ett bilde, hentet mengde (kg skaleres), merknad. Giver får kvittering (e-post med PDF / SMS med lenke).
        g.MapPost("/{id}/complete", async (string id, CompleteBody b, HttpContext ctx, Db db, Notifier notify, IMailSender mail, IConfiguration cfg) =>
        {
            var c = ctx.User.Caller();
            var p = await db.Pickups.Find(x => x.Id == id && x.DriverId == c.UserId).FirstOrDefaultAsync();
            if (p == null) return await NotYours(db, c, id, "");
            if (!Assignable.Contains(p.Status) && p.Status != PickupStatus.Underveis || p.Status == PickupStatus.Ny) return AuthEndpoints.Err(409, "Hentingen kan ikke bekreftes nå");
            if (b.Qty < 0 || b.Qty > p.Qty * 10 + 1000) return AuthEndpoints.Err(400, "Ugyldig mengde");
            var photos = await PhotoEndpoints.Attach(db, c, b.PhotoIds, id);
            if (photos.Count == 0) return AuthEndpoints.Err(400, "Ta minst ett bilde av det som hentes");
            var now = DateTime.UtcNow;
            var kg = p.Qty > 0 ? (int)Math.Round(p.EstKg * b.Qty / p.Qty) : p.EstKg;
            var updated = await db.Pickups.FindOneAndUpdateAsync(x => x.Id == id && x.DriverId == c.UserId && Active.Contains(x.Status) && x.Status != PickupStatus.Ny,
                Builders<Pickup>.Update.Set(x => x.Status, PickupStatus.Hentet).Set(x => x.PickedAt, now).Set(x => x.PickedQty, b.Qty).Set(x => x.EstKg, kg)
                    .Set(x => x.PickedPhotos, photos).Set(x => x.PickedNote, (b.Note ?? "").Trim()).Set(x => x.UpdatedAt, now)
                    .Push(x => x.StatusLog, new StatusLogEntry(PickupStatus.Hentet, now, c.UserId)),
                new FindOneAndUpdateOptions<Pickup> { ReturnDocument = ReturnDocument.After });
            if (updated == null) return AuthEndpoints.Err(409, "Hentingen kan ikke bekreftes nå");

            var link = $"{cfg["App:BaseUrl"]}/p/{id}/receipt";
            var body = $"{updated.Title} er hentet og bekreftet. {Fmt.Kg(kg)} holdt i bruk. Kvittering: {link}";
            if (updated.CompanyId != null) await notify.CompanyAdmins(updated.CompanyId, "pickup.done", $"Hentet {id}", body, id);
            if (updated.GiverUserId != null)
            {
                await notify.User(updated.GiverUserId, "pickup.done", "Hentet og bekreftet", body, id, Channels.Sms);
                var giver = await db.Users.Find(u => u.Id == updated.GiverUserId && u.Active).FirstOrDefaultAsync();
                if (giver is { Email: not null, Notif.Email: true })
                {
                    var cat = await db.Categories.Find(x => x.Id == updated.CategoryId).Project(x => x.Name).FirstOrDefaultAsync() ?? "Annet";
                    var driverName = await db.Users.Find(u => u.Id == c.UserId).Project(u => u.Name).FirstOrDefaultAsync() ?? "";
                    var companyName = updated.CompanyId == null ? "" : await db.Companies.Find(x => x.Id == updated.CompanyId).Project(x => x.Name).FirstOrDefaultAsync() ?? "";
                    var pdf = Pdf.Receipt(updated, cat, driverName, companyName, Weight.Co2(kg, cfg));
                    try { await mail.Send(new Mail(giver.Email, $"Kvittering {id} – hentet og bekreftet", body, [new MailAttachment($"kvittering-{id}.pdf", pdf, "application/pdf")])); }
                    catch { /* e-post er best-effort; in-app og SMS er allerede sendt */ }
                }
            }
            else if (updated.GuestPhone != null) await notify.Sms(updated.GuestPhone, body);
            return Results.Ok((await Dtos(db, [updated]))[0]);
        });

        g.MapPost("/{id}/deviation", async (string id, DeviationBody b, HttpContext ctx, Db db, Notifier notify) =>
        {
            var c = ctx.User.Caller();
            if (!Seeder.DeviationReasons.Contains(b.Reason)) return AuthEndpoints.Err(400, "Velg en årsak");
            var p = await db.Pickups.Find(x => x.Id == id).FirstOrDefaultAsync();
            var allowed = p != null && ((p.DriverId != null && p.DriverId == c.UserId) || (c.Has("admin") && c.CompanyId == p.CompanyId) || c.Has("super"));
            if (!allowed) return AuthEndpoints.Err(404, "Fant ikke hentingen");
            var now = DateTime.UtcNow;
            var updated = await db.Pickups.FindOneAndUpdateAsync(x => x.Id == id && Active.Contains(x.Status),
                Builders<Pickup>.Update.Set(x => x.Status, PickupStatus.Avvik).Set(x => x.Deviation, new Deviation(b.Reason!, (b.Note ?? "").Trim(), now))
                    .Set(x => x.Open, false).Set(x => x.UpdatedAt, now).Push(x => x.StatusLog, new StatusLogEntry(PickupStatus.Avvik, now, c.UserId)),
                new FindOneAndUpdateOptions<Pickup> { ReturnDocument = ReturnDocument.After });
            if (updated == null) return AuthEndpoints.Err(409, "Avvik kan bare meldes på aktive hentinger");
            var text = $"{updated.Title}: {b.Reason}{(string.IsNullOrWhiteSpace(b.Note) ? "" : " – " + b.Note!.Trim())}";
            if (updated.CompanyId != null) await notify.CompanyAdmins(updated.CompanyId, "pickup.deviation", $"Avvik på {id}", text, id);
            if (updated.GiverUserId != null) await notify.User(updated.GiverUserId, "pickup.deviation", "Avvik på hentingen", text, id, Channels.Sms);
            else if (updated.GuestPhone != null) await notify.Sms(updated.GuestPhone, $"Avvik på {id}: {text}");
            return Results.Ok((await Dtos(db, [updated]))[0]);
        });

        g.MapPost("/{id}/market", async (string id, MarketBody b, HttpContext ctx, Db db, Notifier notify) =>
        {
            var c = ctx.User.Caller();
            var p = await db.Pickups.Find(x => x.Id == id).FirstOrDefaultAsync();
            if (p == null || !c.Has("admin") || c.CompanyId != p.CompanyId) return AuthEndpoints.Err(404, "Fant ikke hentingen");
            var updated = await db.Pickups.FindOneAndUpdateAsync(x => x.Id == id && x.Status == PickupStatus.Ny,
                Builders<Pickup>.Update.Set(x => x.Open, b.Open).Set(x => x.UpdatedAt, DateTime.UtcNow), new FindOneAndUpdateOptions<Pickup> { ReturnDocument = ReturnDocument.After });
            if (updated == null) return AuthEndpoints.Err(409, "Bare nye ordre kan legges på børsen");
            if (b.Open)
                foreach (var d in await db.Users.Find(u => u.CompanyId == p.CompanyId && u.Roles.Driver && u.Active).Project(u => u.Id).ToListAsync())
                    await notify.User(d, "market.open", "Nytt oppdrag på børsen", $"{p.Title} · {p.Postnr} {p.Kommune}", id);
            return Results.Ok((await Dtos(db, [updated], suggest: true))[0]);
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

    /// 404 hvis ordren ikke finnes eller ikke er sjåførens, ellers 409 med gitt melding.
    static async Task<IResult> NotYours(Db db, Caller c, string id, string conflict)
    {
        var p = await db.Pickups.Find(x => x.Id == id).FirstOrDefaultAsync();
        return p == null || p.DriverId != c.UserId ? AuthEndpoints.Err(404, "Fant ikke hentingen") : AuthEndpoints.Err(409, conflict);
    }

    /// Ordre + oppslag frontend trenger (kategori, firma, sjåfør, meldinger). Statusetikett/farger beregnes i frontend.
    public static async Task<List<object>> Dtos(Db db, List<Pickup> list, bool suggest = false)
    {
        var cats = (await db.Categories.Find(_ => true).ToListAsync()).ToDictionary(c => c.Id);
        var companyIds = list.Select(p => p.CompanyId).OfType<string>().Distinct().ToList();
        var companies = (await db.Companies.Find(c => companyIds.Contains(c.Id)).ToListAsync()).ToDictionary(c => c.Id);
        var driverIds = list.Select(p => p.DriverId).OfType<string>().Distinct().ToList();
        var drivers = (await db.Users.Find(u => driverIds.Contains(u.Id)).ToListAsync()).ToDictionary(u => u.Id);
        // Sjåførforslag: sjåfør i firmaet med kommunen i områdene sine, ellers den med færrest aktive oppdrag.
        var companyDrivers = suggest ? await db.Users.Find(u => companyIds.Contains(u.CompanyId!) && u.Roles.Driver && u.Active).SortBy(u => u.Name).ToListAsync() : [];
        var load = suggest
            ? (await db.Pickups.Aggregate().Match(x => x.DriverId != null && (x.Status == PickupStatus.Tildelt || x.Status == PickupStatus.Planlagt || x.Status == PickupStatus.Underveis))
                .Group(x => x.DriverId, g => new { Id = g.Key, Count = g.Count() }).ToListAsync()).ToDictionary(x => x.Id!, x => x.Count)
            : [];
        return list.Select(p =>
        {
            var cat = cats.GetValueOrDefault(p.CategoryId);
            var company = p.CompanyId == null ? null : companies.GetValueOrDefault(p.CompanyId);
            var driver = p.DriverId == null ? null : drivers.GetValueOrDefault(p.DriverId);
            var candidates = companyDrivers.Where(d => d.CompanyId == p.CompanyId).ToList();
            var byArea = candidates.FirstOrDefault(d => d.Areas?.Contains(p.Kommune) == true);
            var suggested = byArea ?? candidates.OrderBy(d => load.GetValueOrDefault(d.Id)).FirstOrDefault();
            return (object)new
            {
                p.Id, p.CategoryId, categoryName = cat?.Name ?? "Annet", categoryIcon = cat?.Icon ?? "annet", p.Title, p.Desc,
                p.GiverUserId, p.GiverOrg, p.Contact, p.Phone, p.Address, p.Postnr, p.Kommune, p.Lat, p.Lng,
                p.Qty, p.Unit, p.Cond, p.Dims, p.Day, p.Slot, p.Unattended, p.Status, p.Open,
                p.CompanyId, companyName = company?.Name, companyPhone = company?.Phone,
                p.DriverId, driverName = driver?.Name, driverPhone = driver?.Phone,
                p.Photos, p.PickedPhotos, p.EstKg, p.PickedAt, p.PickedQty, p.PickedNote, p.Deviation, p.CancelledAt, p.StatusLog, p.CreatedAt,
                messageCount = p.Messages.Count, lastMessage = p.Messages.LastOrDefault(),
                suggestedDriverId = suggested?.Id, suggestedDriverName = suggested?.Name, suggestedCoversArea = byArea != null,
                suggestedLoad = suggested == null ? 0 : load.GetValueOrDefault(suggested.Id),
            };
        }).ToList();
    }
}
