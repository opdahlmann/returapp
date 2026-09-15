using System.Globalization;
using Microsoft.AspNetCore.Identity;
using MongoDB.Driver;
using Returapp.Api.Models;
using Returapp.Api.Services;

namespace Returapp.Api.Seed;

public static class Seeder
{
    public const string DemoPassword = "demo1234";

    public static readonly string[] Units = ["stk", "m²", "lm", "paller", "kg"];
    public static readonly string[] Conds = ["Som ny", "God", "Brukbar", "Slitt"];
    public static readonly string[] Slots = ["07–09", "09–12", "12–15", "15–18"];
    public static readonly string[] DeviationReasons = ["Ikke funnet / ingen til stede", "Varen var ødelagt", "Feil mengde", "Ikke plass i bilen", "Giver avlyste"];

    // Rekkefølge og ikon-nøkler som i designet (RA.CATS).
    public static readonly (string Id, string Name)[] DesignCategories =
    [
        ("paller", "Paller"), ("dorer", "Dører"), ("vinduer", "Vinduer"), ("elektro", "Elektro"), ("innredning", "Innredning"), ("mobler", "Møbler"),
        ("kjokken", "Kjøkken"), ("sanitaer", "Sanitær/VVS"), ("trevirke", "Trevirke"), ("isolasjon", "Isolasjon"), ("metall", "Metall/stål"), ("annet", "Annet"),
    ];

    static readonly CultureInfo Nb = new("nb-NO");
    static readonly TimeZoneInfo Oslo = TimeZoneInfo.FindSystemTimeZoneById("Europe/Oslo");

    public static async Task Run(Db db, IConfiguration cfg, ILogger log)
    {
        await ImportPostnr(db, log);
        if (cfg.GetValue<bool>("App:SeedDemo") && !await db.Users.Find(_ => true).AnyAsync())
        {
            await SeedDemo(db, DateTime.UtcNow);
            log.LogInformation("Demo-data seedet");
        }
        if (cfg.GetValue<bool>("App:SeedDemo")) await SeedDemoPhotos(db, log);
    }

    // Bilder til demo-ordrene i samme antall som prototypen. Idempotent: bare ordre uten bilder får nye.
    static readonly Dictionary<string, int> DemoPhotoCounts = new() { ["R-2041"] = 3, ["R-2037"] = 2, ["R-2042"] = 2, ["R-2039"] = 4, ["R-2035"] = 1, ["R-2043"] = 3, ["R-2044"] = 2, ["R-2030"] = 3, ["R-2028"] = 2 };

    static async Task SeedDemoPhotos(Db db, ILogger log)
    {
        var ids = DemoPhotoCounts.Keys.ToList();
        var pickups = await db.Pickups.Find(p => ids.Contains(p.Id) && p.Photos.Count == 0).ToListAsync();
        foreach (var p in pickups)
        {
            var photos = new List<Photo>();
            for (var i = 0; i < DemoPhotoCounts[p.Id]; i++)
            {
                var img = Images.Process(Images.Demo(p.Seq * 31 + i))!;
                var thumb = new StoredFile { Kind = "thumb", Data = img.Thumb, Size = img.Thumb.Length, W = img.ThumbW, H = img.ThumbH, PickupId = p.Id, CreatedAt = DateTime.UtcNow };
                await db.Files.InsertOneAsync(thumb);
                var file = new StoredFile { Kind = "original", Data = img.Original, Size = img.Original.Length, W = img.W, H = img.H, ThumbId = thumb.Id, PickupId = p.Id, CreatedAt = DateTime.UtcNow };
                await db.Files.InsertOneAsync(file);
                photos.Add(new Photo(file.Id, thumb.Id, img.W, img.H));
            }
            await db.Pickups.UpdateOneAsync(x => x.Id == p.Id, Builders<Pickup>.Update.Set(x => x.Photos, photos));
        }
        if (pickups.Count > 0) log.LogInformation("Demo-bilder lagt til på {Count} ordre", pickups.Count);
        // Hentede demo-ordre: bildene regnes også som dokumentasjon ved henting (kvitteringen i designet viser «3 bilder ved henting»).
        foreach (var p in await db.Pickups.Find(p => ids.Contains(p.Id) && p.Status == PickupStatus.Hentet && p.PickedPhotos.Count == 0 && p.Photos.Count > 0).ToListAsync())
            await db.Pickups.UpdateOneAsync(x => x.Id == p.Id, Builders<Pickup>.Update.Set(x => x.PickedPhotos, p.Photos));
    }

    static async Task ImportPostnr(Db db, ILogger log)
    {
        using var reader = new StreamReader(typeof(Seeder).Assembly.GetManifestResourceStream("postnr.tsv")!);
        var docs = new List<Postnr>();
        while (await reader.ReadLineAsync() is { } line)
        {
            var f = line.Split('\t');
            if (f.Length >= 4) docs.Add(new Postnr { Id = f[0], Poststed = Title(f[1]), Kommunenr = f[2], Kommune = Title(f[3]) });
        }
        if (await db.Postnr.EstimatedDocumentCountAsync() >= docs.Count) return;
        await db.Postnr.DeleteManyAsync(_ => true);
        await db.Postnr.InsertManyAsync(docs);
        log.LogInformation("Importerte {Count} postnummer", docs.Count);
    }

    // "NORD-AURDAL" → "Nord-Aurdal", "EVJE OG HORNNES" → "Evje og Hornnes"
    public static string Title(string s) => Nb.TextInfo.ToTitleCase(s.ToLower(Nb)).Replace(" Og ", " og ").Replace(" I ", " i ");

    static readonly string[] DemoUserIds = ["u1", "u2", "u3", "u4", "u5", "u6", "u7"];

    /// Setter demo-dataene tilbake til designets utgangspunkt med datoer relativt til i dag (dev/e2e: visuelle tester).
    /// Beholder bilder, innloggede økter og push-abonnement; fjerner demo-brukernes varsler og lagrede ruter.
    public static async Task ResetDemo(Db db, ILogger log)
    {
        await SeedDemo(db, DateTime.UtcNow, reset: true);
        await db.Notifications.DeleteManyAsync(n => DemoUserIds.Contains(n.UserId));
        await db.Routes.DeleteManyAsync(r => DemoUserIds.Contains(r.DriverId));
        await SeedDemoPhotos(db, log);
    }

    static async Task SeedDemo(Db db, DateTime nowUtc, bool reset = false)
    {
        // Prototypen er datert fredag 11. september 2026. Alle datoer legges relativt til i dag (norsk tid).
        var today = TimeZoneInfo.ConvertTimeFromUtc(nowUtc, Oslo).Date;
        DateTime At(int day, int h, int m) => TimeZoneInfo.ConvertTimeToUtc(today.AddDays(day).AddHours(h).AddMinutes(m), Oslo);
        string Day(int day) => today.AddDays(day).ToString("yyyy-MM-dd");
        var now = nowUtc;

        await Save(db.Categories, reset, c => c.Id, DesignCategories.Select((c, i) => new Category
        {
            Id = c.Id, Name = c.Name, Icon = c.Id, Order = i,
            KgPerUnit = new() { ["stk"] = 18, ["m2"] = 18, ["lm"] = 18, ["paller"] = 18, ["kg"] = 1 },
        }).ToList());

        await Save(db.Companies, reset, c => c.Id,
        [
            new Company
            {
                Id = "omb", Name = "Ombruksfabrikken AS", City = "Vennesla", Orgnr = "923456789", Phone = "+4738152000", Status = CompanyStatus.Aktiv,
                Since = new DateTime(2023, 8, 1, 0, 0, 0, DateTimeKind.Utc), Coverage = ["Kristiansand", "Vennesla", "Lillesand"],
                Departments =
                [
                    new() { Name = "Hovedlager Vennesla", Type = "hoved", Address = "Industrigata 12, 4700 Vennesla", Phone = "+4738152000", Hours = "man–fre 07–16", Accepts = "vinduer, dører, trevirke" },
                    new() { Name = "Gjenbruksbutikk Kristiansand", Type = "avdeling", Address = "Vestre Strandgate 3, 4611 Kristiansand", Phone = "+4738021122", Hours = "tir–lør 10–17", Accepts = "møbler, innredning, kjøkken" },
                ],
                CreatedAt = new DateTime(2023, 8, 1, 0, 0, 0, DateTimeKind.Utc), UpdatedAt = now,
            },
            new Company
            {
                Id = "gjo", Name = "Gjenbrukslageret Oslo", City = "Oslo", Orgnr = "918222111", Phone = "+4722103040", Status = CompanyStatus.Aktiv,
                Since = new DateTime(2024, 1, 1, 0, 0, 0, DateTimeKind.Utc), Coverage = ["Oslo"],
                CreatedAt = new DateTime(2024, 1, 1, 0, 0, 0, DateTimeKind.Utc), UpdatedAt = now,
            },
            new Company
            {
                Id = "sir", Name = "Sirkula Sør", City = "Arendal", Orgnr = "931555777", Phone = "+4737001234", Status = CompanyStatus.Venter,
                Coverage = ["Arendal", "Grimstad"], CreatedAt = At(-2, 9, 0), UpdatedAt = now,
            },
        ]);

        var hasher = new PasswordHasher<User>();
        User U(string id, string name, string? email, string? phone, string org, Roles roles, string? companyId = null, string? vehicle = null, List<string>? areas = null, string? postnr = null)
        {
            var u = new User
            {
                Id = id, Name = name, Email = email, Phone = Phone.Normalize(phone), Org = org, Roles = roles, CompanyId = companyId,
                Vehicle = vehicle, Areas = areas, Postnr = postnr, CreatedAt = At(-30, 12, 0), UpdatedAt = now,
            };
            if (email != null) u.PasswordHash = hasher.HashPassword(u, DemoPassword);
            return u;
        }
        List<User> users =
        [
            U("u1", "Jonas Hem", "jonas.hem@skanska.no", "912 34 567", "Skanska – Tangen brygge", new() { Giver = true }, postnr: "4608"),
            U("u2", "Silje Nordbø", "silje@ombruksfabrikken.no", "950 12 345", "Ombruksfabrikken AS", new() { Admin = true }, "omb"),
            U("u3", "Kari Aasen", "kari@ombruksfabrikken.no", "912 45 678", "Ombruksfabrikken AS", new() { Driver = true }, "omb", "Lift-bil, 3,5 t", ["Kristiansand"]),
            U("u4", "Ola Berntsen", "ola@ombruksfabrikken.no", "954 32 100", "Ombruksfabrikken AS", new() { Giver = true, Driver = true }, "omb", "Varebil, 1,2 t", ["Vennesla", "Lillesand"], "4700"),
            U("u5", "Mona Lie", "mona@gjenbrukslageret.no", "480 11 223", "Gjenbrukslageret Oslo", new() { Driver = true, Admin = true }, "gjo", "Lastebil m/kran", ["Oslo"]),
            U("u6", "Demo Superbruker", "demo@returapp.no", null, "Returapp", new() { Giver = true, Super = true }, postnr: "4608"),
            U("u7", "Hans Dahl", null, "900 88 776", "Privat", new() { Giver = true }, postnr: "4626"),
        ];
        if (reset)
        {
            var existing = (await db.Users.Find(u => DemoUserIds.Contains(u.Id)).ToListAsync()).ToDictionary(u => u.Id);
            foreach (var u in users.Where(u => existing.ContainsKey(u.Id))) (u.RefreshTokens, u.PushSubscriptions) = (existing[u.Id].RefreshTokens, existing[u.Id].PushSubscriptions);
        }
        await Save(db.Users, reset, u => u.Id, users);

        var postnrs = await db.Postnr.Find(p => new[] { "4608", "4611", "4631", "4626", "4700", "4790", "0555", "4878" }.Contains(p.Id)).ToListAsync();
        var kommune = postnrs.ToDictionary(p => p.Id, p => p.Kommune);

        Pickup P(string id, string cat, string title, string desc, string org, string contact, string phone, string addr, string postnr, double qty, string unit, string cond, string dims,
            string? day, string? slot, bool unattended, string status, string? company, string? driver, DateTime created, int kg, string? giverUserId = null, bool open = false)
        {
            var log = new List<StatusLogEntry> { new(PickupStatus.Ny, created, giverUserId) };
            if (status is PickupStatus.Tildelt or PickupStatus.Planlagt or PickupStatus.Hentet or PickupStatus.Avvik)
                log.Add(new(status == PickupStatus.Tildelt ? PickupStatus.Tildelt : PickupStatus.Planlagt, created.AddHours(2), "u2"));
            return new Pickup
            {
                Id = id, Seq = int.Parse(id[2..]), CategoryId = cat, Title = title, Desc = desc, GiverUserId = giverUserId, GiverOrg = org, Contact = contact,
                Phone = Phone.Normalize(phone)!, Address = addr, Postnr = postnr, Kommune = kommune[postnr], Qty = qty, Unit = unit, Cond = cond, Dims = dims,
                Day = day, Slot = slot, Unattended = unattended, Status = status, CompanyId = company, DriverId = driver, Open = open, EstKg = kg,
                StatusLog = log, CreatedAt = created, UpdatedAt = now,
            };
        }

        // R-2041 og R-2037 er Karis stopp på «I dag»-skjermen og ruten i designet (datoteksten der sier 16. sep) – seedes på i dag så skjermene blir like.
        var r2041 = P("R-2041", "vinduer", "24 vinduer, 3-lags glass", "Demontert fra 2. etasje, hele karmer. Stablet på paller ved port B.", "Skanska – Tangen brygge", "Jonas Hem", "912 34 567",
            "Tangen 8", "4608", 24, "stk", "God", "120 × 140 cm", Day(0), "09–12", true, PickupStatus.Planlagt, "omb", "u3", At(-1, 8, 14), 720, "u1");
        r2041.Messages =
        [
            new("u3", "Hei! Er vinduene tilgjengelige fra porten, eller må vi inn på plassen?", At(-1, 15, 2)),
            new("u1", "De står rett innenfor port B. Vakta åpner.", At(-1, 15, 10)),
            new("u3", "Perfekt, vi kommer med lift-bil ca 09:30.", At(-1, 15, 12)),
        ];
        var r2030 = P("R-2030", "innredning", "Glassvegger, 6 seksjoner", "Kontorvegger i glass med aluminiumsprofil.", "AF Gruppen – Kvadraturen", "Jonas Hem", "912 34 567",
            "Markens gate 12", "4611", 6, "seksjoner", "God", "250 × 270 cm", Day(-2), "09–12", false, PickupStatus.Hentet, "omb", "u3", At(-7, 9, 20), 480, "u1");
        r2030.PickedAt = At(-2, 10, 48);
        r2030.PickedQty = 6;
        r2030.StatusLog.Add(new(PickupStatus.Hentet, r2030.PickedAt.Value, "u3"));
        var r2028 = P("R-2028", "elektro", "60 LED-armaturer", "Takarmaturer 60×60, fungerende ved demontering.", "Skanska – Tangen brygge", "Jonas Hem", "912 34 567",
            "Tangen 8", "4608", 60, "stk", "God", "60 × 60 cm", Day(-8), "12–15", true, PickupStatus.Avvik, "omb", "u4", At(-11, 11, 0), 0, "u1");
        r2028.Deviation = new("Varen var ødelagt", "Ca 40 av 60 hadde knust deksel etter lagring ute.", At(-8, 13, 5));
        r2028.StatusLog.Add(new(PickupStatus.Avvik, r2028.Deviation.At, "u4"));

        var pickups = new List<Pickup>
        {
            r2041,
            P("R-2037", "mobler", "30 kontorstoler", "Kontorstoler fra flytting, sorte, fungerende hev/senk.", "Cowi – Rådhusgata", "Mette Skar", "405 11 222",
                "Rådhusgata 3", "4611", 30, "stk", "God", "", Day(0), "12–15", false, PickupStatus.Planlagt, "omb", "u3", At(-3, 13, 40), 420),
            P("R-2042", "paller", "40 europaller", "Hele EUR-paller, står under tak ved varemottak.", "Byggmakker Vennesla", "Trond Aas", "380 15 200",
                "Sentrumsveien 3", "4700", 40, "stk", "God", "80 × 120 cm", null, "07–15", true, PickupStatus.Ny, "omb", null, At(0, 7, 52), 1000),
            P("R-2039", "kjokken", "Komplett kjøkken, 12 skrog", "Hvitt kjøkken fra 2018, benkeplate i laminat. Demonteres fredag.", "Veidekke – Lund skole", "Amir Haddad", "977 65 432",
                "Lundsvei 22", "4631", 12, "skrog", "Som ny", "Ca 6 m benk", null, null, false, PickupStatus.Tildelt, "omb", "u4", At(-4, 10, 5), 260),
            P("R-2035", "dorer", "12 innerdører m/karm", "Hvite kompaktdører, 80 og 90 cm, noen med glassfelt.", "Privat – Hans Dahl", "Hans Dahl", "900 88 776",
                "Slettheiveien 40", "4626", 12, "stk", "Brukbar", "80–90 × 210 cm", null, null, true, PickupStatus.Ny, "omb", null, At(-1, 18, 30), 300, "u7", open: true),
            P("R-2043", "sanitaer", "6 servanter og 4 toaletter", "Fra rehab av kontorbygg. Porsgrund, hvite.", "Bundebygg – Grünerløkka", "Lise Moe", "458 22 333",
                "Thorvald Meyers gate 7", "0555", 10, "stk", "Brukbar", "", null, null, false, PickupStatus.Ny, "gjo", null, At(0, 11, 2), 180),
            P("R-2044", "trevirke", "Limtrebjelker, 8 stk à 6 m", "Rette limtrebjelker fra rivning av lagerhall. Krever kran.", "Grimstad Eiendom", "Per Lie", "913 00 111",
                "Storgaten 44", "4878", 8, "stk", "God", "6 m × 20 × 40 cm", null, null, true, PickupStatus.Ny, null, null, At(0, 9, 15), 1400),
            r2030,
            r2028,
        };

        // ~60 hentede historikk-ordre for Ombruksfabrikken siste 60 dager, deterministisk (Random(42)), så statistikk blir meningsfull.
        var rnd = new Random(42);
        string[] givers = ["Cowi – Rådhusgata", "Veidekke – Lund skole", "Byggmakker Vennesla", "AF Gruppen – Kvadraturen", "Kruse Smith – Sørlandsparken"];
        string[] contacts = ["Mette Skar", "Amir Haddad", "Trond Aas", "Line Berg", "Erik Moen"];
        (string Postnr, string Addr)[] places = [("4608", "Tangen 20"), ("4611", "Markens gate 30"), ("4631", "Lundsvei 10"), ("4626", "Slettheiveien 12"), ("4700", "Sentrumsveien 8"), ("4790", "Storgata 5")];
        for (var i = 0; i < 60; i++)
        {
            var cat = DesignCategories[rnd.Next(DesignCategories.Length)];
            var g = rnd.Next(givers.Length);
            var place = places[rnd.Next(places.Length)];
            var qty = rnd.Next(2, 41);
            var created = At(-61 + i, 7 + rnd.Next(9), rnd.Next(60));
            var picked = At(-60 + i, 9 + rnd.Next(6), rnd.Next(60));
            var driver = kommune[place.Postnr] is "Vennesla" or "Lillesand" ? "u4" : "u3";
            var deviation = i % 15 == 7;
            var p = P($"R-{1001 + i}", cat.Id, $"{qty} stk {cat.Name.ToLower(Nb)}", "", givers[g], contacts[g], "400 00 " + (100 + g), place.Addr, place.Postnr, qty, "stk",
                Conds[rnd.Next(Conds.Length)], "", Day(-60 + i), Slots[rnd.Next(Slots.Length)], rnd.Next(2) == 0,
                deviation ? PickupStatus.Avvik : PickupStatus.Hentet, "omb", driver, created, qty * 18);
            p.StatusLog[1] = p.StatusLog[1] with { At = created.AddHours(1 + rnd.Next(12)) };
            if (deviation)
            {
                p.Deviation = new(DeviationReasons[rnd.Next(DeviationReasons.Length)], "", picked);
                p.StatusLog.Add(new(PickupStatus.Avvik, picked, driver));
            }
            else
            {
                p.PickedAt = picked;
                p.PickedQty = qty;
                p.StatusLog.Add(new(PickupStatus.Hentet, picked, driver));
            }
            pickups.Add(p);
        }
        if (reset)
        {
            var ids = pickups.Select(p => p.Id).ToList();
            var photos = (await db.Pickups.Find(p => ids.Contains(p.Id)).Project(p => new { p.Id, p.Photos }).ToListAsync()).ToDictionary(p => p.Id, p => p.Photos);
            foreach (var p in pickups) p.Photos = photos.GetValueOrDefault(p.Id, []);
        }
        await Save(db.Pickups, reset, p => p.Id, pickups);

        await Save(db.Support, reset, s => s.Id,
        [
            new SupportCase { Id = "s1", FromUserId = "u7", FromName = "Hans Dahl", Org = "Privat", Text = "Får ikke lagt til bilder fra iPhone – knappen gjør ingenting.", Open = true, CreatedAt = At(0, 10, 12), UpdatedAt = now },
            new SupportCase { Id = "s2", FromName = "Sirkula Sør", Org = "Hentefirma", Text = "Når kan vi forvente svar på godkjenningen?", Open = true, CreatedAt = At(-1, 14, 0), UpdatedAt = now },
            new SupportCase { Id = "s3", FromName = "Mette Skar", Org = "Cowi", Text = "Takk for rask hjelp med endring av tidsvindu!", Open = false, CreatedAt = At(-3, 11, 0), UpdatedAt = now },
        ]);
    }

    static Task Save<T>(IMongoCollection<T> col, bool reset, Func<T, string> id, List<T> docs) => reset
        ? col.BulkWriteAsync(docs.Select(d => new ReplaceOneModel<T>(Builders<T>.Filter.Eq("_id", id(d)), d) { IsUpsert = true }))
        : col.InsertManyAsync(docs);
}
