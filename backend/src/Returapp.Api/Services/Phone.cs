namespace Returapp.Api.Services;

public static class Phone
{
    // "912 34 567" / "+47 912 34 567" / "004791234567" → "+4791234567". Null hvis det ikke ser ut som et nummer.
    public static string? Normalize(string? input)
    {
        if (string.IsNullOrWhiteSpace(input)) return null;
        var digits = new string(input.Where(char.IsDigit).ToArray());
        if (input.TrimStart().StartsWith('+')) return digits.Length >= 8 ? "+" + digits : null;
        if (digits.StartsWith("00")) digits = digits[2..];
        else if (digits.Length == 8) digits = "47" + digits;
        return digits.Length >= 10 ? "+" + digits : null;
    }
}
