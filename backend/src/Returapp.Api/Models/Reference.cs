namespace Returapp.Api.Models;

public class Category
{
    public string Id { get; set; } = ""; // "vinduer"
    public string Name { get; set; } = "";
    public string Icon { get; set; } = "annet";
    public int Order { get; set; }
    public Dictionary<string, double> KgPerUnit { get; set; } = []; // stk, m2, lm, paller, kg
}

public class Postnr
{
    public string Id { get; set; } = ""; // "4608"
    public string Poststed { get; set; } = "";
    public string Kommunenr { get; set; } = "";
    public string Kommune { get; set; } = "";
}

public class SupportCase
{
    public string Id { get; set; } = "";
    public string? FromUserId { get; set; }
    public string FromName { get; set; } = "";
    public string Org { get; set; } = "";
    public string Text { get; set; } = "";
    public bool Open { get; set; } = true;
    public List<SupportReply> Replies { get; set; } = [];
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }
}

public record SupportReply(string ByUserId, string Text, DateTime At);

public class Notification
{
    public string Id { get; set; } = "";
    public string UserId { get; set; } = "";
    public string Type { get; set; } = "";
    public string Title { get; set; } = "";
    public string Body { get; set; } = "";
    public string? PickupId { get; set; }
    public DateTime? ReadAt { get; set; }
    public DateTime CreatedAt { get; set; }
}

public class CoverageAlert
{
    public string Id { get; set; } = "";
    public string Postnr { get; set; } = "";
    public string? UserId { get; set; }
    public string? Phone { get; set; }
    public DateTime? NotifiedAt { get; set; }
    public DateTime CreatedAt { get; set; }
}

/// Bilde/fil lagret som dokument i MongoDB (krav: ingen lokal disk). Maks 16 MB per dokument; opplasting er begrenset til 10 MB.
public class StoredFile
{
    public string Id { get; set; } = "";
    public string Kind { get; set; } = "original"; // original | thumb
    public int W { get; set; }
    public int H { get; set; }
    public byte[] Data { get; set; } = [];
    public string? ThumbId { get; set; }
    public string? OwnerUserId { get; set; }
    public string? GuestId { get; set; }
    public string? PickupId { get; set; }
    public DateTime? OrphanExpires { get; set; } // TTL: slettes hvis bildet aldri knyttes til en ordre
    public DateTime CreatedAt { get; set; }
}

public class RoutePlan
{
    public string Id { get; set; } = "";
    public string DriverId { get; set; } = "";
    public string Date { get; set; } = ""; // yyyy-MM-dd
    public List<string> PickupIds { get; set; } = [];
    public DateTime? SentAt { get; set; }
    public DateTime UpdatedAt { get; set; }
}

public class Notice
{
    public string Id { get; set; } = "";
    public string Text { get; set; } = "";
    public string To { get; set; } = "alle"; // alle | hentefirma
    public string? SentByUserId { get; set; }
    public DateTime CreatedAt { get; set; }
}

public class Tip
{
    public string Id { get; set; } = "";
    public string Postnr { get; set; } = "";
    public string Text { get; set; } = "";
    public string? FromUserId { get; set; }
    public DateTime CreatedAt { get; set; }
}
