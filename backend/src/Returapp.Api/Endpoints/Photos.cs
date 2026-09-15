using Microsoft.AspNetCore.Http.Features;
using MongoDB.Driver;
using Returapp.Api.Models;
using Returapp.Api.Services;

namespace Returapp.Api.Endpoints;

public static class PhotoEndpoints
{
    public const int MaxBytes = 10 * 1024 * 1024;

    public static void MapPhotos(this WebApplication app)
    {
        // Leses helt i minnet (FormOptions.MemoryBufferThreshold i Program.cs) – aldri temp-fil på disk.
        app.MapPost("/api/photos", async (HttpRequest req, HttpContext ctx, Db db) =>
        {
            if (req.ContentLength > MaxBytes + 256_000) return AuthEndpoints.Err(413, "Bildet er for stort (maks 10 MB)");
            if (!req.HasFormContentType) return AuthEndpoints.Err(400, "Send bildet som skjema (multipart)");
            var file = (await req.ReadFormAsync()).Files.FirstOrDefault();
            if (file == null || file.Length == 0) return AuthEndpoints.Err(400, "Mangler bilde");
            if (file.Length > MaxBytes) return AuthEndpoints.Err(413, "Bildet er for stort (maks 10 MB)");

            using var input = new MemoryStream();
            await file.CopyToAsync(input);
            if (Images.Process(input.ToArray()) is not { } img) return AuthEndpoints.Err(400, "Filen er ikke et bilde");

            var caller = ctx.User.Caller();
            var now = DateTime.UtcNow;
            var thumb = new StoredFile { Kind = "thumb", Data = img.Thumb, OwnerUserId = caller.UserId, GuestId = caller.GuestId, OrphanExpires = now.AddHours(24), CreatedAt = now };
            await db.Files.InsertOneAsync(thumb);
            var doc = new StoredFile { Kind = "original", Data = img.Original, W = img.W, H = img.H, ThumbId = thumb.Id, OwnerUserId = caller.UserId, GuestId = caller.GuestId, OrphanExpires = now.AddHours(24), CreatedAt = now };
            await db.Files.InsertOneAsync(doc);
            return Results.Ok(new { fileId = doc.Id, thumbId = thumb.Id, w = img.W, h = img.H });
        }).RequireAuthorization().DisableAntiforgery();

        app.MapGet("/api/photos/{id}", async (string id, HttpContext ctx, Db db) =>
        {
            var file = await db.Files.Find(f => f.Id == id).FirstOrDefaultAsync();
            if (file == null) return AuthEndpoints.Err(404, "Fant ikke bildet");
            var caller = ctx.User.Caller();
            var allowed = file.PickupId != null
                ? await db.Pickups.Find(p => p.Id == file.PickupId).FirstOrDefaultAsync() is { } p && PickupEndpoints.CanRead(caller, p)
                : (caller.UserId != null && file.OwnerUserId == caller.UserId) || (caller.GuestId != null && file.GuestId == caller.GuestId);
            if (!allowed) return AuthEndpoints.Err(404, "Fant ikke bildet");
            ctx.Response.Headers.CacheControl = "private, max-age=604800, immutable";
            ctx.Response.Headers.ContentDisposition = "inline";
            return Results.File(file.Data, "image/jpeg"); // Images.Process koder alltid om til JPEG
        }).RequireAuthorization();
    }

    /// Knytter opplastede bilder (eid av den som oppretter ordren) til ordren og fjerner TTL. Returnerer bildene i opplastingsrekkefølge.
    public static async Task<List<Photo>> Attach(Db db, Caller caller, IEnumerable<string>? fileIds, string pickupId)
    {
        var ids = (fileIds ?? []).Distinct().Take(6).ToList();
        if (ids.Count == 0) return [];
        var originals = await db.Files.Find(f => ids.Contains(f.Id) && f.Kind == "original" && f.PickupId == null
            && ((caller.UserId != null && f.OwnerUserId == caller.UserId) || (caller.GuestId != null && f.GuestId == caller.GuestId))).ToListAsync();
        var allIds = originals.Select(f => f.Id).Concat(originals.Select(f => f.ThumbId!)).ToList();
        await db.Files.UpdateManyAsync(f => allIds.Contains(f.Id), Builders<StoredFile>.Update.Set(f => f.PickupId, pickupId).Unset(f => f.OrphanExpires));
        return ids.Select(id => originals.FirstOrDefault(f => f.Id == id)).OfType<StoredFile>().Select(f => new Photo(f.Id, f.ThumbId!, f.W, f.H)).ToList();
    }
}
