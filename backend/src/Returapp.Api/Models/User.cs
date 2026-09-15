namespace Returapp.Api.Models;

public class User
{
    public string Id { get; set; } = "";
    public string Name { get; set; } = "";
    public string? Email { get; set; }
    public string? Phone { get; set; } // E.164, f.eks. +4791234567
    public string? PasswordHash { get; set; }
    public string Org { get; set; } = "";
    public Roles Roles { get; set; } = new();
    public string? CompanyId { get; set; }
    public string? Postnr { get; set; }
    public string Theme { get; set; } = "light";
    public Notif Notif { get; set; } = new();
    public string? Vehicle { get; set; }
    public List<string>? Areas { get; set; } // kommuner, for sjåfør
    public bool Active { get; set; } = true;
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }
}

public class Roles
{
    public bool Giver { get; set; }
    public bool Driver { get; set; }
    public bool Admin { get; set; }
    public bool Super { get; set; }
}

public class Notif
{
    public bool Push { get; set; } = true;
    public bool Sms { get; set; }
    public bool Email { get; set; } = true;
}
