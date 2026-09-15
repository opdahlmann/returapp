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

    public static int Co2(double kg, IConfiguration cfg) => (int)Math.Round(kg * cfg.GetValue("App:Co2Factor", 0.9));
}
