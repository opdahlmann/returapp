namespace Returapp.Api.Models;

public class Pickup
{
    public string Id { get; set; } = ""; // "R-2041"
    public int Seq { get; set; }
    public string CategoryId { get; set; } = "";
    public string Title { get; set; } = "";
    public string Desc { get; set; } = "";
    public string? GiverUserId { get; set; }
    public string? GuestId { get; set; }
    public string? GuestPhone { get; set; }
    public string GiverOrg { get; set; } = "";
    public string Contact { get; set; } = "";
    public string Phone { get; set; } = "";
    public string Address { get; set; } = "";
    public string Postnr { get; set; } = "";
    public string Kommune { get; set; } = "";
    public double? Lat { get; set; }
    public double? Lng { get; set; }
    public double Qty { get; set; }
    public string Unit { get; set; } = "stk";
    public string Cond { get; set; } = "God";
    public string Dims { get; set; } = "";
    public string? Day { get; set; } // yyyy-MM-dd, null = fleksibel / ikke avtalt
    public string? Slot { get; set; }
    public bool Unattended { get; set; }
    public string Status { get; set; } = PickupStatus.Ny;
    public string? CompanyId { get; set; }
    public string? DriverId { get; set; }
    public bool Open { get; set; }
    public List<Photo> Photos { get; set; } = [];
    public int EstKg { get; set; }
    public DateTime? PickedAt { get; set; }
    public double? PickedQty { get; set; }
    public List<Photo> PickedPhotos { get; set; } = [];
    public string? PickedNote { get; set; }
    public Deviation? Deviation { get; set; }
    public DateTime? CancelledAt { get; set; }
    public List<StatusLogEntry> StatusLog { get; set; } = [];
    public List<Message> Messages { get; set; } = [];
    public DateTime? GuestSmsAt { get; set; } // SMS-sperre for meldinger til gjest
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }
}

public record Photo(string FileId, string ThumbId, int W, int H);
public record Deviation(string Reason, string Note, DateTime At);
public record StatusLogEntry(string Status, DateTime At, string? ByUserId);
public record Message(string FromUserId, string Text, DateTime At);

public static class PickupStatus
{
    public const string Ny = "ny", Tildelt = "tildelt", Planlagt = "planlagt", Underveis = "underveis",
        Hentet = "hentet", Avvik = "avvik", Avbrutt = "avbrutt";
}
