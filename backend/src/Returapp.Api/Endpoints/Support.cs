using MongoDB.Driver;
using Returapp.Api.Models;
using Returapp.Api.Services;

namespace Returapp.Api.Endpoints;

public static class SupportEndpoints
{
    public record SupportBody(string Text);

    public static void MapSupport(this WebApplication app)
    {
        var group = app.MapGroup("/api/support").RequireAuthorization("user");

        group.MapPost("", async (SupportBody b, HttpContext ctx, Db db) =>
        {
            var text = (b.Text ?? "").Trim();
            if (text.Length < 3 || text.Length > 2000) return AuthEndpoints.Err(400, "Skriv hva det gjelder (maks 2000 tegn)");
            var user = await db.Users.Find(u => u.Id == ctx.User.Caller().UserId).FirstAsync();
            var org = user.CompanyId == null ? user.Org : await db.Companies.Find(c => c.Id == user.CompanyId).Project(c => c.Name).FirstOrDefaultAsync() ?? user.Org;
            var sc = new SupportCase { FromUserId = user.Id, FromName = user.Name, Org = org, Text = text, CreatedAt = DateTime.UtcNow, UpdatedAt = DateTime.UtcNow };
            await db.Support.InsertOneAsync(sc);
            return Results.Created($"/api/support/{sc.Id}", new { sc.Id });
        });
    }
}
