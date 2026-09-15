using System.Collections.Concurrent;
using System.Net;
using System.Text.Json;
using Returapp.Api.Models;
using WebPush;

namespace Returapp.Api.Services;

public interface IPushSender
{
    /// false = abonnementet finnes ikke lenger (404/410) og skal fjernes.
    Task<bool> Send(PushSub sub, string payload);
}

/// Uten VAPID-nøkler (dev/test): logger og husker siste payload per endpoint.
public class ConsolePushSender(ILogger<ConsolePushSender> log) : IPushSender
{
    public ConcurrentDictionary<string, string> Last { get; } = new();

    public Task<bool> Send(PushSub sub, string payload)
    {
        log.LogInformation("[Push] {Endpoint}: {Payload}", sub.Endpoint, payload);
        Last[sub.Endpoint] = payload;
        return Task.FromResult(true);
    }
}

public class WebPushSender(IConfiguration cfg, ILogger<WebPushSender> log) : IPushSender
{
    readonly WebPushClient client = new();
    readonly VapidDetails vapid = new(cfg["Push:Subject"] ?? "mailto:drift@returapp.no", cfg["Push:PublicKey"], cfg["Push:PrivateKey"]);

    public async Task<bool> Send(PushSub sub, string payload)
    {
        try
        {
            await client.SendNotificationAsync(new PushSubscription(sub.Endpoint, sub.P256dh, sub.Auth), payload, vapid);
            return true;
        }
        catch (WebPushException e) when (e.StatusCode is HttpStatusCode.NotFound or HttpStatusCode.Gone)
        {
            return false;
        }
        catch (Exception e)
        {
            log.LogWarning(e, "Push kunne ikke sendes");
            return true;
        }
    }
}

public static class PushPayload
{
    /// Format Angulars service worker forstår: viser varsel og åpner url ved klikk.
    public static string For(string title, string body, string url) => JsonSerializer.Serialize(new
    {
        notification = new
        {
            title, body, icon = "/icons/icon-192x192.png", badge = "/icons/icon-192x192.png",
            data = new { onActionClick = new { @default = new { operation = "navigateLastFocusedOrOpen", url } } },
        },
    });
}
