using System.Collections.Concurrent;
using System.Net;
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
