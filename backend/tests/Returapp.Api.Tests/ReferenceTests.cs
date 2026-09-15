using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using MongoDB.Driver;

namespace Returapp.Api.Tests;

[Collection("api")]
public class ReferenceTests(ApiFixture api)
{
    [Fact]
    public async Task Postnr_lookup_returns_kommune_and_coverage()
    {
        var p = await api.Client().GetFromJsonAsync<JsonElement>("/api/postnr/4608");
        Assert.Equal("Kristiansand", p.GetProperty("kommune").GetString());
        Assert.True(p.GetProperty("covered").GetBoolean());
        Assert.Equal("Ombruksfabrikken AS", p.GetProperty("companyName").GetString());

        var grimstad = await api.Client().GetFromJsonAsync<JsonElement>("/api/postnr/4878");
        Assert.False(grimstad.GetProperty("covered").GetBoolean()); // Sirkula Sør venter på godkjenning

        Assert.Equal(HttpStatusCode.NotFound, (await api.Client().GetAsync("/api/postnr/0000")).StatusCode);
    }

    [Fact]
    public async Task Support_case_is_created_with_sender_and_company()
    {
        var c = await api.LoginAs("kari@ombruksfabrikken.no");
        var text = "Testsak " + ApiFixture.RunId;
        try
        {
            Assert.Equal(HttpStatusCode.Created, (await c.PostAsJsonAsync("/api/support", new { text })).StatusCode);
            var sc = await api.Db.Support.Find(s => s.Text == text).SingleAsync();
            Assert.Equal("Kari Aasen", sc.FromName);
            Assert.Equal("Ombruksfabrikken AS", sc.Org);
            Assert.True(sc.Open);
            Assert.Equal(HttpStatusCode.BadRequest, (await c.PostAsJsonAsync("/api/support", new { text = "" })).StatusCode);
        }
        finally { await api.Db.Support.DeleteManyAsync(s => s.Text == text); }
    }
}
