using MongoDB.Driver;
using Returapp.Api.Models;

namespace Returapp.Api.Services;

[Flags]
public enum Channels { InApp = 0, Sms = 1, Email = 2 }

/// Én vei for alle hendelser: lagrer in-app-varsel, sender push (hvis på) og SMS/e-post når hendelsen er egnet og mottakeren vil ha det.
public class Notifier(Db db, ISmsSender sms, IMailSender mail, IPushSender push, ILogger<Notifier> log)
{
    public async Task User(string userId, string type, string title, string body, string? pickupId = null, Channels channels = Channels.InApp)
    {
        await db.Notifications.InsertOneAsync(new Notification { UserId = userId, Type = type, Title = title, Body = body, PickupId = pickupId, CreatedAt = DateTime.UtcNow });
        var u = await db.Users.Find(x => x.Id == userId && x.Active).FirstOrDefaultAsync();
        if (u == null) return;
        await Push(u, title, body, pickupId != null ? $"/p/{pickupId}" : "/notifications");
        if (channels.HasFlag(Channels.Sms) && u.Notif.Sms && u.Phone != null) await Safe(() => sms.Send(u.Phone, $"Returapp: {title}. {body}"));
        if (channels.HasFlag(Channels.Email) && u.Notif.Email && u.Email != null) await Safe(() => mail.Send(new Mail(u.Email, title, body)));
    }

    public async Task CompanyAdmins(string companyId, string type, string title, string body, string? pickupId = null)
    {
        var admins = await db.Users.Find(u => u.CompanyId == companyId && u.Roles.Admin && u.Active).Project(u => u.Id).ToListAsync();
        foreach (var id in admins) await User(id, type, title, body, pickupId);
    }

    /// Push til mange (systemvarsel); in-app-varslene er allerede lagret av kalleren.
    public async Task PushMany(IEnumerable<string> userIds, string title, string body, string url)
    {
        var ids = userIds.ToList();
        foreach (var u in await db.Users.Find(x => ids.Contains(x.Id) && x.Active && x.Notif.Push && x.PushSubscriptions.Count > 0).ToListAsync())
            await Push(u, title, body, url);
    }

    async Task Push(User u, string title, string body, string url)
    {
        if (!u.Notif.Push || u.PushSubscriptions.Count == 0) return;
        var payload = PushPayload.For(title, body, url);
        foreach (var sub in u.PushSubscriptions)
            if (!await push.Send(sub, payload))
                await db.Users.UpdateOneAsync(x => x.Id == u.Id, Builders<User>.Update.PullFilter(x => x.PushSubscriptions, s => s.Endpoint == sub.Endpoint));
    }

    /// Gjest (ingen konto) får alltid SMS.
    public Task Sms(string phone, string text) => Safe(() => sms.Send(phone, "Returapp: " + text));

    async Task Safe(Func<Task> send)
    {
        try { await send(); }
        catch (Exception e) { log.LogWarning(e, "Varsel kunne ikke sendes"); }
    }
}
