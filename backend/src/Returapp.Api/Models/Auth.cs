namespace Returapp.Api.Models;

public record RefreshToken(string Hash, DateTime Expires);

public class Otp
{
    public string Id { get; set; } = "";
    public string Phone { get; set; } = "";
    public string CodeHash { get; set; } = "";
    public int Attempts { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime Expires { get; set; } // TTL – dokumentet slettes; koden er gyldig i 5 min fra CreatedAt
}

public class Invite
{
    public string Id { get; set; } = "";
    public string TokenHash { get; set; } = "";
    public string? Name { get; set; }
    public string? Phone { get; set; }
    public string? Email { get; set; }
    public Roles Roles { get; set; } = new();
    public string? CompanyId { get; set; }
    public string? Vehicle { get; set; }
    public List<string>? Areas { get; set; }
    public string? InvitedByUserId { get; set; }
    public DateTime Expires { get; set; }
    public DateTime? UsedAt { get; set; }
    public DateTime CreatedAt { get; set; }
}

public class PasswordReset
{
    public string Id { get; set; } = "";
    public string UserId { get; set; } = "";
    public string TokenHash { get; set; } = "";
    public DateTime Expires { get; set; }
    public DateTime CreatedAt { get; set; }
}
