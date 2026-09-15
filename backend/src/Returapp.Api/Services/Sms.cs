using System.Collections.Concurrent;
using System.Net.Http.Headers;
using System.Text;

namespace Returapp.Api.Services;

public interface ISmsSender
{
    Task Send(string to, string text);
}

// Dev/test: logger meldingen og husker siste melding per mottaker (for /api/dev/last-sms og tester). Ingen disk.
public class ConsoleSmsSender(ILogger<ConsoleSmsSender> log) : ISmsSender
{
    public ConcurrentDictionary<string, string> Last { get; } = new();

    public Task Send(string to, string text)
    {
        log.LogInformation("[SMS] {To}: {Text}", to, text);
        Last[to] = text;
        return Task.CompletedTask;
    }
}

// Twilio REST uten SDK: ett POST-kall.
public class TwilioSmsSender(HttpClient http, IConfiguration cfg) : ISmsSender
{
    public async Task Send(string to, string text)
    {
        var sid = cfg["Twilio:AccountSid"];
        var req = new HttpRequestMessage(HttpMethod.Post, $"https://api.twilio.com/2010-04-01/Accounts/{sid}/Messages.json")
        {
            Content = new FormUrlEncodedContent(new Dictionary<string, string> { ["From"] = cfg["Sms:From"] ?? "Returapp", ["To"] = to, ["Body"] = text }),
        };
        req.Headers.Authorization = new AuthenticationHeaderValue("Basic", Convert.ToBase64String(Encoding.UTF8.GetBytes($"{sid}:{cfg["Twilio:AuthToken"]}")));
        (await http.SendAsync(req)).EnsureSuccessStatusCode();
    }
}
