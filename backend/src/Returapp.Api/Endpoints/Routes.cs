using MongoDB.Bson;
using MongoDB.Driver;
using Returapp.Api.Models;
using Returapp.Api.Services;

namespace Returapp.Api.Endpoints;

public static class RouteEndpoints
{
    public record RouteBody(string DriverId, string Date, List<string> PickupIds);
    public record SendBody(string DriverId, string Date);

    public static void MapRoutes(this WebApplication app)
    {
        var g = app.MapGroup("/api/routes").RequireAuthorization("user");

        // Sjåførens planlagte/pågående stopp for en dato i lagret rekkefølge; nye stopp legges bakerst.
        // Uten dato: første dag fra i dag med stopp (ellers i dag).
        g.MapGet("", async (string? driverId, string? date, HttpContext ctx, Db db, Geo geo) =>
        {
            var c = ctx.User.Caller();
            driverId ??= c.UserId;
            if (!await CanSee(db, c, driverId!)) return AuthEndpoints.Err(404, "Fant ikke sjåføren");
            date ??= await NextDateWithStops(db, driverId!) ?? Fmt.Today().ToString("yyyy-MM-dd");
            return Results.Ok(await View(db, geo, driverId!, date));
        });

        g.MapPut("", async (RouteBody b, HttpContext ctx, Db db, Geo geo) =>
        {
            var c = ctx.User.Caller();
            if (!await CanSee(db, c, b.DriverId)) return AuthEndpoints.Err(404, "Fant ikke sjåføren");
            var stops = await Stops(db, b.DriverId, b.Date);
            if (b.PickupIds.Any(id => stops.All(p => p.Id != id))) return AuthEndpoints.Err(400, "Ruten inneholder ukjente stopp");
            await db.Routes.UpdateOneAsync(r => r.DriverId == b.DriverId && r.Date == b.Date,
                Builders<RoutePlan>.Update.Set(r => r.PickupIds, b.PickupIds).Set(r => r.UpdatedAt, DateTime.UtcNow).SetOnInsert(r => r.Id, ObjectId.GenerateNewId().ToString()), new UpdateOptions { IsUpsert = true });
            return Results.Ok(await View(db, geo, b.DriverId, b.Date));
        });

        g.MapPost("/send", async (SendBody b, HttpContext ctx, Db db, Geo geo, Notifier notify) =>
        {
            var c = ctx.User.Caller();
            if (!await CanSee(db, c, b.DriverId) || c.UserId == b.DriverId && !c.Has("admin")) return AuthEndpoints.Err(404, "Fant ikke sjåføren");
            var stops = (await Stops(db, b.DriverId, b.Date)).Count;
            await db.Routes.UpdateOneAsync(r => r.DriverId == b.DriverId && r.Date == b.Date,
                Builders<RoutePlan>.Update.Set(r => r.SentAt, DateTime.UtcNow).Set(r => r.UpdatedAt, DateTime.UtcNow).SetOnInsert(r => r.Id, ObjectId.GenerateNewId().ToString()), new UpdateOptions { IsUpsert = true });
            await notify.User(b.DriverId, "route.sent", "Ruten er klar", $"Ruten for {Fmt.Day(b.Date)} er klar: {stops} stopp.", channels: Channels.Sms);
            return Results.Ok(await View(db, geo, b.DriverId, b.Date));
        });
    }

    /// Superbruker, admin i sjåførens firma, eller sjåføren selv.
    static async Task<bool> CanSee(Db db, Caller c, string driverId)
    {
        if (c.UserId == driverId && c.Has("driver")) return true;
        var driver = await db.Users.Find(u => u.Id == driverId && u.Roles.Driver).FirstOrDefaultAsync();
        return driver != null && (c.Has("super") || (c.Has("admin") && driver.CompanyId == c.CompanyId));
    }

    static Task<List<Pickup>> Stops(Db db, string driverId, string date) =>
        db.Pickups.Find(p => p.DriverId == driverId && p.Day == date && (p.Status == PickupStatus.Planlagt || p.Status == PickupStatus.Underveis))
            .SortBy(p => p.Slot).ThenBy(p => p.CreatedAt).ToListAsync();

    static async Task<string?> NextDateWithStops(Db db, string driverId)
    {
        var today = Fmt.Today().ToString("yyyy-MM-dd");
        return await db.Pickups.Find(p => p.DriverId == driverId && p.Day != null && p.Day.CompareTo(today) >= 0 && (p.Status == PickupStatus.Planlagt || p.Status == PickupStatus.Underveis))
            .SortBy(p => p.Day).Project(p => p.Day).FirstOrDefaultAsync();
    }

    public static async Task<object> View(Db db, Geo geo, string driverId, string date)
    {
        var stops = await Stops(db, driverId, date);
        var plan = await db.Routes.Find(r => r.DriverId == driverId && r.Date == date).FirstOrDefaultAsync();
        var order = (plan?.PickupIds ?? []).Where(id => stops.Any(p => p.Id == id)).ToList();
        order.AddRange(stops.Select(p => p.Id).Where(id => !order.Contains(id)));
        var ordered = order.Select(id => stops.First(p => p.Id == id)).ToList();

        foreach (var p in ordered.Where(p => p.Lat == null))
            if (await geo.Lookup(p.Address, p.Postnr) is { } pos)
            {
                (p.Lat, p.Lng) = (pos.Lat, pos.Lng);
                await db.Pickups.UpdateOneAsync(x => x.Id == p.Id, Builders<Pickup>.Update.Set(x => x.Lat, pos.Lat).Set(x => x.Lng, pos.Lng));
            }
        var km = Geo.RouteKm(ordered.Where(p => p.Lat != null).Select(p => (p.Lat!.Value, p.Lng!.Value)));
        return new { driverId, date, km, sentAt = plan?.SentAt, stops = await PickupEndpoints.Dtos(db, ordered) };
    }
}
