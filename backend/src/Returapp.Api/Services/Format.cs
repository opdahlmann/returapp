using System.Globalization;

namespace Returapp.Api.Services;

/// Norsk formatering for SMS, e-post og PDF (API-et kjører ellers InvariantCulture).
public static class Fmt
{
    public static readonly CultureInfo Nb = new("nb-NO");
    public static readonly TimeZoneInfo Oslo = TimeZoneInfo.FindSystemTimeZoneById("Europe/Oslo");
    static readonly string[] Days = ["søn", "man", "tir", "ons", "tor", "fre", "lør"];
    static readonly string[] Months = ["jan", "feb", "mar", "apr", "mai", "jun", "jul", "aug", "sep", "okt", "nov", "des"];

    public static DateTime Local(DateTime utc) => TimeZoneInfo.ConvertTimeFromUtc(DateTime.SpecifyKind(utc, DateTimeKind.Utc), Oslo);
    public static DateOnly Today() => DateOnly.FromDateTime(Local(DateTime.UtcNow));

    /// "ons 16. sep 10:48"
    public static string When(DateTime utc)
    {
        var l = Local(utc);
        return $"{Days[(int)l.DayOfWeek]} {l.Day}. {Months[l.Month - 1]} {l:HH:mm}";
    }

    /// "2026-09-16" → "ons 16. sep"
    public static string Day(string? iso) =>
        DateOnly.TryParseExact(iso, "yyyy-MM-dd", out var d) ? $"{Days[(int)d.DayOfWeek]} {d.Day}. {Months[d.Month - 1]}" : "fleksibel dag";

    public static string Kg(double kg) => kg >= 1000 ? (kg / 1000).ToString("0.0", Nb) + " t" : $"{Math.Round(kg)} kg";
    public static string Qty(double q) => q.ToString("0.##", Nb);

    /// "+4791234567" → "912 34 567"
    public static string Phone(string? e164) =>
        e164 is { Length: 11 } && e164.StartsWith("+47") ? $"{e164[3..6]} {e164[6..8]} {e164[8..]}" : e164 ?? "";
}
