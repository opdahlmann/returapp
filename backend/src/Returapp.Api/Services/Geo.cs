using System.Net.Http.Json;
using System.Text.Json;

namespace Returapp.Api.Services;

/// Kartverkets adresse-API (gratis, ingen nøkkel). Best-effort: 2 s timeout, null ved feil.
public class Geo(HttpClient http, IConfiguration cfg)
{
    public async Task<(double Lat, double Lng)?> Lookup(string address, string postnr)
    {
        if (!cfg.GetValue("App:Geocode", true)) return null;
        try
        {
            using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(2));
            var doc = await http.GetFromJsonAsync<JsonElement>(
                $"https://ws.geonorge.no/adresser/v1/sok?sok={Uri.EscapeDataString(address)}&postnummer={postnr}&treffPerSide=1&utkoordsys=4258", cts.Token);
            var p = doc.GetProperty("adresser")[0].GetProperty("representasjonspunkt");
            return (p.GetProperty("lat").GetDouble(), p.GetProperty("lon").GetDouble());
        }
        catch
        {
            return null;
        }
    }
}
