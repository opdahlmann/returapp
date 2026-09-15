using MongoDB.Driver;
using Returapp.Api.Models;
using Returapp.Api.Services;

namespace Returapp.Api.Endpoints;

public static class NotificationEndpoints
{
    public record ReadBody(List<string>? Ids);
    public record SubscriptionBody(string? Endpoint, SubscriptionKeys? Keys);
    public record SubscriptionKeys(string? P256dh, string? Auth);
    public record MessageBody(string? Text);

    public static void MapNotifications(this WebApplication app)
    {
        var g = app.MapGroup("/api").RequireAuthorization("user");

        g.MapGet("/notifications", async (HttpContext ctx, Db db) =>
        {
            var id = ctx.User.Caller().UserId;
            var items = await db.Notifications.Find(n => n.UserId == id).SortByDescending(n => n.CreatedAt).Limit(50).ToListAsync();
            var unread = await db.Notifications.CountDocumentsAsync(n => n.UserId == id && n.ReadAt == null);
            return Results.Ok(new { items, unread });
        });

        g.MapPost("/notifications/read", async (ReadBody b, HttpContext ctx, Db db) =>
        {
            var id = ctx.User.Caller().UserId;
            var filter = Builders<Notification>.Filter.Where(n => n.UserId == id && n.ReadAt == null);
            if (b.Ids is { Count: > 0 }) filter &= Builders<Notification>.Filter.In(n => n.Id, b.Ids);
            await db.Notifications.UpdateManyAsync(filter, Builders<Notification>.Update.Set(n => n.ReadAt, DateTime.UtcNow));
            return Results.Ok();
        });

        app.MapGet("/api/push/key", (IConfiguration cfg) => Results.Ok(new { publicKey = string.IsNullOrEmpty(cfg["Push:PublicKey"]) ? null : cfg["Push:PublicKey"] }));

        g.MapPost("/me/push", async (SubscriptionBody b, HttpContext ctx, Db db) =>
        {
            if (b.Endpoint is not { Length: > 10 } || b.Keys?.P256dh == null || b.Keys.Auth == null || !b.Endpoint.StartsWith("https://")) return AuthEndpoints.Err(400, "Ugyldig push-abonnement");
            var id = ctx.User.Caller().UserId;
            await db.Users.UpdateOneAsync(u => u.Id == id, Builders<User>.Update.PullFilter(u => u.PushSubscriptions, s => s.Endpoint == b.Endpoint));
            await db.Users.UpdateOneAsync(u => u.Id == id, Builders<User>.Update.PushEach(u => u.PushSubscriptions, [new PushSub(b.Endpoint, b.Keys.P256dh, b.Keys.Auth)], slice: -5)
                .Set(u => u.Notif.Push, true));
            return Results.Ok();
        });

        g.MapDelete("/me/push", async (string endpoint, HttpContext ctx, Db db) =>
        {
            var id = ctx.User.Caller().UserId;
            await db.Users.UpdateOneAsync(u => u.Id == id, Builders<User>.Update.PullFilter(u => u.PushSubscriptions, s => s.Endpoint == endpoint));
            return Results.NoContent();
        });

        // Én tråd per ordre mellom giver og sjåfør/hentefirma. Superbruker kan lese og skrive.
        g.MapGet("/pickups/{id}/messages", async (string id, HttpContext ctx, Db db) =>
        {
            var p = await db.Pickups.Find(x => x.Id == id).FirstOrDefaultAsync();
            if (p == null || !PickupEndpoints.CanRead(ctx.User.Caller(), p)) return AuthEndpoints.Err(404, "Fant ikke hentingen");
            var senderIds = p.Messages.Select(m => m.FromUserId).Distinct().ToList();
            var names = (await db.Users.Find(u => senderIds.Contains(u.Id)).ToListAsync()).ToDictionary(u => u.Id, u => u.Name);
            return Results.Ok(p.Messages.Select(m => new { m.FromUserId, fromName = names.GetValueOrDefault(m.FromUserId, ""), m.Text, m.At }));
        });

        g.MapPost("/pickups/{id}/messages", async (string id, MessageBody b, HttpContext ctx, Db db, Notifier notify) =>
        {
            var c = ctx.User.Caller();
            var text = (b.Text ?? "").Trim();
            if (text.Length is 0 or > 2000) return AuthEndpoints.Err(400, "Meldingen må ha 1–2000 tegn");
            var p = await db.Pickups.Find(x => x.Id == id).FirstOrDefaultAsync();
            if (p == null || !PickupEndpoints.CanRead(c, p)) return AuthEndpoints.Err(404, "Fant ikke hentingen");
            var now = DateTime.UtcNow;
            await db.Pickups.UpdateOneAsync(x => x.Id == id, Builders<Pickup>.Update.Push(x => x.Messages, new Message(c.UserId!, text, now)).Set(x => x.UpdatedAt, now));

            var sender = await db.Users.Find(u => u.Id == c.UserId).Project(u => u.Name).FirstOrDefaultAsync() ?? "";
            var title = $"Melding fra {sender}";
            var body = $"{p.Id}: {text}";
            var fromGiver = p.GiverUserId == c.UserId;
            var recipients = fromGiver
                ? (p.DriverId != null ? [p.DriverId] : p.CompanyId == null ? [] : await db.Users.Find(u => u.CompanyId == p.CompanyId && u.Roles.Admin && u.Active).Project(u => u.Id).ToListAsync())
                : p.GiverUserId != null ? [p.GiverUserId] : new List<string>();
            foreach (var uid in recipients.Where(r => r != c.UserId))
            {
                // Maks én SMS per 10 min per tråd og mottaker – resten kommer som in-app/push.
                var recent = await db.Notifications.Find(n => n.UserId == uid && n.PickupId == id && n.Type == "message" && n.CreatedAt > now.AddMinutes(-10)).AnyAsync();
                await notify.User(uid, "message", title, body, id, recent ? Channels.InApp : Channels.Sms);
            }
            if (!fromGiver && p.GiverUserId == null && p.GuestPhone != null && (p.GuestSmsAt == null || p.GuestSmsAt < now.AddMinutes(-10)))
            {
                await notify.Sms(p.GuestPhone, $"{title} om {p.Id}: {text}");
                await db.Pickups.UpdateOneAsync(x => x.Id == id, Builders<Pickup>.Update.Set(x => x.GuestSmsAt, now));
            }
            return Results.Ok(new { fromUserId = c.UserId, fromName = sender, text, at = now });
        });
    }
}
