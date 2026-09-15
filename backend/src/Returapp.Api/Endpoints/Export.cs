using System.Text;
using ClosedXML.Excel;
using MongoDB.Driver;
using Returapp.Api.Models;
using Returapp.Api.Services;

namespace Returapp.Api.Endpoints;

/// Eksport av hentinger som CSV, Excel og PDF. Alt bygges i minnet og returneres direkte – ingenting skrives til disk.
public static class ExportEndpoints
{
    static readonly string[] Headers = ["Referanse", "Opprettet", "Status", "Kategori", "Tittel", "Mengde", "Enhet", "Tilstand", "Adresse", "Postnr", "Kommune", "Giver", "Kontakt", "Hentefirma", "Sjåfør", "Planlagt dag", "Tidsvindu", "Hentet", "Hentet mengde", "Anslått kg", "CO₂ kg", "Avvik"];

    static readonly Dictionary<string, string> StatusLabels = new()
    {
        [PickupStatus.Ny] = "Mottatt", [PickupStatus.Tildelt] = "Tildelt", [PickupStatus.Planlagt] = "Planlagt", [PickupStatus.Underveis] = "Under henting",
        [PickupStatus.Hentet] = "Hentet", [PickupStatus.Avvik] = "Avvik", [PickupStatus.Avbrutt] = "Avbrutt",
    };

    record Data(string Heading, string Period, List<Pickup> Pickups, Dictionary<string, string> Cats, Dictionary<string, string> Companies, Dictionary<string, string> Drivers, IConfiguration Cfg)
    {
        public string Cat(Pickup p) => Cats.GetValueOrDefault(p.CategoryId, "Annet");
        public string Company(Pickup p) => p.CompanyId == null ? "" : Companies.GetValueOrDefault(p.CompanyId, "");
        public string Driver(Pickup p) => p.DriverId == null ? "" : Drivers.GetValueOrDefault(p.DriverId, "");
        public int Co2(Pickup p) => Weight.Co2(p.EstKg, Cfg);
        public List<Pickup> Picked => Pickups.Where(p => p.Status == PickupStatus.Hentet).ToList();

        public List<object?[]> Rows() => Pickups.Select(p => new object?[]
        {
            p.Id, Fmt.Local(p.CreatedAt), StatusLabels.GetValueOrDefault(p.Status, p.Status), Cat(p), p.Title, p.Qty, p.Unit, p.Cond, p.Address, p.Postnr, p.Kommune,
            p.GiverOrg, p.Contact, Company(p), Driver(p), p.Day, p.Slot, p.PickedAt is { } at ? Fmt.Local(at) : null, p.PickedQty, p.EstKg, Co2(p),
            p.Deviation is { } d ? d.Reason + (string.IsNullOrEmpty(d.Note) ? "" : " – " + d.Note) : null,
        }).ToList();

        /// Miljøeffekt per kategori regnes bare for hentede ordre.
        public List<(string Name, int Count, int Kg, int Co2)> PerCategory() => Picked.GroupBy(Cat)
            .Select(g => (g.Key, g.Count(), g.Sum(p => p.EstKg), Weight.Co2(g.Sum(p => p.EstKg), Cfg))).OrderByDescending(x => x.Item3).ToList();
    }

    public static void MapExport(this WebApplication app)
    {
        app.MapGet("/api/export/pickups.{format}", async (string format, string? scope, DateOnly? from, DateOnly? to, HttpContext ctx, Db db, IConfiguration cfg) =>
        {
            if (format is not ("csv" or "xlsx" or "pdf")) return AuthEndpoints.Err(404, "Ukjent format");
            var c = ctx.User.Caller();
            var f = Builders<Pickup>.Filter;
            FilterDefinition<Pickup> q;
            string heading;
            if ((scope ?? "mine") == "mine")
            {
                q = c.IsGuest ? f.Eq(p => p.GuestId, c.GuestId) : f.Eq(p => p.GiverUserId, c.UserId);
                heading = c.IsGuest ? "Mine hentinger" : await db.Users.Find(u => u.Id == c.UserId).Project(u => u.Org).FirstOrDefaultAsync() is { Length: > 0 } org ? org : "Mine hentinger";
            }
            else if (scope == "company")
            {
                if (!c.Has("admin") || c.CompanyId == null) return AuthEndpoints.Err(403, "Kun for hentefirma");
                q = f.Eq(p => p.CompanyId, c.CompanyId);
                heading = await db.Companies.Find(x => x.Id == c.CompanyId).Project(x => x.Name).FirstOrDefaultAsync() ?? "Hentefirma";
            }
            else return AuthEndpoints.Err(400, "Ukjent scope");

            // Periode i norsk tid på opprettet-dato.
            if (from is { } fd) q &= f.Gte(p => p.CreatedAt, TimeZoneInfo.ConvertTimeToUtc(fd.ToDateTime(TimeOnly.MinValue), Fmt.Oslo));
            if (to is { } td) q &= f.Lt(p => p.CreatedAt, TimeZoneInfo.ConvertTimeToUtc(td.AddDays(1).ToDateTime(TimeOnly.MinValue), Fmt.Oslo));
            var list = await db.Pickups.Find(q).SortByDescending(p => p.CreatedAt).ToListAsync();

            var companyIds = list.Select(p => p.CompanyId).OfType<string>().Distinct().ToList();
            var driverIds = list.Select(p => p.DriverId).OfType<string>().Distinct().ToList();
            var first = from ?? (list.Count == 0 ? Fmt.Today() : DateOnly.FromDateTime(Fmt.Local(list[^1].CreatedAt)));
            var data = new Data(heading, $"{first:dd.MM.yyyy}–{to ?? Fmt.Today():dd.MM.yyyy}", list,
                (await db.Categories.Find(_ => true).ToListAsync()).ToDictionary(x => x.Id, x => x.Name),
                (await db.Companies.Find(x => companyIds.Contains(x.Id)).ToListAsync()).ToDictionary(x => x.Id, x => x.Name),
                (await db.Users.Find(u => driverIds.Contains(u.Id)).ToListAsync()).ToDictionary(u => u.Id, u => u.Name), cfg);

            var name = $"returapp-hentinger-{Fmt.Today():yyyy-MM-dd}.{format}";
            return format switch
            {
                "csv" => Results.File(Csv(data), "text/csv; charset=utf-8", name),
                "xlsx" => Results.File(Xlsx(data), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", name),
                _ => Results.File(Pdf.Report(data.Heading, data.Period, data.PerCategory(),
                    data.Pickups.Select(p => new[] { p.Id, Fmt.Local(p.CreatedAt).ToString("dd.MM.yy"), p.Title, StatusLabels.GetValueOrDefault(p.Status, p.Status), p.Status == PickupStatus.Hentet ? Fmt.Kg(p.EstKg) : "" }).ToList(),
                    data.Picked.Select(p => (p, data.Cat(p), data.Driver(p), data.Company(p), data.Co2(p))).ToList()), "application/pdf", name),
            };
        }).RequireAuthorization("user");
    }

    /// UTF-8 med BOM og semikolon, slik norsk Excel åpner den direkte.
    static byte[] Csv(Data data)
    {
        var sb = new StringBuilder();
        sb.AppendJoin(';', Headers.Select(Field)).Append("\r\n");
        foreach (var row in data.Rows()) sb.AppendJoin(';', row.Select(Field)).Append("\r\n");
        return [.. Encoding.UTF8.GetPreamble(), .. Encoding.UTF8.GetBytes(sb.ToString())];
    }

    static string Field(object? v) => v switch
    {
        null => "",
        DateTime d => d.ToString("yyyy-MM-dd HH:mm"),
        double n => n.ToString("0.##", Fmt.Nb),
        int n => n.ToString(Fmt.Nb),
        _ => Quote(v.ToString()!),
    };

    /// Tekst fra brukere: siteres ved behov, og celler som starter som en formel får ' foran (hindrer formel-injeksjon i Excel).
    static string Quote(string s)
    {
        if (s.Length > 0 && s[0] is '=' or '+' or '-' or '@' or '\t' or '\r') s = "'" + s;
        return s.IndexOfAny([';', '"', '\n', '\r']) >= 0 ? "\"" + s.Replace("\"", "\"\"") + "\"" : s;
    }

    static byte[] Xlsx(Data data)
    {
        using var wb = new XLWorkbook();
        var ws = wb.AddWorksheet("Hentinger");
        Sheet(ws, Headers, data.Rows());
        ws.Column(2).Style.DateFormat.Format = ws.Column(18).Style.DateFormat.Format = "yyyy-mm-dd hh:mm";

        var perCat = data.PerCategory();
        var sum = wb.AddWorksheet("Per kategori");
        Sheet(sum, ["Kategori", "Antall hentet", "Kg", "CO₂ kg"], [.. perCat.Select(x => new object?[] { x.Name, x.Count, x.Kg, x.Co2 }),
            new object?[] { "Totalt", perCat.Sum(x => x.Count), perCat.Sum(x => x.Kg), perCat.Sum(x => x.Co2) }]);
        sum.LastRowUsed()!.Style.Font.Bold = true;

        using var ms = new MemoryStream();
        wb.SaveAs(ms);
        return ms.ToArray();
    }

    /// Tekst settes alltid som tekst (aldri formel). Kolonnebredde settes fast – AdjustToContents krever fonter i containeren.
    static void Sheet(IXLWorksheet ws, string[] headers, List<object?[]> rows)
    {
        for (var i = 0; i < headers.Length; i++) ws.Cell(1, i + 1).Value = headers[i];
        ws.Row(1).Style.Font.Bold = true;
        for (var r = 0; r < rows.Count; r++)
            for (var i = 0; i < rows[r].Length; i++)
                ws.Cell(r + 2, i + 1).Value = rows[r][i] switch
                {
                    null => Blank.Value,
                    DateTime d => d,
                    double n => n,
                    int n => n,
                    var v => v.ToString(),
                };
        ws.Columns(1, headers.Length).Width = 16;
        ws.SheetView.FreezeRows(1);
    }
}
