using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.AspNetCore.Identity;
using MongoDB.Driver;
using Returapp.Api.Models;

namespace Returapp.Api.Tests;

[Collection("api")]
public class SuperTests(ApiFixture api) : IAsyncLifetime
{
    readonly string run = ApiFixture.RunId + Random.Shared.Next(100, 999);
    readonly List<string> companies = [], pickups = [], users = [];

    public Task InitializeAsync() => Task.CompletedTask;

    public async Task DisposeAsync()
    {
        await api.Db.Pickups.DeleteManyAsync(p => pickups.Contains(p.Id));
        await api.Db.Notifications.DeleteManyAsync(n => pickups.Contains(n.PickupId!) || n.Body.Contains(run));
        await api.Db.Invites.DeleteManyAsync(i => companies.Contains(i.CompanyId!) || i.Email!.EndsWith(run + "@test.returapp.no"));
        await api.Db.Companies.DeleteManyAsync(c => companies.Contains(c.Id) || c.Name.Contains(run));
        await api.Db.Users.DeleteManyAsync(u => users.Contains(u.Id));
        await api.Db.Notices.DeleteManyAsync(n => n.Text.Contains(run));
        await api.Db.Support.DeleteManyAsync(s => s.Text.Contains(run));
    }

    Task<HttpClient> Super() => api.LoginAs("demo@returapp.no");

    async Task<Company> NewCompany(string status, List<string>? coverage = null, string? contactEmail = null)
    {
        var c = new Company { Id = "ts-" + run + "-" + companies.Count, Name = $"Testfirma {run} {companies.Count}", City = "Åmli", Orgnr = "123456789", Status = status, Coverage = coverage ?? [], ContactName = "Kontakt", ContactEmail = contactEmail, Since = status == CompanyStatus.Aktiv ? DateTime.UtcNow : null, CreatedAt = DateTime.UtcNow };
        await api.Db.Companies.InsertOneAsync(c);
        companies.Add(c.Id);
        return c;
    }

    async Task<string> NewPickup(string? companyId, string status = PickupStatus.Ny, string? driverId = null)
    {
        var id = $"R-S{run}-{pickups.Count}";
        await api.Db.Pickups.InsertOneAsync(new Pickup { Id = id, CategoryId = "paller", Title = "Test", Postnr = "4865", Kommune = "Åmli", Address = "Testveien 1", CompanyId = companyId, DriverId = driverId, Status = status, GiverOrg = "Test", Phone = "+4740000000", Qty = 1, Unit = "stk", Cond = "God", CreatedAt = DateTime.UtcNow });
        pickups.Add(id);
        return id;
    }

    async Task<User> NewUser(Roles roles, string? companyId = null)
    {
        var u = new User { Name = "Test " + run, Email = $"u{users.Count}-{run}@test.returapp.no", Roles = roles, CompanyId = companyId, CreatedAt = DateTime.UtcNow };
        u.PasswordHash = new PasswordHasher<User>().HashPassword(u, "passord123");
        await api.Db.Users.InsertOneAsync(u);
        users.Add(u.Id);
        return u;
    }

    [Fact]
    public async Task Approve_activates_coverage_assigns_waiting_pickups_and_invites_contact()
    {
        var contact = $"kontakt-{run}@test.returapp.no";
        var company = await NewCompany(CompanyStatus.Venter, ["Åmli"], contact);
        var waiting = await NewPickup(null);
        var s = await Super();
        var stats = await s.GetFromJsonAsync<JsonElement>("/api/stats/platform");
        Assert.Contains(stats.GetProperty("pendingCompanies").EnumerateArray(), c => c.GetProperty("id").GetString() == company.Id);

        Assert.Equal(HttpStatusCode.OK, (await s.PostAsync($"/api/companies/{company.Id}/approve", null)).StatusCode);
        Assert.Equal(CompanyStatus.Aktiv, (await api.Db.Companies.Find(c => c.Id == company.Id).SingleAsync()).Status);
        Assert.Equal(company.Id, (await api.Db.Pickups.Find(p => p.Id == waiting).SingleAsync()).CompanyId);
        Assert.Contains("/invite/", api.LastMail(contact)!.Body);
        Assert.True((await api.Client().GetFromJsonAsync<JsonElement>("/api/postnr/4865")).GetProperty("covered").GetBoolean());
        await api.Db.Companies.UpdateOneAsync(c => c.Id == company.Id, Builders<Company>.Update.Set(c => c.Coverage, []));
    }

    [Fact]
    public async Task Reject_only_pending()
    {
        var company = await NewCompany(CompanyStatus.Venter);
        var s = await Super();
        Assert.Equal(HttpStatusCode.OK, (await s.PostAsync($"/api/companies/{company.Id}/reject", null)).StatusCode);
        Assert.Equal(HttpStatusCode.Conflict, (await s.PostAsync($"/api/companies/{company.Id}/reject", null)).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await (await api.LoginAs("silje@ombruksfabrikken.no")).PostAsync($"/api/companies/{company.Id}/approve", null)).StatusCode);
    }

    [Fact]
    public async Task Switching_company_resets_driver_and_status()
    {
        var a = await NewCompany(CompanyStatus.Aktiv);
        var b = await NewCompany(CompanyStatus.Aktiv);
        var id = await NewPickup(a.Id, PickupStatus.Planlagt, "u3");
        var res = await (await (await Super()).PostAsJsonAsync($"/api/pickups/{id}/company", new { companyId = b.Id })).Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal(b.Id, res.GetProperty("companyId").GetString());
        Assert.Equal("ny", res.GetProperty("status").GetString());
        Assert.Equal(JsonValueKind.Null, res.GetProperty("driverId").ValueKind);
    }

    [Fact]
    public async Task Roles_can_change_but_not_own_super_and_deactivated_user_cannot_refresh()
    {
        var s = await Super();
        var user = await NewUser(new() { Giver = true });
        var res = await s.PatchAsJsonAsync($"/api/users/{user.Id}", new { roles = new { giver = true, driver = true, admin = false, super = false } });
        Assert.True((await res.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("roles").GetProperty("driver").GetBoolean());
        Assert.Equal(HttpStatusCode.BadRequest, (await s.PatchAsJsonAsync("/api/users/u6", new { roles = new { giver = true, super = false } })).StatusCode);

        var rt = (await api.Tokens(user.Email!, "passord123")).GetProperty("refreshToken").GetString();
        await s.PatchAsJsonAsync($"/api/users/{user.Id}", new { active = false });
        Assert.Equal(HttpStatusCode.Unauthorized, (await api.Client().PostAsJsonAsync("/api/auth/refresh", new { refreshToken = rt })).StatusCode);

        var search = await s.GetFromJsonAsync<JsonElement>("/api/users?q=kari");
        Assert.Contains(search.EnumerateArray(), u => u.GetProperty("id").GetString() == "u3");
    }

    [Fact]
    public async Task Notice_to_companies_reaches_only_admins_and_drivers()
    {
        var text = "Vedlikehold i natt " + run;
        (await (await Super()).PostAsJsonAsync("/api/notices", new { text, to = "hentefirma" })).EnsureSuccessStatusCode();
        var driver = await (await api.LoginAs("kari@ombruksfabrikken.no")).GetFromJsonAsync<JsonElement>("/api/notices/active");
        var giver = await (await api.LoginAs("jonas.hem@skanska.no")).GetFromJsonAsync<JsonElement>("/api/notices/active");
        Assert.Contains(driver.EnumerateArray(), n => n.GetProperty("text").GetString() == text);
        Assert.DoesNotContain(giver.EnumerateArray(), n => n.GetProperty("text").GetString() == text);
        Assert.True(await api.Db.Notifications.Find(n => n.UserId == "u3" && n.Body == text).AnyAsync());
        Assert.False(await api.Db.Notifications.Find(n => n.UserId == "u1" && n.Body == text).AnyAsync());
    }

    [Fact]
    public async Task Support_reply_notifies_sender_and_close()
    {
        var user = await NewUser(new() { Giver = true });
        var c = api.Client((await api.Tokens(user.Email!, "passord123")).GetProperty("accessToken").GetString());
        await c.PostAsJsonAsync("/api/support", new { text = "Hjelp " + run });
        var sc = await api.Db.Support.Find(x => x.Text == "Hjelp " + run).SingleAsync();
        var s = await Super();
        (await s.PostAsJsonAsync($"/api/support/{sc.Id}/reply", new { text = "Svar " + run })).EnsureSuccessStatusCode();
        Assert.True(await api.Db.Notifications.Find(n => n.UserId == user.Id && n.Type == "support.reply").AnyAsync());
        (await s.PostAsync($"/api/support/{sc.Id}/close", null)).EnsureSuccessStatusCode();
        Assert.False((await api.Db.Support.Find(x => x.Id == sc.Id).SingleAsync()).Open);
        await api.Db.Notifications.DeleteManyAsync(n => n.UserId == user.Id);
    }

    [Fact]
    public async Task Public_company_application_creates_pending_company()
    {
        var res = await api.Client().PostAsJsonAsync("/api/companies/apply", new { name = "Søker " + run, orgnr = "987 654 321", city = "Arendal", phone = "37 00 00 00", contactName = "Kari Søker", email = $"sok-{run}@test.returapp.no", kommuner = new[] { "Arendal", "Finnesikke" } });
        Assert.Equal(HttpStatusCode.Created, res.StatusCode);
        var company = await api.Db.Companies.Find(c => c.Name == "Søker " + run).SingleAsync();
        Assert.Equal(CompanyStatus.Venter, company.Status);
        Assert.Equal(["Arendal"], company.Coverage);
        Assert.Equal(HttpStatusCode.BadRequest, (await api.Client().PostAsJsonAsync("/api/companies/apply", new { name = "X" })).StatusCode);
        await api.Db.Support.DeleteManyAsync(s => s.Text.Contains("Søker " + run));
        await api.Db.Notifications.DeleteManyAsync(n => n.Body.Contains("Søker " + run));
    }
}
