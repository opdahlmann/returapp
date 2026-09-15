using System.Net;
using System.Text;
using ClosedXML.Excel;
using Microsoft.AspNetCore.Identity;
using MongoDB.Driver;
using Returapp.Api.Models;

namespace Returapp.Api.Tests;

/// Eget testfirma, admin og giver med ordre satt inn direkte – ingen demo-data endres.
[Collection("api")]
public class ExportTests(ApiFixture api) : IAsyncLifetime
{
    readonly string run = ApiFixture.RunId + Random.Shared.Next(100, 999);
    Company company = null!;
    User admin = null!, giver = null!;
    readonly List<string> pickups = [];

    public async Task InitializeAsync()
    {
        company = new Company { Id = "tx-" + run, Name = "Eksporthent " + run, City = "Åmli", Status = CompanyStatus.Aktiv, CreatedAt = DateTime.UtcNow };
        await api.Db.Companies.InsertOneAsync(company);
        admin = await NewUser("admin", new() { Admin = true }, company.Id);
        giver = await NewUser("giver", new() { Giver = true }, null);
        var now = DateTime.UtcNow;
        await Insert("1", company.Id, PickupStatus.Hentet, now.AddDays(-2), p => { p.EstKg = 1200; p.PickedAt = now.AddDays(-1); p.PickedQty = 20; });
        await Insert("2", company.Id, PickupStatus.Ny, now.AddDays(-1), p => { p.Contact = "=HYPERLINK(\"http://x\")"; p.Address = "Gate 1; bakgård"; });
        await Insert("3", "omb", PickupStatus.Avvik, now.AddDays(-40), p => p.Deviation = new Deviation("Ikke tilgjengelig", "Porten stengt", now));
    }

    public async Task DisposeAsync()
    {
        await api.Db.Pickups.DeleteManyAsync(p => pickups.Contains(p.Id));
        await api.Db.Users.DeleteManyAsync(u => u.Email!.EndsWith(run + "@test.returapp.no"));
        await api.Db.Companies.DeleteOneAsync(c => c.Id == company.Id);
    }

    async Task<User> NewUser(string name, Roles roles, string? companyId)
    {
        var u = new User { Name = $"Test {name} {run}", Email = $"{name}-{run}@test.returapp.no", Org = "Eksportbygg AS", Roles = roles, CompanyId = companyId, CreatedAt = DateTime.UtcNow };
        u.PasswordHash = new PasswordHasher<User>().HashPassword(u, "passord123");
        await api.Db.Users.InsertOneAsync(u);
        return u;
    }

    async Task Insert(string n, string companyId, string status, DateTime created, Action<Pickup> set)
    {
        var p = new Pickup { Id = $"RX-{run}-{n}", CategoryId = "vinduer", Title = $"{n} vinduer {run}", GiverUserId = giver.Id, GiverOrg = "Eksportbygg AS", Contact = "Jonas", Address = "Tangen 8", Postnr = "4608", Kommune = "Kristiansand", Qty = 24, Status = status, CompanyId = companyId, EstKg = 100, CreatedAt = created, UpdatedAt = created };
        set(p);
        pickups.Add(p.Id);
        await api.Db.Pickups.InsertOneAsync(p);
    }

    async Task<(HttpResponseMessage Res, byte[] Body)> Get(User u, string url)
    {
        var res = await api.Client((await api.Tokens(u.Email!, "passord123")).GetProperty("accessToken").GetString()).GetAsync(url);
        return (res, await res.Content.ReadAsByteArrayAsync());
    }

    [Fact]
    public async Task Csv_has_bom_semicolons_one_row_per_pickup_and_guards_formulas()
    {
        var (res, body) = await Get(giver, "/api/export/pickups.csv?scope=mine");
        Assert.Equal(HttpStatusCode.OK, res.StatusCode);
        Assert.Equal("text/csv", res.Content.Headers.ContentType!.MediaType);
        Assert.Equal(Encoding.UTF8.GetPreamble(), body[..3]);
        var lines = Encoding.UTF8.GetString(body[3..]).Split("\r\n", StringSplitOptions.RemoveEmptyEntries);
        Assert.Equal(4, lines.Length);
        Assert.StartsWith("Referanse;Opprettet;Status;Kategori;Tittel;Mengde", lines[0]);
        Assert.Equal(22, lines[0].Split(';').Length);
        Assert.Contains(lines, l => l.StartsWith($"RX-{run}-1;") && l.Contains(";Hentet;Vinduer;") && l.Contains(";1200;1080;"));
        var injected = lines.Single(l => l.StartsWith($"RX-{run}-2;"));
        Assert.Contains("\"'=HYPERLINK(\"\"http://x\"\")\"", injected);
        Assert.Contains("\"Gate 1; bakgård\"", injected);
        Assert.Contains("Ikke tilgjengelig – Porten stengt", lines.Single(l => l.StartsWith($"RX-{run}-3;")));

        var (_, recent) = await Get(giver, $"/api/export/pickups.csv?scope=mine&from={DateTime.UtcNow.AddDays(-7):yyyy-MM-dd}");
        Assert.Equal(3, Encoding.UTF8.GetString(recent).Split("\r\n", StringSplitOptions.RemoveEmptyEntries).Length);
    }

    [Fact]
    public async Task Xlsx_has_pickups_and_category_sheets()
    {
        var (res, body) = await Get(giver, "/api/export/pickups.xlsx?scope=mine");
        Assert.Equal(HttpStatusCode.OK, res.StatusCode);
        using var wb = new XLWorkbook(new MemoryStream(body));
        Assert.Equal(["Hentinger", "Per kategori"], wb.Worksheets.Select(w => w.Name));
        var ws = wb.Worksheet("Hentinger");
        Assert.Equal(4, ws.LastRowUsed()!.RowNumber());
        Assert.Equal("=HYPERLINK(\"http://x\")", ws.Search($"RX-{run}-2").Single().WorksheetRow().Cell(13).GetString());
        Assert.False(ws.Search($"RX-{run}-2").Single().WorksheetRow().Cell(13).HasFormula);
        var cat = wb.Worksheet("Per kategori");
        Assert.Equal("Vinduer", cat.Cell(2, 1).GetString());
        Assert.Equal(1, cat.Cell(2, 2).GetValue<int>());
        Assert.Equal(1200, cat.Cell(2, 3).GetValue<int>());
        Assert.Equal("Totalt", cat.Cell(3, 1).GetString());
    }

    [Fact]
    public async Task Pdf_report_is_generated_in_memory()
    {
        var (res, body) = await Get(giver, "/api/export/pickups.pdf?scope=mine");
        Assert.Equal(HttpStatusCode.OK, res.StatusCode);
        Assert.Equal("application/pdf", res.Content.Headers.ContentType!.MediaType);
        Assert.True(body.Length > 1024);
        Assert.Equal("%PDF", Encoding.ASCII.GetString(body[..4]));
    }

    [Fact]
    public async Task Admin_gets_only_own_company_and_giver_cannot_export_company()
    {
        var (res, body) = await Get(admin, "/api/export/pickups.csv?scope=company");
        Assert.Equal(HttpStatusCode.OK, res.StatusCode);
        var text = Encoding.UTF8.GetString(body);
        Assert.Contains($"RX-{run}-1;", text);
        Assert.Contains($"RX-{run}-2;", text);
        Assert.DoesNotContain($"RX-{run}-3;", text);
        Assert.Equal(3, text.Split("\r\n", StringSplitOptions.RemoveEmptyEntries).Length);

        Assert.Equal(HttpStatusCode.Forbidden, (await Get(giver, "/api/export/pickups.csv?scope=company")).Res.StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await Get(giver, "/api/export/pickups.doc?scope=mine")).Res.StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await api.Client().GetAsync("/api/export/pickups.csv")).StatusCode);
    }
}
