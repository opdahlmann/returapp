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
