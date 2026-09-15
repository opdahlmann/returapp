using System.Net;
using MongoDB.Bson;
using MongoDB.Driver;
using Returapp.Api.Seed;
using Returapp.Api.Services;

namespace Returapp.Api.Tests;

[Collection("api")]
public class FoundationTests(ApiFixture api)
{
    [Fact]
    public async Task Health_returns_ok()
    {
        var res = await api.CreateClient().GetAsync("/health");
        Assert.Equal(HttpStatusCode.OK, res.StatusCode);
    }

    [Fact]
    public async Task Ready_returns_ok_when_db_reachable()
    {
        var res = await api.CreateClient().GetAsync("/ready");
        Assert.Equal(HttpStatusCode.OK, res.StatusCode);
        Assert.Contains("\"db\":true", await res.Content.ReadAsStringAsync());
    }

    [Fact]
    public async Task Seed_creates_categories_in_design_order()
    {
        var ids = await api.Db.Categories.Find(c => Seeder.DesignCategories.Select(d => d.Id).Contains(c.Id))
            .SortBy(c => c.Order).Project(c => c.Id).ToListAsync();
        Assert.Equal(Seeder.DesignCategories.Select(d => d.Id), ids);
    }

    [Fact]
    public async Task Seed_imports_postnr_with_title_case_kommune()
    {
        var p = await api.Db.Postnr.Find(x => x.Id == "4608").SingleAsync();
        Assert.Equal("Kristiansand", p.Kommune);
        Assert.Equal("Kristiansand S", p.Poststed);
        Assert.Equal("Evje og Hornnes", Seeder.Title("EVJE OG HORNNES"));
    }

    [Fact]
    public async Task NextSeq_is_unique_under_parallel_calls()
    {
        // Egen teller per kjøring, så pickup-løpenummeret ikke brukes opp av testen.
        var counter = "test-" + ApiFixture.RunId;
        var seqs = await Task.WhenAll(Enumerable.Range(0, 100).Select(_ => api.Db.NextSeq(counter)));
        await api.Db.Database.GetCollection<BsonDocument>("counters").DeleteOneAsync(new BsonDocument("_id", counter));
        Assert.Equal(Enumerable.Range(1, 100), seqs.Order());
    }

    [Fact]
    public async Task Pickup_counter_starts_after_demo_ids()
    {
        var counter = await api.Db.Database.GetCollection<BsonDocument>("counters").Find(new BsonDocument("_id", "pickup")).SingleAsync();
        Assert.True(counter["seq"].ToInt32() >= 2044);
    }

    [Theory]
    [InlineData("912 34 567", "+4791234567")]
    [InlineData("+47 912 34 567", "+4791234567")]
    [InlineData("004791234567", "+4791234567")]
    [InlineData("123", null)]
    public void Phone_normalizes_to_e164(string input, string? expected) => Assert.Equal(expected, Phone.Normalize(input));
}
