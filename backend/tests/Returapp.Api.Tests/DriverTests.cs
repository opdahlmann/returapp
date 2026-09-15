using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.AspNetCore.Identity;
using MongoDB.Driver;
using Returapp.Api.Models;
using Returapp.Api.Services;

namespace Returapp.Api.Tests;

[Collection("api")]
public class DriverTests(ApiFixture api) : IAsyncLifetime
{
    readonly string run = ApiFixture.RunId + Random.Shared.Next(100, 999);
    Company company = null!;
    User d1 = null!, d2 = null!, giver = null!;
    readonly List<string> pickups = [];
    int seq;

    public async Task InitializeAsync()
    {
        company = new Company { Id = "td-" + run, Name = "Testsjåfør " + run, City = "Åmli", Status = CompanyStatus.Aktiv, Since = DateTime.UtcNow, CreatedAt = DateTime.UtcNow };
        await api.Db.Companies.InsertOneAsync(company);
        d1 = await NewUser("d1", new() { Driver = true }, company.Id);
        d2 = await NewUser("d2", new() { Driver = true }, company.Id);
        giver = await NewUser("giver", new() { Giver = true }, null);
        await api.Db.Users.UpdateOneAsync(u => u.Id == giver.Id, Builders<User>.Update.Set(u => u.Notif, new Notif { Email = true, Sms = true, Push = false }));
    }

    public async Task DisposeAsync()
    {
        await api.Db.Pickups.DeleteManyAsync(p => pickups.Contains(p.Id));
        await api.Db.Files.DeleteManyAsync(f => pickups.Contains(f.PickupId!) || f.OwnerUserId == d1.Id);
        await api.Db.Notifications.DeleteManyAsync(n => pickups.Contains(n.PickupId!));
        await api.Db.Users.DeleteManyAsync(u => u.Email!.EndsWith(run + "@test.returapp.no"));
        await api.Db.Companies.DeleteOneAsync(c => c.Id == company.Id);
    }

    async Task<User> NewUser(string name, Roles roles, string? companyId)
    {
        var u = new User { Name = $"Test {name}", Email = $"{name}-{run}@test.returapp.no", Phone = ApiFixture.TestPhone(), Roles = roles, CompanyId = companyId, CreatedAt = DateTime.UtcNow };
        u.PasswordHash = new PasswordHasher<User>().HashPassword(u, "passord123");
        await api.Db.Users.InsertOneAsync(u);
        return u;
    }

    async Task<HttpClient> As(User u) => api.Client((await api.Tokens(u.Email!, "passord123")).GetProperty("accessToken").GetString());

    async Task<string> NewPickup(string status, string? driverId)
    {
        var id = $"R-D{run}-{++seq}";
        await api.Db.Pickups.InsertOneAsync(new Pickup
        {
            Id = id, CategoryId = "vinduer", Title = "24 stk vinduer", Postnr = "4865", Kommune = "Åmli", Address = "Testveien 1", CompanyId = company.Id, GiverUserId = giver.Id,
            GiverOrg = "Test", Contact = "Test", Phone = "+4740000000", Qty = 24, Unit = "stk", Cond = "God", Status = status, DriverId = driverId, EstKg = 720,
            Day = Fmt.Today().ToString("yyyy-MM-dd"), Slot = "09–12", StatusLog = [new(PickupStatus.Ny, DateTime.UtcNow, null)], CreatedAt = DateTime.UtcNow,
        });
        pickups.Add(id);
        return id;
    }

    static async Task<string> UploadPhoto(HttpClient c)
    {
        var content = new MultipartFormDataContent();
        var file = new ByteArrayContent(Images.Demo(7, 800, 600));
        file.Headers.ContentType = new MediaTypeHeaderValue("image/jpeg");
        content.Add(file, "file", "hentet.jpg");
        var res = await c.PostAsync("/api/photos", content);
        return (await res.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("fileId").GetString()!;
    }

    [Fact]
    public async Task Start_then_complete_scales_kg_and_sends_receipt()
    {
        var c = await As(d1);
        var id = await NewPickup(PickupStatus.Planlagt, d1.Id);
        var started = await (await c.PostAsync($"/api/pickups/{id}/start", null)).Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal("underveis", started.GetProperty("status").GetString());
        Assert.Contains("er på vei", api.LastSms(giver.Phone!));

        Assert.Equal(HttpStatusCode.BadRequest, (await c.PostAsJsonAsync($"/api/pickups/{id}/complete", new { qty = 20, note = "", photoIds = Array.Empty<string>() })).StatusCode);

        var photo = await UploadPhoto(c);
        var done = await (await c.PostAsJsonAsync($"/api/pickups/{id}/complete", new { qty = 20, note = "To hadde sprekk", photoIds = new[] { photo } })).Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal("hentet", done.GetProperty("status").GetString());
        Assert.Equal(600, done.GetProperty("estKg").GetInt32());
        Assert.Equal(20, done.GetProperty("pickedQty").GetDouble());
        Assert.Equal(1, done.GetProperty("pickedPhotos").GetArrayLength());

        var mail = api.LastMail(giver.Email!)!;
        Assert.StartsWith($"Kvittering {id}", mail.Subject);
        Assert.Equal("application/pdf", mail.Attachments!.Single().ContentType);
        Assert.Contains($"/p/{id}/receipt", api.LastSms(giver.Phone!));
    }

    [Fact]
    public async Task Deviation_rules()
    {
        var c = await As(d1);
        var active = await NewPickup(PickupStatus.Planlagt, d1.Id);
        var picked = await NewPickup(PickupStatus.Hentet, d1.Id);
        Assert.Equal(HttpStatusCode.BadRequest, (await c.PostAsJsonAsync($"/api/pickups/{active}/deviation", new { reason = "Tull" })).StatusCode);
        Assert.Equal(HttpStatusCode.Conflict, (await c.PostAsJsonAsync($"/api/pickups/{picked}/deviation", new { reason = "Feil mengde" })).StatusCode);
        var res = await (await c.PostAsJsonAsync($"/api/pickups/{active}/deviation", new { reason = "Varen var ødelagt", note = "Knust glass" })).Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal("avvik", res.GetProperty("status").GetString());
        Assert.Equal("Varen var ødelagt", res.GetProperty("deviation").GetProperty("reason").GetString());
    }

    [Fact]
    public async Task Driver_only_sees_and_acts_on_own_pickups()
    {
        var mine = await NewPickup(PickupStatus.Planlagt, d1.Id);
        var theirs = await NewPickup(PickupStatus.Planlagt, d2.Id);
        var c = await As(d1);
        var list = await c.GetFromJsonAsync<JsonElement>("/api/pickups?scope=driver");
        var ids = list.EnumerateArray().Select(p => p.GetProperty("id").GetString()).ToList();
        Assert.Contains(mine, ids);
        Assert.DoesNotContain(theirs, ids);
        Assert.Equal(HttpStatusCode.NotFound, (await c.PostAsync($"/api/pickups/{theirs}/start", null)).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await c.PostAsJsonAsync($"/api/pickups/{theirs}/complete", new { qty = 1, photoIds = Array.Empty<string>() })).StatusCode);
    }
}
