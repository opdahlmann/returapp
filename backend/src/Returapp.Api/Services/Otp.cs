using System.Security.Cryptography;
using System.Text;
using MongoDB.Driver;

namespace Returapp.Api.Services;

public class OtpService(Db db, ISmsSender sms, IConfiguration cfg)
{
    public static readonly TimeSpan Valid = TimeSpan.FromMinutes(5);
    const int MaxSendsPer10Min = 3, MaxAttempts = 5;

    // null = ok, ellers (status, melding)
    public async Task<(int Status, string Title)?> Send(string phone)
    {
        var now = DateTime.UtcNow;
        if (await db.Otps.CountDocumentsAsync(o => o.Phone == phone && o.CreatedAt > now.AddMinutes(-10)) >= MaxSendsPer10Min)
            return (429, "For mange koder sendt – vent litt før du prøver igjen");
        var code = RandomNumberGenerator.GetInt32(0, 1_000_000).ToString("D6");
        await db.Otps.InsertOneAsync(new Models.Otp { Phone = phone, CodeHash = Hash(phone, code), CreatedAt = now, Expires = now.AddMinutes(10) });
        await sms.Send(phone, $"Returapp-kode: {code}");
        return null;
    }

    public async Task<(int Status, string Title)?> Verify(string phone, string code)
    {
        var otp = await db.Otps.Find(o => o.Phone == phone && o.CreatedAt > DateTime.UtcNow - Valid).SortByDescending(o => o.CreatedAt).FirstOrDefaultAsync();
        if (otp == null) return (400, "Koden er utløpt – be om en ny kode");
        if (otp.Attempts >= MaxAttempts) return (429, "For mange feil forsøk – be om en ny kode");
        if (!CryptographicOperations.FixedTimeEquals(Encoding.ASCII.GetBytes(otp.CodeHash), Encoding.ASCII.GetBytes(Hash(phone, code ?? ""))))
        {
            var attempts = (await db.Otps.FindOneAndUpdateAsync(o => o.Id == otp.Id, Builders<Models.Otp>.Update.Inc(o => o.Attempts, 1),
                new FindOneAndUpdateOptions<Models.Otp> { ReturnDocument = ReturnDocument.After })).Attempts;
            return attempts >= MaxAttempts ? (429, "For mange feil forsøk – be om en ny kode") : (400, "Feil kode");
        }
        await db.Otps.DeleteManyAsync(o => o.Phone == phone);
        return null;
    }

    string Hash(string phone, string code) =>
        Convert.ToHexString(HMACSHA256.HashData(Encoding.UTF8.GetBytes(cfg["Jwt:Secret"]!), Encoding.UTF8.GetBytes($"{phone}:{code}")));
}
