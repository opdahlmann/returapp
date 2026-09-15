using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using MongoDB.Driver;
using Returapp.Api.Models;
using Returapp.Api.Services;

namespace Returapp.Api.Tests;

[Collection("api")]
public class CoverageTests(ApiFixture api)
{
    [Fact]
    public async Task Categories_can_be_created_renamed_reordered_and_deleted_by_super()
    {
        var super = await api.LoginAs("demo@returapp.no");
        var original = (await super.GetFromJsonAsync<List<Category>>("/api/categories"))!.Select(c => c.Id).ToList();
        var res = await super.PostAsJsonAsync("/api/categories", new { name = "Test " + ApiFixture.RunId, icon = "leaf" });
        Assert.Equal(HttpStatusCode.Created, res.StatusCode);
        var created = (await res.Content.ReadFromJsonAsync<Category>())!;
        try
        {
            Assert.Equal(original.Count, created.Order);
            var renamed = await (await super.PatchAsJsonAsync($"/api/categories/{created.Id}", new { name = "Stein og betong " + ApiFixture.RunId, icon = "layers" })).Content.ReadFromJsonAsync<Category>();
            Assert.Equal("layers", renamed!.Icon);

            var order = original.Prepend(created.Id).ToList();
            var reordered = await (await super.PutAsJsonAsync("/api/categories/order", new { ids = order })).Content.ReadFromJsonAsync<List<Category>>();
            Assert.Equal(created.Id, reordered![0].Id);

            Assert.Equal(HttpStatusCode.Forbidden, (await (await api.LoginAs("jonas.hem@skanska.no")).PostAsJsonAsync("/api/categories", new { name = "Nei" })).StatusCode);
            Assert.Equal(HttpStatusCode.Conflict, (await super.DeleteAsync("/api/categories/vinduer")).StatusCode);
        }
        finally
        {
            await super.PutAsJsonAsync("/api/categories/order", new { ids = original.Append(created.Id).ToList() });
            Assert.Equal(HttpStatusCode.NoContent, (await super.DeleteAsync($"/api/categories/{created.Id}")).StatusCode);
        }
        var after = (await super.GetFromJsonAsync<List<Category>>("/api/categories"))!.Select(c => c.Id).ToList();
        Assert.Equal(original, after);
    }

    [Fact]
    public async Task New_coverage_updates_lookup_notifies_alert_and_assigns_waiting_pickup()
    {
        // Eget aktivt testfirma i en kommune ingen demo-firma dekker (Åmli, 4865).
        var company = new Company { Id = "test-" + ApiFixture.RunId, Name = "Testfirma " + ApiFixture.RunId, City = "Åmli", Status = CompanyStatus.Aktiv, Since = DateTime.UtcNow, CreatedAt = DateTime.UtcNow };
        var phone = ApiFixture.TestPhone();
        var pickupId = "R-T" + ApiFixture.RunId;
        await api.Db.Companies.InsertOneAsync(company);
        await api.Db.Pickups.InsertOneAsync(new Pickup { Id = pickupId, CategoryId = "paller", Title = "Test", Postnr = "4865", Kommune = "Åmli", GuestPhone = ApiFixture.TestPhone(), Status = PickupStatus.Ny, CreatedAt = DateTime.UtcNow });
        try
        {
            Assert.False((await api.Client().GetFromJsonAsync<JsonElement>("/api/postnr/4865")).GetProperty("covered").GetBoolean());
            var guest = await (await api.Client().PostAsync("/api/auth/guest", null)).Content.ReadFromJsonAsync<JsonElement>();
            (await api.Client(guest.GetProperty("accessToken").GetString()).PostAsJsonAsync("/api/coverage-alerts", new { postnr = "4865", phone })).EnsureSuccessStatusCode();

            var super = await api.LoginAs("demo@returapp.no");
            var res = await super.PutAsJsonAsync($"/api/companies/{company.Id}/coverage", new { kommuner = new[] { "Åmli" } });
            Assert.Equal(HttpStatusCode.OK, res.StatusCode);

            var lookup = await api.Client().GetFromJsonAsync<JsonElement>("/api/postnr/4865");
            Assert.True(lookup.GetProperty("covered").GetBoolean());
            Assert.Equal(company.Name, lookup.GetProperty("companyName").GetString());
            Assert.Contains("Nå henter " + company.Name, api.LastSms(phone));
            Assert.Equal(company.Id, (await api.Db.Pickups.Find(p => p.Id == pickupId).SingleAsync()).CompanyId);

            var kommuner = await super.GetFromJsonAsync<JsonElement>("/api/postnr/kommuner?q=Åml");
            Assert.Contains(company.Name, kommuner.EnumerateArray().Single(k => k.GetProperty("kommune").GetString() == "Åmli").GetProperty("firms").EnumerateArray().Select(f => f.GetString()));

            await super.PutAsJsonAsync($"/api/companies/{company.Id}/coverage", new { kommuner = Array.Empty<string>() });
            Assert.False((await api.Client().GetFromJsonAsync<JsonElement>("/api/postnr/4865")).GetProperty("covered").GetBoolean());
        }
        finally
        {
            await api.Db.Companies.DeleteOneAsync(c => c.Id == company.Id);
            await api.Db.Pickups.DeleteOneAsync(p => p.Id == pickupId);
            await api.Db.CoverageAlerts.DeleteManyAsync(a => a.Phone == phone);
        }
    }

    [Fact]
    public async Task Admin_sees_own_county_and_cannot_touch_other_company()
    {
        var admin = await api.LoginAs("silje@ombruksfabrikken.no");
        var view = await admin.GetFromJsonAsync<JsonElement>("/api/companies/omb/coverage");
        var items = view.GetProperty("items").EnumerateArray().ToList();
        Assert.True(items.Single(i => i.GetProperty("kommune").GetString() == "Kristiansand").GetProperty("covered").GetBoolean());
        Assert.False(items.Single(i => i.GetProperty("kommune").GetString() == "Birkenes").GetProperty("covered").GetBoolean());
        Assert.DoesNotContain(items, i => i.GetProperty("kommune").GetString() == "Oslo");
        Assert.Equal("Kristiansand", items[0].GetProperty("kommune").GetString());
        Assert.True(view.GetProperty("coveredPostnr").GetInt32() > 0);

        Assert.Equal(HttpStatusCode.NotFound, (await admin.GetAsync("/api/companies/gjo/coverage")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await admin.PutAsJsonAsync("/api/companies/gjo/coverage", new { kommuner = new[] { "Oslo" } })).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await admin.PutAsJsonAsync("/api/companies/omb/coverage", new { kommuner = new[] { "Finnesikke" } })).StatusCode);
    }

    [Fact]
    public void Weight_estimate_uses_category_factor_per_unit()
    {
        var cat = new Category { KgPerUnit = new() { ["stk"] = 30, ["m2"] = 12 } };
        Assert.Equal(720, Weight.EstimateKg(cat, "stk", 24));
        Assert.Equal(30, Weight.EstimateKg(cat, "m²", 2.5));
        Assert.Equal(90, Weight.EstimateKg(new Category(), "lm", 5)); // standard 18 kg
        Assert.Equal(40, Weight.EstimateKg(new Category(), "kg", 40));
    }
}
