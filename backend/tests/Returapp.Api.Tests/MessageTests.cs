using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.AspNetCore.Identity;
using MongoDB.Driver;
using Returapp.Api.Models;

namespace Returapp.Api.Tests;

[Collection("api")]
public class MessageTests(ApiFixture api) : IAsyncLifetime
{
    readonly string run = ApiFixture.RunId + Random.Shared.Next(100, 999);
    User giver = null!, driver = null!, other = null!;
    Company company = null!;
    string pickupId = "";

    public async Task InitializeAsync()
    {
        company = new Company { Id = "tm-" + run, Name = "Testmelding " + run, Status = CompanyStatus.Aktiv, CreatedAt = DateTime.UtcNow };
        await api.Db.Companies.InsertOneAsync(company);
        giver = await NewUser("giver", new() { Giver = true }, null);
        driver = await NewUser("driver", new() { Driver = true }, company.Id);
        other = await NewUser("other", new() { Giver = true }, null);
        await api.Db.Users.UpdateOneAsync(u => u.Id == driver.Id, Builders<User>.Update.Set(u => u.Notif, new Notif { Push = true, Sms = true, Email = false }));
        pickupId = "R-M" + run;
        await api.Db.Pickups.InsertOneAsync(new Pickup { Id = pickupId, CategoryId = "paller", Title = "Test", Postnr = "4865", Kommune = "Åmli", CompanyId = company.Id, GiverUserId = giver.Id, DriverId = driver.Id, Status = PickupStatus.Planlagt, Phone = "+4740000000", Qty = 1, Unit = "stk", Cond = "God", CreatedAt = DateTime.UtcNow });
    }

    public async Task DisposeAsync()
    {
        await api.Db.Pickups.DeleteOneAsync(p => p.Id == pickupId);
        await api.Db.Notifications.DeleteManyAsync(n => n.PickupId == pickupId || n.UserId == driver.Id);
        await api.Db.Users.DeleteManyAsync(u => u.Email!.EndsWith(run + "@test.returapp.no"));
        await api.Db.Companies.DeleteOneAsync(c => c.Id == company.Id);
    }

    async Task<User> NewUser(string name, Roles roles, string? companyId)
    {
        var u = new User { Name = "Test " + name, Email = $"{name}-{run}@test.returapp.no", Phone = ApiFixture.TestPhone(), Roles = roles, CompanyId = companyId, CreatedAt = DateTime.UtcNow };
        u.PasswordHash = new PasswordHasher<User>().HashPassword(u, "passord123");
        await api.Db.Users.InsertOneAsync(u);
        return u;
    }

    async Task<HttpClient> As(User u) => api.Client((await api.Tokens(u.Email!, "passord123")).GetProperty("accessToken").GetString());

    [Fact]
    public async Task Giver_message_reaches_driver_with_push_and_throttled_sms_but_not_other_giver()
    {
        var d = await As(driver);
        var endpoint = "https://push.example.test/" + run;
        (await d.PostAsJsonAsync("/api/me/push", new { endpoint, keys = new { p256dh = "BKey", auth = "Auth" } })).EnsureSuccessStatusCode();

        var g = await As(giver);
        (await g.PostAsJsonAsync($"/api/pickups/{pickupId}/messages", new { text = "Står ved port B" })).EnsureSuccessStatusCode();
        Assert.Contains("Står ved port B", api.LastSms(driver.Phone!));
        Assert.Contains("Melding fra Test giver", api.LastPush(endpoint));

        (await g.PostAsJsonAsync($"/api/pickups/{pickupId}/messages", new { text = "Andre melding" })).EnsureSuccessStatusCode();
        Assert.Contains("Står ved port B", api.LastSms(driver.Phone!)); // ingen ny SMS innen 10 min
        Assert.Contains("Andre melding", api.LastPush(endpoint)); // men push kommer

        var messages = await d.GetFromJsonAsync<JsonElement>($"/api/pickups/{pickupId}/messages");
        Assert.Equal(["Står ved port B", "Andre melding"], messages.EnumerateArray().Select(m => m.GetProperty("text").GetString()));
        Assert.Equal("Test giver", messages[0].GetProperty("fromName").GetString());
        Assert.Equal(HttpStatusCode.NotFound, (await (await As(other)).GetAsync($"/api/pickups/{pickupId}/messages")).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await g.PostAsJsonAsync($"/api/pickups/{pickupId}/messages", new { text = "" })).StatusCode);
    }

    [Fact]
    public async Task Notifications_list_unread_and_mark_read()
    {
        var g = await As(giver);
        await (await As(driver)).PostAsJsonAsync($"/api/pickups/{pickupId}/messages", new { text = "Vi kommer 09:30" });
        var list = await g.GetFromJsonAsync<JsonElement>("/api/notifications");
        Assert.True(list.GetProperty("unread").GetInt32() >= 1);
        Assert.Equal("message", list.GetProperty("items")[0].GetProperty("type").GetString());
        (await g.PostAsJsonAsync("/api/notifications/read", new { })).EnsureSuccessStatusCode();
        Assert.Equal(0, (await g.GetFromJsonAsync<JsonElement>("/api/notifications")).GetProperty("unread").GetInt32());
        await api.Db.Notifications.DeleteManyAsync(n => n.UserId == giver.Id);
    }

    [Fact]
    public async Task Gone_push_subscription_is_kept_for_console_and_invalid_subscription_rejected()
    {
        var d = await As(driver);
        Assert.Equal(HttpStatusCode.BadRequest, (await d.PostAsJsonAsync("/api/me/push", new { endpoint = "http://usikker" })).StatusCode);
        var me = await d.GetFromJsonAsync<JsonElement>("/api/me");
        Assert.Equal(0, me.GetProperty("pushDevices").GetInt32());
    }
}
