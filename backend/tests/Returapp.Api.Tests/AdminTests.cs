using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.AspNetCore.Identity;
using MongoDB.Driver;
using Returapp.Api.Models;
using Returapp.Api.Services;

namespace Returapp.Api.Tests;

/// Eget testfirma med admin, to sjåfører og en giver – ingen demo-data endres.
[Collection("api")]
public class AdminTests(ApiFixture api) : IAsyncLifetime
{
    readonly string run = ApiFixture.RunId + Random.Shared.Next(100, 999);
    Company company = null!;
    User admin = null!, d1 = null!, d2 = null!, giver = null!;
    readonly List<string> pickups = [];
    int seq;

    public async Task InitializeAsync()
    {
        company = new Company { Id = "tc-" + run, Name = "Testhent " + run, City = "Åmli", Status = CompanyStatus.Aktiv, Since = DateTime.UtcNow, CreatedAt = DateTime.UtcNow };
        await api.Db.Companies.InsertOneAsync(company);
        admin = await NewUser("admin", new() { Admin = true });
        d1 = await NewUser("d1", new() { Driver = true }, ["Åmli"]);
        d2 = await NewUser("d2", new() { Driver = true });
        giver = await NewUser("giver", new() { Giver = true }, companyId: null);
    }

    public async Task DisposeAsync()
    {
        await api.Db.Pickups.DeleteManyAsync(p => pickups.Contains(p.Id));
        await api.Db.Notifications.DeleteManyAsync(n => pickups.Contains(n.PickupId!) || new[] { admin.Id, d1.Id, d2.Id, giver.Id }.Contains(n.UserId));
        await api.Db.Routes.DeleteManyAsync(r => r.DriverId == d1.Id || r.DriverId == d2.Id);
        await api.Db.Invites.DeleteManyAsync(i => i.CompanyId == company.Id);
        await api.Db.Users.DeleteManyAsync(u => u.Email!.EndsWith(run + "@test.returapp.no"));
        await api.Db.Companies.DeleteOneAsync(c => c.Id == company.Id);
    }

    async Task<User> NewUser(string name, Roles roles, List<string>? areas = null, string? companyId = "company")
    {
        var u = new User { Name = $"Test {name} {run}", Email = $"{name}-{run}@test.returapp.no", Roles = roles, CompanyId = companyId == null ? null : company.Id, Areas = areas, CreatedAt = DateTime.UtcNow };
        u.PasswordHash = new PasswordHasher<User>().HashPassword(u, "passord123");
        await api.Db.Users.InsertOneAsync(u);
        return u;
    }

    async Task<HttpClient> As(User u) => api.Client((await api.Tokens(u.Email!, "passord123")).GetProperty("accessToken").GetString());

    async Task<string> NewPickup(string status = PickupStatus.Ny, bool open = false, string? driverId = null, string? day = null, int kg = 100, string cat = "vinduer", DateTime? pickedAt = null)
    {
        var id = $"R-T{run}-{++seq}";
        var now = DateTime.UtcNow;
        await api.Db.Pickups.InsertOneAsync(new Pickup
        {
            Id = id, CategoryId = cat, Title = "Test " + seq, Postnr = "4865", Kommune = "Åmli", Address = "Testveien " + seq, CompanyId = company.Id, GiverUserId = giver.Id,
            GiverOrg = "Test", Contact = "Test", Phone = "+4740000000", Qty = 10, Unit = "stk", Cond = "God", Status = status, Open = open, DriverId = driverId, Day = day,
            Slot = day == null ? null : "09–12", EstKg = kg, PickedAt = pickedAt, StatusLog = [new(PickupStatus.Ny, now.AddDays(-1), null), new(PickupStatus.Planlagt, now.AddDays(-1).AddHours(12), null)],
            CreatedAt = now.AddDays(-1), UpdatedAt = now,
        });
        pickups.Add(id);
        return id;
    }

    static readonly string Tomorrow = Fmt.Today().AddDays(1).ToString("yyyy-MM-dd");

    [Fact]
    public async Task Assign_without_time_is_tildelt_and_with_time_is_planlagt()
    {
        var a = await As(admin);
        var id = await NewPickup();
        var res = await (await a.PostAsJsonAsync($"/api/pickups/{id}/assign", new { driverId = d1.Id })).Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal("tildelt", res.GetProperty("status").GetString());
        res = await (await a.PostAsJsonAsync($"/api/pickups/{id}/assign", new { driverId = d1.Id, day = Tomorrow, slot = "09–12" })).Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal("planlagt", res.GetProperty("status").GetString());
        Assert.Equal(Tomorrow, res.GetProperty("day").GetString());
        Assert.True(await api.Db.Notifications.Find(n => n.UserId == giver.Id && n.PickupId == id && n.Type == "pickup.planned").AnyAsync());
        Assert.True(await api.Db.Notifications.Find(n => n.UserId == d1.Id && n.PickupId == id).AnyAsync());
    }

    [Fact]
    public async Task Driver_from_other_company_is_rejected_and_other_admin_gets_404()
    {
        var id = await NewPickup();
        Assert.Equal(HttpStatusCode.BadRequest, (await (await As(admin)).PostAsJsonAsync($"/api/pickups/{id}/assign", new { driverId = "u3" })).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await (await api.LoginAs("silje@ombruksfabrikken.no")).PostAsJsonAsync($"/api/pickups/{id}/assign", new { driverId = d1.Id })).StatusCode);
    }

    [Fact]
    public async Task Suggestion_prefers_driver_covering_the_kommune()
    {
        var id = await NewPickup();
        var list = await (await As(admin)).GetFromJsonAsync<JsonElement>("/api/pickups?scope=company&status=ny");
        var p = list.EnumerateArray().Single(x => x.GetProperty("id").GetString() == id);
        Assert.Equal(d1.Id, p.GetProperty("suggestedDriverId").GetString());
        Assert.True(p.GetProperty("suggestedCoversArea").GetBoolean());
    }

    [Fact]
    public async Task Market_first_driver_wins_and_non_market_cannot_be_taken()
    {
        var a = await As(admin);
        var id = await NewPickup();
        var closed = await NewPickup();
        Assert.True((await (await a.PostAsJsonAsync($"/api/pickups/{id}/market", new { open = true })).Content.ReadFromJsonAsync<JsonElement>()).GetProperty("open").GetBoolean());

        var driver2 = await As(d2);
        var market = await driver2.GetFromJsonAsync<JsonElement>("/api/pickups?scope=market");
        Assert.Contains(market.EnumerateArray(), x => x.GetProperty("id").GetString() == id);
        Assert.Equal(HttpStatusCode.BadRequest, (await driver2.PostAsJsonAsync($"/api/pickups/{id}/assign", new { })).StatusCode); // mangler dag/tid

        var taken = await (await driver2.PostAsJsonAsync($"/api/pickups/{id}/assign", new { day = Tomorrow, slot = "12–15" })).Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal("planlagt", taken.GetProperty("status").GetString());
        Assert.False(taken.GetProperty("open").GetBoolean());
        Assert.Equal(d2.Id, taken.GetProperty("driverId").GetString());
        Assert.Equal(HttpStatusCode.Conflict, (await (await As(d1)).PostAsJsonAsync($"/api/pickups/{id}/assign", new { day = Tomorrow, slot = "12–15" })).StatusCode);
        Assert.Equal(HttpStatusCode.Conflict, (await driver2.PostAsJsonAsync($"/api/pickups/{closed}/assign", new { day = Tomorrow, slot = "12–15" })).StatusCode);
    }

    [Fact]
    public async Task Route_order_is_saved_new_stops_appended_and_route_can_be_sent()
    {
        var a = await As(admin);
        var first = await NewPickup(PickupStatus.Planlagt, driverId: d1.Id, day: Tomorrow);
        var second = await NewPickup(PickupStatus.Planlagt, driverId: d1.Id, day: Tomorrow);
        var route = await a.GetFromJsonAsync<JsonElement>($"/api/routes?driverId={d1.Id}&date={Tomorrow}");
        Assert.Equal(2, route.GetProperty("stops").GetArrayLength());

        await a.PutAsJsonAsync("/api/routes", new { driverId = d1.Id, date = Tomorrow, pickupIds = new[] { second, first } });
        var third = await NewPickup(PickupStatus.Planlagt, driverId: d1.Id, day: Tomorrow);
        route = await a.GetFromJsonAsync<JsonElement>($"/api/routes?driverId={d1.Id}&date={Tomorrow}");
        Assert.Equal([second, first, third], route.GetProperty("stops").EnumerateArray().Select(x => x.GetProperty("id").GetString()));

        var withoutDate = await (await As(d1)).GetFromJsonAsync<JsonElement>("/api/routes");
        Assert.Equal(Tomorrow, withoutDate.GetProperty("date").GetString()); // første dag med stopp

        (await a.PostAsJsonAsync("/api/routes/send", new { driverId = d1.Id, date = Tomorrow })).EnsureSuccessStatusCode();
        Assert.True(await api.Db.Notifications.Find(n => n.UserId == d1.Id && n.Type == "route.sent").AnyAsync());
        Assert.Equal(HttpStatusCode.NotFound, (await (await api.LoginAs("silje@ombruksfabrikken.no")).GetAsync($"/api/routes?driverId={d1.Id}")).StatusCode);
    }

    [Fact]
    public async Task Stats_and_counts_are_computed_from_company_data()
    {
        var now = DateTime.UtcNow.AddMinutes(-5);
        await NewPickup(PickupStatus.Hentet, kg: 100, cat: "vinduer", pickedAt: now);
        await NewPickup(PickupStatus.Hentet, kg: 200, cat: "vinduer", pickedAt: now);
        await NewPickup(PickupStatus.Hentet, kg: 350, cat: "paller", pickedAt: now);
        var dev = await NewPickup(PickupStatus.Avvik);
        await api.Db.Pickups.UpdateOneAsync(p => p.Id == dev, Builders<Pickup>.Update.Set(p => p.Deviation, new Deviation("Feil mengde", "", now)));
        await NewPickup();

        var a = await As(admin);
        var stats = await a.GetFromJsonAsync<JsonElement>($"/api/companies/{company.Id}/stats");
        Assert.Equal(3, stats.GetProperty("weekCount").GetInt32());
        Assert.Equal(650, stats.GetProperty("weekKg").GetInt32());
        Assert.Equal(3, stats.GetProperty("monthCount").GetInt32());
        Assert.Equal(75, stats.GetProperty("noDeviationPct").GetInt32());
        Assert.Equal(585, stats.GetProperty("co2Kg").GetInt32());
        Assert.Equal(0.5, stats.GetProperty("responseDays").GetDouble());
        var cats = stats.GetProperty("perCategory").EnumerateArray().ToList();
        Assert.Equal(("Paller", 350), (cats[0].GetProperty("name").GetString(), cats[0].GetProperty("kg").GetInt32()));
        Assert.Equal(("Vinduer", 300), (cats[1].GetProperty("name").GetString(), cats[1].GetProperty("kg").GetInt32()));

        var counts = await a.GetFromJsonAsync<JsonElement>("/api/pickups/counts");
        Assert.Equal(3, counts.GetProperty("counts").GetProperty("hentet").GetInt32());
        Assert.Equal(1, counts.GetProperty("counts").GetProperty("ny").GetInt32());
    }

    [Fact]
    public async Task Company_drivers_invite_and_departments()
    {
        var a = await As(admin);
        await NewPickup(PickupStatus.Planlagt, driverId: d1.Id, day: Tomorrow);
        var drivers = await a.GetFromJsonAsync<JsonElement>($"/api/companies/{company.Id}/drivers");
        Assert.Equal(1, drivers.EnumerateArray().Single(d => d.GetProperty("id").GetString() == d1.Id).GetProperty("planned").GetInt32());

        var phone = ApiFixture.TestPhone();
        (await a.PostAsJsonAsync($"/api/companies/{company.Id}/invite-driver", new { name = "Ny Sjåfør", phone, vehicle = "Varebil" })).EnsureSuccessStatusCode();
        Assert.Contains("/invite/", api.LastSms(phone));
        Assert.True(await api.Db.Invites.Find(i => i.CompanyId == company.Id && i.Phone == phone && i.Roles.Driver).AnyAsync());

        var depts = await (await a.PostAsJsonAsync($"/api/companies/{company.Id}/departments", new { name = "Lager", type = "hoved", address = "Testveien 1, 4865 Åmli", hours = "man–fre 07–15" })).Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal(1, depts.GetArrayLength());
        Assert.Equal(0, (await (await a.DeleteAsync($"/api/companies/{company.Id}/departments/0")).Content.ReadFromJsonAsync<JsonElement>()).GetArrayLength());

        var info = await a.GetFromJsonAsync<JsonElement>($"/api/companies/{company.Id}");
        Assert.Equal(2, info.GetProperty("driverCount").GetInt32());
        Assert.Equal(HttpStatusCode.NotFound, (await a.GetAsync("/api/companies/omb")).StatusCode);
    }
}
