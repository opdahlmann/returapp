using System.Net.Http.Json;
using System.Text.Json;

namespace Returapp.Api.Services;

/// Kartverkets adresse-API (gratis, ingen nøkkel). Best-effort: 2 s timeout, null ved feil.
public class Geo(HttpClient http, IConfiguration cfg)
{
    /// Km-estimat for en rute: luftlinje mellom påfølgende punkter × 1,3. Stopp uten koordinater hoppes over.
    // ponytail: luftlinje × 1,3; bytt til ruting-API (OSRM/Google) hvis admin trenger nøyaktige tall
    public static int RouteKm(IEnumerable<(double Lat, double Lng)> points)
    {
        var list = points.ToList();
        double km = 0;
        for (var i = 1; i < list.Count; i++) km += Haversine(list[i - 1], list[i]);
        return (int)Math.Round(km * 1.3);
    }

    static double Haversine((double Lat, double Lng) a, (double Lat, double Lng) b)
    {
        const double R = 6371;
        double Rad(double d) => d * Math.PI / 180;
        var h = Math.Pow(Math.Sin(Rad(b.Lat - a.Lat) / 2), 2) + Math.Cos(Rad(a.Lat)) * Math.Cos(Rad(b.Lat)) * Math.Pow(Math.Sin(Rad(b.Lng - a.Lng) / 2), 2);
        return 2 * R * Math.Asin(Math.Sqrt(h));
    }

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
