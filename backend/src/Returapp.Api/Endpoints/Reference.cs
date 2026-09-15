using MongoDB.Driver;
using Returapp.Api.Models;

namespace Returapp.Api.Endpoints;

public static class ReferenceEndpoints
{
    public static void MapReference(this WebApplication app)
    {
        // Offentlig: brukes av gjest og wizard for sted og dekning.
        app.MapGet("/api/postnr/{nr}", async (string nr, Db db) =>
        {
            var p = await db.Postnr.Find(x => x.Id == nr).FirstOrDefaultAsync();
            if (p == null) return AuthEndpoints.Err(404, "Ukjent postnummer");
            var company = await CoveringCompany(db, p.Kommune);
            return Results.Ok(new { postnr = p.Id, p.Poststed, p.Kommune, covered = company != null, companyId = company?.Id, companyName = company?.Name });
        });
    }

    /// Aktivt firma som dekker kommunen (eldste godkjente først, så valget er stabilt).
    public static Task<Company?> CoveringCompany(Db db, string kommune) =>
        db.Companies.Find(c => c.Status == CompanyStatus.Aktiv && c.Coverage.Contains(kommune)).SortBy(c => c.Since).FirstOrDefaultAsync()!;
}
