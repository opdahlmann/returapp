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
public class PickupTests(ApiFixture api) : IAsyncLifetime
{
    readonly List<string> pickupIds = [];
    readonly List<string> userIds = [];
    User giver = null!;

    public async Task InitializeAsync()
    {
        giver = new User { Name = "Test Giver " + ApiFixture.RunId, Email = $"giver-{Guid.NewGuid():N}@test.returapp.no", Phone = ApiFixture.TestPhone(), Org = "Testbygg AS", Roles = new() { Giver = true }, CreatedAt = DateTime.UtcNow };
        giver.PasswordHash = new PasswordHasher<User>().HashPassword(giver, "passord123");
        await api.Db.Users.InsertOneAsync(giver);
        userIds.Add(giver.Id);
    }

    public async Task DisposeAsync()
    {
        await api.Db.Pickups.DeleteManyAsync(p => pickupIds.Contains(p.Id));
        await api.Db.Files.DeleteManyAsync(f => pickupIds.Contains(f.PickupId!) || userIds.Contains(f.OwnerUserId!));
        await api.Db.Notifications.DeleteManyAsync(n => pickupIds.Contains(n.PickupId!));
        await api.Db.Users.DeleteManyAsync(u => userIds.Contains(u.Id));
        await api.Db.Tips.DeleteManyAsync(t => t.Text.Contains(ApiFixture.RunId));
    }

    async Task<HttpClient> Giver() => api.Client((await api.Tokens(giver.Email!, "passord123")).GetProperty("accessToken").GetString());

    async Task<HttpClient> Guest() =>
        api.Client((await (await api.Client().PostAsync("/api/auth/guest", null)).Content.ReadFromJsonAsync<JsonElement>()).GetProperty("accessToken").GetString());

    static object Body(string postnr = "4608", double qty = 24, IEnumerable<string>? photoIds = null, string? contact = null, string? phone = null) => new
    {
        categoryId = "vinduer", desc = "Test " + ApiFixture.RunId, qty, unit = "stk", cond = "God", dims = "120 × 140 cm",
        address = "Tangen 8", postnr, day = (string?)null, slot = "09–12", unattended = true, contact, phone, photoIds,
    };

    async Task<JsonElement> Create(HttpClient c, object body, HttpStatusCode expected = HttpStatusCode.Created)
    {
        var res = await c.PostAsJsonAsync("/api/pickups", body);
        Assert.Equal(expected, res.StatusCode);
        var json = await res.Content.ReadFromJsonAsync<JsonElement>();
        if (res.IsSuccessStatusCode) pickupIds.Add(json.GetProperty("id").GetString()!);
        return json;
    }

    [Fact]
    public async Task Giver_creates_pickup_that_goes_to_covering_company()
    {
        var p = await Create(await Giver(), Body());
        Assert.Matches(@"^R-\d+$", p.GetProperty("id").GetString());
        Assert.True(int.Parse(p.GetProperty("id").GetString()![2..]) >= 2045);
        Assert.Equal("omb", p.GetProperty("companyId").GetString());
        Assert.Equal("ny", p.GetProperty("status").GetString());
        Assert.Equal(432, p.GetProperty("estKg").GetInt32());
        Assert.Equal("24 stk vinduer", p.GetProperty("title").GetString());
        Assert.Equal("Kristiansand", p.GetProperty("kommune").GetString());
        Assert.Equal("Testbygg AS", p.GetProperty("giverOrg").GetString());

        var id = p.GetProperty("id").GetString();
        var inbox = await (await api.LoginAs("silje@ombruksfabrikken.no")).GetFromJsonAsync<JsonElement>("/api/pickups?scope=company&status=ny");
        Assert.Contains(inbox.EnumerateArray(), x => x.GetProperty("id").GetString() == id);
        Assert.True(await api.Db.Notifications.Find(n => n.UserId == "u2" && n.PickupId == id).AnyAsync());

        var mine = await (await Giver()).GetFromJsonAsync<JsonElement>("/api/pickups?scope=mine&filter=aktive");
        Assert.Contains(mine.EnumerateArray(), x => x.GetProperty("id").GetString() == id);
    }

    [Fact]
    public async Task Pickup_without_coverage_has_no_company_and_shows_for_super()
    {
        var p = await Create(await Giver(), Body("4878"));
        Assert.Equal(JsonValueKind.Null, p.GetProperty("companyId").ValueKind);
        var list = await (await api.LoginAs("demo@returapp.no")).GetFromJsonAsync<JsonElement>("/api/pickups?scope=all&filter=utenfirma");
        Assert.Contains(list.EnumerateArray(), x => x.GetProperty("id").GetString() == p.GetProperty("id").GetString());
    }

    [Fact]
    public async Task Guest_can_create_and_see_own_but_not_company_scope()
    {
        var guest = await Guest();
        await Create(guest, Body(), HttpStatusCode.BadRequest); // mangler navn og mobil
        var p = await Create(guest, Body(contact: "Gjest " + ApiFixture.RunId, phone: ApiFixture.TestPhone()));
        Assert.StartsWith("Privat – Gjest", p.GetProperty("giverOrg").GetString());
        var mine = await guest.GetFromJsonAsync<JsonElement>("/api/pickups?scope=mine");
        Assert.Single(mine.EnumerateArray());
        Assert.Equal(HttpStatusCode.Forbidden, (await guest.GetAsync("/api/pickups?scope=company")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await (await Guest()).GetAsync($"/api/pickups/{p.GetProperty("id").GetString()}")).StatusCode);
    }

    [Fact]
    public async Task Validation_rejects_missing_quantity_and_unknown_postnr()
    {
        var c = await Giver();
        await Create(c, Body(qty: 0), HttpStatusCode.BadRequest);
        await Create(c, Body("0000"), HttpStatusCode.BadRequest);
    }

    [Fact]
    public async Task Other_giver_and_admin_of_other_company_get_404()
    {
        var id = (await Create(await Giver(), Body())).GetProperty("id").GetString();
        Assert.Equal(HttpStatusCode.NotFound, (await (await api.LoginAs("jonas.hem@skanska.no")).GetAsync($"/api/pickups/{id}")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await (await api.LoginAs("mona@gjenbrukslageret.no")).GetAsync($"/api/pickups/{id}")).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await (await api.LoginAs("silje@ombruksfabrikken.no")).GetAsync($"/api/pickups/{id}")).StatusCode);
    }

    [Fact]
    public async Task Cancel_active_pickup_and_409_when_not_active()
    {
        var c = await Giver();
        var id = (await Create(c, Body())).GetProperty("id").GetString();
        var res = await c.PostAsync($"/api/pickups/{id}/cancel", null);
        Assert.Equal("avbrutt", (await res.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("status").GetString());
        Assert.Equal(HttpStatusCode.Conflict, (await c.PostAsync($"/api/pickups/{id}/cancel", null)).StatusCode);
        Assert.Equal(HttpStatusCode.Conflict, (await (await api.LoginAs("jonas.hem@skanska.no")).PostAsync("/api/pickups/R-2030/cancel", null)).StatusCode);
    }

    [Fact]
    public async Task Photo_upload_stores_scaled_original_and_thumbnail_in_mongo_and_attaches_to_pickup()
    {
        var c = await Giver();
        var upload = await Upload(c, Jpeg(3000, 2000), "image/jpeg");
        Assert.Equal(HttpStatusCode.OK, upload.StatusCode);
        var photo = await upload.Content.ReadFromJsonAsync<JsonElement>();
        var fileId = photo.GetProperty("fileId").GetString()!;
        var thumbId = photo.GetProperty("thumbId").GetString()!;
        var original = await api.Db.Files.Find(f => f.Id == fileId).SingleAsync();
        var thumb = await api.Db.Files.Find(f => f.Id == thumbId).SingleAsync();
        Assert.Equal((2048, 1365), (original.W, original.H));
        Assert.True(thumb.W <= 400 && thumb.Data.Length > 0);
        Assert.NotNull(original.OrphanExpires);

        var p = await Create(c, Body(photoIds: [fileId]));
        Assert.Equal(fileId, p.GetProperty("photos")[0].GetProperty("fileId").GetString());
        original = await api.Db.Files.Find(f => f.Id == fileId).SingleAsync();
        Assert.Equal(p.GetProperty("id").GetString(), original.PickupId);
        Assert.Null(original.OrphanExpires);

        var img = await c.GetAsync($"/api/photos/{thumbId}");
        Assert.Equal("image/jpeg", img.Content.Headers.ContentType?.MediaType);
        Assert.Equal(HttpStatusCode.NotFound, (await (await api.LoginAs("jonas.hem@skanska.no")).GetAsync($"/api/photos/{thumbId}")).StatusCode);
    }

    [Fact]
    public async Task Photo_upload_rejects_non_images_and_files_over_10_mb()
    {
        var c = await Giver();
        Assert.Equal(HttpStatusCode.BadRequest, (await Upload(c, "ikke et bilde"u8.ToArray(), "image/jpeg")).StatusCode);
        Assert.Equal((HttpStatusCode)413, (await Upload(c, new byte[11 * 1024 * 1024], "image/jpeg")).StatusCode);
    }

    [Fact]
    public async Task Receipt_and_label_are_pdf()
    {
        var jonas = await api.LoginAs("jonas.hem@skanska.no");
        var receipt = await jonas.GetAsync("/api/pickups/R-2030/receipt.pdf");
        Assert.Equal("application/pdf", receipt.Content.Headers.ContentType?.MediaType);
        var bytes = await receipt.Content.ReadAsByteArrayAsync();
        Assert.True(bytes.Length > 1000);
        Assert.Equal("%PDF", System.Text.Encoding.ASCII.GetString(bytes, 0, 4));
        Assert.Equal(HttpStatusCode.NotFound, (await jonas.GetAsync("/api/pickups/R-2041/receipt.pdf")).StatusCode); // ikke hentet ennå

        var label = await jonas.GetAsync("/api/pickups/R-2041/label.pdf");
        Assert.Equal("%PDF", System.Text.Encoding.ASCII.GetString(await label.Content.ReadAsByteArrayAsync(), 0, 4));
    }

    [Fact]
    public async Task Tip_is_stored()
    {
        (await (await Guest()).PostAsJsonAsync("/api/tips", new { postnr = "4878", text = "Grimstad Gjenbruk " + ApiFixture.RunId })).EnsureSuccessStatusCode();
        Assert.True(await api.Db.Tips.Find(t => t.Text.Contains(ApiFixture.RunId)).AnyAsync());
    }

    static Task<HttpResponseMessage> Upload(HttpClient c, byte[] data, string type)
    {
        var content = new MultipartFormDataContent();
        var file = new ByteArrayContent(data);
        file.Headers.ContentType = new MediaTypeHeaderValue(type);
        content.Add(file, "file", "bilde.jpg");
        return c.PostAsync("/api/photos", content);
    }

    static byte[] Jpeg(int w, int h) => Images.Demo(1, w, h);
}
