using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using Microsoft.IdentityModel.JsonWebTokens;
using Microsoft.IdentityModel.Tokens;
using Returapp.Api.Models;

namespace Returapp.Api.Services;

public class Jwt(IConfiguration cfg)
{
    public static SymmetricSecurityKey Key(IConfiguration cfg) => new(Encoding.UTF8.GetBytes(cfg["Jwt:Secret"]!));
    public static string Issuer(IConfiguration cfg) => cfg["Jwt:Issuer"] ?? "returapp";

    public int AccessMinutes => cfg.GetValue("Jwt:AccessMinutes", 15);
    public int RefreshDays => cfg.GetValue("Jwt:RefreshDays", 30);

    public string Access(User u)
    {
        var claims = new Dictionary<string, object> { ["sub"] = u.Id, ["roles"] = RoleNames(u.Roles) };
        if (u.CompanyId != null) claims["companyId"] = u.CompanyId;
        return Create(claims, TimeSpan.FromMinutes(AccessMinutes));
    }

    public string Guest(string gid) => Create(new() { ["guest"] = true, ["gid"] = gid }, TimeSpan.FromHours(24));

    string Create(Dictionary<string, object> claims, TimeSpan lifetime) => new JsonWebTokenHandler().CreateToken(new SecurityTokenDescriptor
    {
        Issuer = Issuer(cfg),
        Audience = Issuer(cfg),
        Claims = claims,
        Expires = DateTime.UtcNow.Add(lifetime),
        SigningCredentials = new SigningCredentials(Key(cfg), SecurityAlgorithms.HmacSha256),
    });

    public static string[] RoleNames(Roles r) =>
        new[] { ("giver", r.Giver), ("driver", r.Driver), ("admin", r.Admin), ("super", r.Super) }.Where(x => x.Item2).Select(x => x.Item1).ToArray();

    // Engangstokens (refresh, invitasjon, passord-reset): klienten får tokenet, databasen bare hashen.
    public static (string Token, string Hash) NewToken()
    {
        var token = Base64UrlEncoder.Encode(RandomNumberGenerator.GetBytes(32));
        return (token, Hash(token));
    }

    public static string Hash(string token) => Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(token)));
}

public record Caller(string? UserId, bool IsGuest, string? GuestId, string[] Roles, string? CompanyId)
{
    public bool Has(string role) => Roles.Contains(role);
}

public static class CallerExtensions
{
    public static Caller Caller(this ClaimsPrincipal p) => new(
        p.FindFirstValue("sub"),
        p.FindFirstValue("guest") == "true",
        p.FindFirstValue("gid"),
        p.FindAll("roles").Select(c => c.Value).ToArray(),
        p.FindFirstValue("companyId"));
}
