using Returapp.Api.Models;

namespace Returapp.Api.Services;

public static class Weight
{
    /// Anslått vekt: kg-faktor per enhet på kategorien (standard 18 kg som prototypen) × mengde.
    public static int EstimateKg(Category category, string unit, double qty)
    {
        var key = unit == "m²" ? "m2" : unit;
        return (int)Math.Round(category.KgPerUnit.GetValueOrDefault(key, key == "kg" ? 1 : 18) * qty);
    }

    /// Samme faktor som frontend (core/format.ts), så kvittering, statistikk og eksport viser like tall.
    public static int Co2(double kg) => (int)Math.Round(kg * 0.9);
}
