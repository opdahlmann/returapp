using QRCoder;
using QuestPDF.Fluent;
using QuestPDF.Helpers;
using QuestPDF.Infrastructure;
using Returapp.Api.Models;

namespace Returapp.Api.Services;

/// PDF-er bygges i minnet (GeneratePdf → byte[]) og strømmes eller legges ved e-post. Ingenting skrives til disk.
public static class Pdf
{
    static Pdf() => QuestPDF.Settings.License = LicenseType.Community;

    const string Green = "#2E7A45", Muted = "#66716A", Border = "#E1E4DC", Tint = "#DDEED9", TintText = "#1F5A31";

    public static byte[] Receipt(Pickup p, string categoryName, string driverName, string companyName, int co2) => Document.Create(doc => doc.Page(page =>
    {
        page.Size(PageSizes.A4);
        page.PageColor(Colors.White);
        page.Margin(40);
        page.DefaultTextStyle(x => x.FontSize(11).FontColor("#182119"));
        page.Content().Column(col =>
        {
            col.Spacing(14);
            col.Item().Text("RETURAPP · KVITTERING").FontSize(10).Bold().FontColor(Green).LetterSpacing(0.1f);
            col.Item().Background(Green).Padding(22).Column(h =>
            {
                h.Item().Text("Hentet og bekreftet").FontSize(22).Bold().FontColor(Colors.White);
                h.Item().Text($"{(p.PickedAt is { } at ? Fmt.When(at) : "")} · {driverName}, {companyName}").FontColor(Colors.White);
            });
            col.Item().Table(t =>
            {
                t.ColumnsDefinition(c => { c.ConstantColumn(150); c.RelativeColumn(); });
                void Row(string k, string v)
                {
                    t.Cell().BorderBottom(1).BorderColor(Border).PaddingVertical(8).Text(k).FontColor(Muted);
                    t.Cell().BorderBottom(1).BorderColor(Border).PaddingVertical(8).AlignRight().Text(v).SemiBold();
                }
                Row("Referanse", p.Id);
                Row("Vare", $"{p.Title} ({categoryName})");
                Row("Hentet mengde", $"{Fmt.Qty(p.PickedQty ?? p.Qty)} {p.Unit}");
                Row("Hentested", $"{p.Address}, {p.Postnr} {p.Kommune}");
                Row("Giver", p.GiverOrg);
                Row("Dokumentasjon", $"{p.PickedPhotos.Count} bilder ved henting");
            });
            col.Item().Background(Tint).Padding(16).Column(e =>
            {
                e.Item().Text($"{Fmt.Kg(p.EstKg)} holdt i bruk").FontSize(16).Bold().FontColor(TintText);
                e.Item().Text($"Estimert ca {co2} kg CO₂ unngått sammenlignet med nyproduksjon").FontColor(TintText);
            });
        });
        page.Footer().AlignCenter().Text("Returapp – enkel retur og gjenbruk fra byggeplassen").FontSize(9).FontColor(Muted);
    })).GeneratePdf();

    public static byte[] Label(Pickup p, string url) => Document.Create(doc => doc.Page(page =>
    {
        page.Size(PageSizes.A6);
        page.PageColor(Colors.White);
        page.Margin(24);
        page.DefaultTextStyle(x => x.FontSize(10).FontColor("#182119"));
        page.Content().AlignCenter().Column(col =>
        {
            col.Spacing(10);
            col.Item().AlignCenter().Text("RETURAPP · HENTES").FontSize(9).Bold().FontColor(Green).LetterSpacing(0.1f);
            col.Item().AlignCenter().Width(160).Height(160).Svg(Qr(url));
            col.Item().AlignCenter().Text(p.Id).FontSize(22).Bold();
            col.Item().AlignCenter().Text(p.Title).FontColor(Muted);
            col.Item().AlignCenter().Text(p.GiverOrg).FontColor(Muted);
            col.Item().PaddingTop(6).BorderTop(1).BorderColor(Border).PaddingTop(8).AlignCenter()
                .Text("Fest lappen på varen. Sjåføren skanner ved henting og kvitteringen kobles automatisk.").FontSize(8).FontColor(Muted);
        });
    })).GeneratePdf();

    public static string Qr(string text)
    {
        using var gen = new QRCodeGenerator();
        using var data = gen.CreateQrCode(text, QRCodeGenerator.ECCLevel.M);
        return new SvgQRCode(data).GetGraphic(8);
    }
}
