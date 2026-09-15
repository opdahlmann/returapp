using System.Collections.Concurrent;
using System.Net;
using System.Net.Mail;

namespace Returapp.Api.Services;

public record MailAttachment(string FileName, byte[] Data, string ContentType);
public record Mail(string To, string Subject, string Body, MailAttachment[]? Attachments = null);

public interface IMailSender
{
    Task Send(Mail mail);
}

// Dev/test: logger e-posten og husker siste per mottaker (for /api/dev/last-mail og tester). Ingen filer.
public class ConsoleMailSender(ILogger<ConsoleMailSender> log) : IMailSender
{
    public ConcurrentDictionary<string, Mail> Last { get; } = new();

    public Task Send(Mail mail)
    {
        log.LogInformation("[E-post] {To}: {Subject}\n{Body}", mail.To, mail.Subject, mail.Body);
        Last[mail.To.ToLowerInvariant()] = mail;
        return Task.CompletedTask;
    }
}

// SMTP med STARTTLS via innebygd SmtpClient – vedlegg bygges i minnet.
public class SmtpMailSender(IConfiguration cfg) : IMailSender
{
    public async Task Send(Mail mail)
    {
        using var client = new SmtpClient(cfg["Smtp:Host"], cfg.GetValue("Smtp:Port", 587))
        {
            EnableSsl = true,
            Credentials = new NetworkCredential(cfg["Smtp:User"], cfg["Smtp:Pass"]),
        };
        using var msg = new MailMessage(cfg["Mail:From"] ?? "noreply@returapp.no", mail.To, mail.Subject, mail.Body);
        foreach (var a in mail.Attachments ?? [])
            msg.Attachments.Add(new Attachment(new MemoryStream(a.Data), a.FileName, a.ContentType));
        await client.SendMailAsync(msg);
    }
}
