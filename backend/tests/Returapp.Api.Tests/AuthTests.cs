using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using System.Text.RegularExpressions;
using MongoDB.Driver;
using Returapp.Api.Models;
using Returapp.Api.Services;

namespace Returapp.Api.Tests;

[Collection("api")]
public class AuthTests(ApiFixture api)
{
    async Task<string> SendCode(HttpClient c, string phone)
    {
        (await c.PostAsJsonAsync("/api/auth/otp/send", new { phone })).EnsureSuccessStatusCode();
        return Regex.Match(api.LastSms(phone)!, @"\d{6}").Value;
    }

    [Fact]
    public async Task Otp_flow_creates_giver_and_returns_tokens()
    {
        var phone = ApiFixture.TestPhone();
        var c = api.Client();
        try
        {
            var code = await SendCode(c, phone);
            var res = await c.PostAsJsonAsync("/api/auth/otp/verify", new { phone, code });
            Assert.Equal(HttpStatusCode.OK, res.StatusCode);
            var body = await res.Content.ReadFromJsonAsync<JsonElement>();
            Assert.True(body.GetProperty("user").GetProperty("roles").GetProperty("giver").GetBoolean());
            Assert.False(string.IsNullOrEmpty(body.GetProperty("refreshToken").GetString()));

            var me = await api.Client(body.GetProperty("accessToken").GetString()).GetFromJsonAsync<JsonElement>("/api/me");
            Assert.Equal(phone, me.GetProperty("phone").GetString());
        }
        finally { await api.Db.Users.DeleteOneAsync(u => u.Phone == phone); }
    }

    [Fact]
    public async Task Wrong_code_five_times_locks_the_code()
    {
        var phone = ApiFixture.TestPhone();
        var c = api.Client();
        var code = await SendCode(c, phone);
        var wrong = code == "000000" ? "111111" : "000000";
        var statuses = new List<HttpStatusCode>();
        for (var i = 0; i < 5; i++) statuses.Add((await c.PostAsJsonAsync("/api/auth/otp/verify", new { phone, code = wrong })).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, statuses[0]);
        Assert.Equal((HttpStatusCode)429, statuses[4]);
        Assert.Equal((HttpStatusCode)429, (await c.PostAsJsonAsync("/api/auth/otp/verify", new { phone, code })).StatusCode);
        await api.Db.Otps.DeleteManyAsync(o => o.Phone == phone);
    }

    [Fact]
    public async Task Otp_send_is_rate_limited_per_phone()
    {
        var phone = ApiFixture.TestPhone();
        var c = api.Client();
        for (var i = 0; i < 3; i++) (await c.PostAsJsonAsync("/api/auth/otp/send", new { phone })).EnsureSuccessStatusCode();
        Assert.Equal((HttpStatusCode)429, (await c.PostAsJsonAsync("/api/auth/otp/send", new { phone })).StatusCode);
        await api.Db.Otps.DeleteManyAsync(o => o.Phone == phone);
    }

    [Fact]
    public async Task Login_with_wrong_password_is_401()
    {
        var res = await api.Client().PostAsJsonAsync("/api/auth/login", new { email = "jonas.hem@skanska.no", password = "feil-passord" });
        Assert.Equal(HttpStatusCode.Unauthorized, res.StatusCode);
    }

    [Fact]
    public async Task Me_returns_roles_and_company_name()
    {
        var me = await (await api.LoginAs("mona@gjenbrukslageret.no")).GetFromJsonAsync<JsonElement>("/api/me");
        Assert.True(me.GetProperty("roles").GetProperty("driver").GetBoolean());
        Assert.True(me.GetProperty("roles").GetProperty("admin").GetBoolean());
        Assert.Equal("Gjenbrukslageret Oslo", me.GetProperty("company").GetProperty("name").GetString());
    }

    [Fact]
    public async Task Refresh_rotates_and_old_token_is_rejected()
    {
        var user = await NewEmailUser();
        try
        {
            var first = await api.Tokens(user.Email!, "passord123");
            var old = first.GetProperty("refreshToken").GetString();
            var res = await api.Client().PostAsJsonAsync("/api/auth/refresh", new { refreshToken = old });
            Assert.Equal(HttpStatusCode.OK, res.StatusCode);
            Assert.NotEqual(old, (await res.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("refreshToken").GetString());
            Assert.Equal(HttpStatusCode.Unauthorized, (await api.Client().PostAsJsonAsync("/api/auth/refresh", new { refreshToken = old })).StatusCode);
        }
        finally { await api.Db.Users.DeleteOneAsync(u => u.Id == user.Id); }
    }

    [Fact]
    public async Task Deactivated_user_cannot_refresh()
    {
        var user = await NewEmailUser();
        try
        {
            var rt = (await api.Tokens(user.Email!, "passord123")).GetProperty("refreshToken").GetString();
            await api.Db.Users.UpdateOneAsync(u => u.Id == user.Id, Builders<User>.Update.Set(u => u.Active, false));
            Assert.Equal(HttpStatusCode.Unauthorized, (await api.Client().PostAsJsonAsync("/api/auth/refresh", new { refreshToken = rt })).StatusCode);
        }
        finally { await api.Db.Users.DeleteOneAsync(u => u.Id == user.Id); }
    }

    [Fact]
    public async Task Guest_token_cannot_read_me()
    {
        var guest = await (await api.Client().PostAsync("/api/auth/guest", null)).Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal(HttpStatusCode.Forbidden, (await api.Client(guest.GetProperty("accessToken").GetString()).GetAsync("/api/me")).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await api.Client().GetAsync("/api/me")).StatusCode);
    }

    [Fact]
    public async Task Invite_gives_roles_and_company()
    {
        var phone = ApiFixture.TestPhone();
        var (token, hash) = Jwt.NewToken();
        await api.Db.Invites.InsertOneAsync(new Invite { TokenHash = hash, Phone = phone, Name = "Test Sjåfør", Roles = new() { Driver = true }, CompanyId = "omb", CreatedAt = DateTime.UtcNow, Expires = DateTime.UtcNow.AddDays(7) });
        try
        {
            var info = await api.Client().GetFromJsonAsync<JsonElement>($"/api/auth/invite/{token}");
            Assert.Equal("Ombruksfabrikken AS", info.GetProperty("companyName").GetString());

            var res = await api.Client().PostAsJsonAsync("/api/auth/invite/accept", new { token, name = "Test Sjåfør " + ApiFixture.RunId });
            Assert.Equal(HttpStatusCode.OK, res.StatusCode);
            var user = await api.Db.Users.Find(u => u.Phone == phone).SingleAsync();
            Assert.True(user.Roles.Driver);
            Assert.Equal("omb", user.CompanyId);
            Assert.Equal(HttpStatusCode.BadRequest, (await api.Client().PostAsJsonAsync("/api/auth/invite/accept", new { token, name = "Igjen" })).StatusCode);
        }
        finally
        {
            await api.Db.Users.DeleteOneAsync(u => u.Phone == phone);
            await api.Db.Invites.DeleteOneAsync(i => i.TokenHash == hash);
        }
    }

    [Fact]
    public async Task Password_reset_token_is_single_use()
    {
        var user = await NewEmailUser();
        try
        {
            (await api.Client().PostAsJsonAsync("/api/auth/forgot", new { email = user.Email })).EnsureSuccessStatusCode();
            var token = Regex.Match(api.LastMail(user.Email!)!.Body, @"/reset/(\S+)").Groups[1].Value;

            Assert.Equal(HttpStatusCode.OK, (await api.Client().PostAsJsonAsync("/api/auth/reset", new { token, password = "nyttpassord1" })).StatusCode);
            Assert.Equal(HttpStatusCode.OK, (await api.Client().PostAsJsonAsync("/api/auth/login", new { email = user.Email, password = "nyttpassord1" })).StatusCode);
            Assert.Equal(HttpStatusCode.BadRequest, (await api.Client().PostAsJsonAsync("/api/auth/reset", new { token, password = "annetpassord1" })).StatusCode);
        }
        finally { await api.Db.Users.DeleteOneAsync(u => u.Id == user.Id); }
    }

    [Fact]
    public async Task Patch_me_updates_theme_and_requires_code_for_new_phone()
    {
        var user = await NewEmailUser();
        try
        {
            var c = api.Client((await api.Tokens(user.Email!, "passord123")).GetProperty("accessToken").GetString());
            var res = await c.PatchAsJsonAsync("/api/me", new { theme = "dark", postnr = "4608" });
            Assert.Equal("dark", (await res.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("theme").GetString());
            Assert.Equal(HttpStatusCode.BadRequest, (await c.PatchAsJsonAsync("/api/me", new { phone = ApiFixture.TestPhone() })).StatusCode);
            Assert.Equal(HttpStatusCode.Conflict, (await c.PatchAsJsonAsync("/api/me", new { email = "jonas.hem@skanska.no" })).StatusCode);
        }
        finally { await api.Db.Users.DeleteOneAsync(u => u.Id == user.Id); }
    }

    async Task<User> NewEmailUser()
    {
        var u = new User { Name = "Test " + ApiFixture.RunId, Email = $"test-{Guid.NewGuid():N}@test.returapp.no", Roles = new() { Giver = true }, CreatedAt = DateTime.UtcNow, UpdatedAt = DateTime.UtcNow };
        u.PasswordHash = new Microsoft.AspNetCore.Identity.PasswordHasher<User>().HashPassword(u, "passord123");
        await api.Db.Users.InsertOneAsync(u);
        return u;
    }
}
