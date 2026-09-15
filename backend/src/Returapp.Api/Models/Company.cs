namespace Returapp.Api.Models;

public class Company
{
    public string Id { get; set; } = "";
    public string Name { get; set; } = "";
    public string City { get; set; } = "";
    public string Orgnr { get; set; } = "";
    public string Phone { get; set; } = "";
    public string Status { get; set; } = CompanyStatus.Venter;
    public DateTime? Since { get; set; }
    public List<string> Coverage { get; set; } = []; // kommuner
    public List<Department> Departments { get; set; } = [];
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }
}

public class Department
{
    public string Name { get; set; } = "";
    public string Type { get; set; } = "avdeling"; // hoved | avdeling
    public string Address { get; set; } = "";
    public string Phone { get; set; } = "";
    public string Hours { get; set; } = "";
    public string Accepts { get; set; } = "";
}

public static class CompanyStatus
{
    public const string Aktiv = "aktiv", Venter = "venter", Avvist = "avvist";
}
