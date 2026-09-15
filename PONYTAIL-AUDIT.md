# Ponytail-audit – Returapp

Grunnlag: `ponytail-audit` over hele repoet og `ponytail-review` av diffen `main...opd` (16 commits, 253 filer). Diffen er i praksis hele appen, så funnene fra de to gjennomgangene er slått sammen. Gjennomgangen ser bare på over-engineering og unødvendig kompleksitet. Feil, sikkerhet og ytelse er holdt utenfor. Rapporten endret ingen kode; funn 1–16 er senere gjennomført i commit `22f75f3` (se Rekkefølge).

## Sammendrag

**19 funn:** 2 med høy effekt, 8 med middels effekt og 9 med lav effekt.

Samlet kan koden bli omtrent 60 linjer kortere, med 4 færre avhengigheter (`@angular/forms`, `qrcode`, `@types/qrcode` og `prettier`) og én fil mindre i backend.

Utenfor scope, men sett underveis (tas i vanlig review):
- Sjåførens merknad ved henting (`pickedNote`) lagres, men vises ingen steder.
- OTP-dokumentet får `Expires` 10 minutter fram i tid, mens koden bare godtas i 5 minutter.

## Funn

Sortert etter effekt delt på risiko. Ved likt forhold kommer lavest risiko først.

### 1. CO₂-faktoren er konfigurerbar i API-et, men hardkodet i frontend
- **Fil(er):** backend/src/Returapp.Api/Services/Weight.cs:14, frontend/src/app/core/format.ts:13, .env.development.example:39, DEPLOY.md:65
- **Hva:** `App__Co2Factor` kan settes i Environment, og `co2()` i frontend har en `factor`-parameter. Frontend sender aldri inn faktoren og regner alltid med 0,9. Endrer noen variabelen, viser API-et (statistikk, eksport, PDF) og appen (kvittering, hjem) forskjellige tall.
- **Hvorfor:** Trinn 1 (trenger det å finnes): konfigurasjon ingen setter, og som ikke kan settes uten at tallene sprikes.
- **Forslag:** Bruk en konstant på begge sider, fjern miljøvariabelen og fjern parameteren i `co2()`.
- **Diff-skisse:**
  ```diff
  - public static int Co2(double kg, IConfiguration cfg) => (int)Math.Round(kg * cfg.GetValue("App:Co2Factor", 0.9));
  + public static int Co2(double kg) => (int)Math.Round(kg * 0.9); // samme faktor som frontend core/format.ts
  - export function co2(kgValue: number, factor = 0.9): number {
  -   return Math.round(kgValue * factor);
  + export const co2 = (kgValue: number) => Math.round(kgValue * 0.9);
  - App__Co2Factor=0.9          (.env.development.example og DEPLOY.md)
  ```
- **Risiko:** Lav. De 5 kallene til `Weight.Co2` mister `cfg`-argumentet, og kompilatoren finner alle. Har noen satt en annen verdi i Dokploy, blir den ignorert. Den ga uansett avvikende tall.
- **Testdekning:** Ja. `format.spec.ts` (`co2(480)` gir 432), `AdminTests` (`co2Kg` 585) og `ExportTests` (CSV-kolonnen for CO₂).
- **Avhenger av:** Ingen.

### 2. `@angular/forms` er installert, men ikke brukt
- **Fil(er):** frontend/package.json:18
- **Hva:** Ingen fil importerer `@angular/forms`. Alle skjemaer bruker signaler og `(input)`.
- **Hvorfor:** Trinn 1: avhengighet uten bruk (rest fra Angular-oppsettet).
- **Forslag:** `npm uninstall @angular/forms`.
- **Diff-skisse:**
  ```diff
      "@angular/core": "^22.1.0",
  -   "@angular/forms": "^22.1.0",
      "@angular/platform-browser": "^22.1.0",
  ```
- **Risiko:** Lav. Bygget feiler med en gang hvis noe likevel importerer pakken, og `grep` finner ingen import.
- **Testdekning:** Ja. `ng build` og Vitest.
- **Avhenger av:** Ingen.

### 3. Tre autorisasjonspolicyer brukes aldri
- **Fil(er):** backend/src/Returapp.Api/Program.cs:66-68
- **Hva:** Policyene `giver`, `driver` og `admin` er registrert, men ingen endepunkter bruker dem. Rollesjekkene gjøres med `Caller.Has(...)` inne i endepunktene. Bare `user` og `super` er i bruk.
- **Hvorfor:** Trinn 1: død konfigurasjon.
- **Forslag:** Fjern de tre linjene.
- **Diff-skisse:**
  ```diff
   builder.Services.AddAuthorizationBuilder()
       .AddPolicy("user", p => p.RequireClaim("sub"))
  -    .AddPolicy("giver", p => p.RequireRole("giver"))
  -    .AddPolicy("driver", p => p.RequireRole("driver"))
  -    .AddPolicy("admin", p => p.RequireRole("admin"))
       .AddPolicy("super", p => p.RequireRole("super"));
  ```
- **Risiko:** Lav. En framtidig `RequireAuthorization("admin")` må legge policyen tilbake.
- **Testdekning:** Ja. Alle 63 backend-testene starter appen med policyoppsettet.
- **Avhenger av:** Ingen.

### 4. JWT-innstillinger som ingen endrer
- **Fil(er):** backend/src/Returapp.Api/Services/Jwt.cs:13-16, .env.development.example:12-14, DEPLOY.md:41-43
- **Hva:** `Jwt__Issuer`, `Jwt__AccessMinutes` og `Jwt__RefreshDays` kan konfigureres, men settes overalt til standardverdiene, både i eksempelfilen og i DEPLOY.md. Det blir tre miljøvariabler per miljø å vedlikeholde uten gevinst.
- **Hvorfor:** Trinn 1: konfigurasjon ingen setter.
- **Forslag:** Gjør dem til konstanter og fjern variablene fra dokumentasjonen.
- **Diff-skisse:**
  ```diff
  - public static string Issuer(IConfiguration cfg) => cfg["Jwt:Issuer"] ?? "returapp";
  - public int AccessMinutes => cfg.GetValue("Jwt:AccessMinutes", 15);
  - public int RefreshDays => cfg.GetValue("Jwt:RefreshDays", 30);
  + public const string Issuer = "returapp";
  + public const int AccessMinutes = 15, RefreshDays = 30;
  - Jwt__Issuer=returapp / Jwt__AccessMinutes=15 / Jwt__RefreshDays=30   (.env-eksempel og DEPLOY.md)
  ```
- **Risiko:** Lav. `Program.cs` bruker `Jwt.Issuer(cfg)` to steder og må oppdateres. Er en annen issuer satt i Dokploy, blir access-tokenene ugyldige én gang, men refresh-tokenene fornyer dem.
- **Testdekning:** Ja. `AuthTests` (innlogging, refresh, utlogging) og alle testene med innlogget bruker.
- **Avhenger av:** Ingen.

### 5. Felter på lagrede filer som skrives, men aldri leses
- **Fil(er):** backend/src/Returapp.Api/Models/Reference.cs:62-63, backend/src/Returapp.Api/Services/Images.cs:5, backend/src/Returapp.Api/Endpoints/Photos.cs:29-31 og :47, backend/src/Returapp.Api/Seed/Seeder.cs:52-54
- **Hva:**
  - `StoredFile.Size` skrives og leses aldri.
  - `StoredFile.ContentType` er alltid `image/jpeg`, fordi alt kodes om til JPEG.
  - `ProcessedImage.ThumbW` og `ThumbH` lagres på miniatyrbildet, men bare originalens mål brukes (i `Photo`).
- **Hvorfor:** Trinn 1: data og fleksibilitet ingen bruker.
- **Forslag:** Fjern feltene og skriv MIME-typen rett i svaret.
- **Diff-skisse:**
  ```diff
  -    public string ContentType { get; set; } = "image/jpeg";
  -    public int Size { get; set; }
  -public record ProcessedImage(byte[] Original, int W, int H, byte[] Thumb, int ThumbW, int ThumbH);
  +public record ProcessedImage(byte[] Original, int W, int H, byte[] Thumb);
  -    return Results.File(file.Data, file.ContentType);
  +    return Results.File(file.Data, "image/jpeg"); // Images.Process koder alltid om til JPEG
  ```
- **Risiko:** Lav. Eksisterende dokumenter beholder feltene, og `IgnoreExtraElements` er på. Skal andre filtyper lagres senere, må `ContentType` tilbake.
- **Testdekning:** Ja. `PickupTests` laster opp og henter bilder, og `DriverTests` laster opp ved henting.
- **Avhenger av:** Ingen (gjør gjerne sammen med 13 og 14, som berører de samme filene).

### 6. Én support-rute ligger alene i egen fil
- **Fil(er):** backend/src/Returapp.Api/Endpoints/Support.cs:1-26, backend/src/Returapp.Api/Endpoints/Super.cs:142-157, backend/src/Returapp.Api/Program.cs (`app.MapSupport()`)
- **Hva:** `POST /api/support` har egen fil med egen klasse, egen gruppe og egen `Map`-metode. Liste, svar og lukking av de samme sakene ligger i `Super.cs`.
- **Hvorfor:** Trinn 2 (finnes allerede her): support-endepunktene har allerede et hjem, og filen eksporterer én ting.
- **Forslag:** Flytt ruten inn i `Super.cs`, ved siden av de andre `/support`-rutene, og slett filen og `MapSupport()`.
- **Diff-skisse:**
  ```diff
  - Endpoints/Support.cs (26 linjer: using, namespace, klasse, record, gruppe, rute)
  + // Super.cs, ved siden av GET /support og /support/{id}/reply:
  + app.MapPost("/api/support", async (SupportBody b, HttpContext ctx, Db db) => { … }).RequireAuthorization("user");
  - app.MapSupport();
  ```
- **Risiko:** Lav. Ruten får samme sti og samme policy.
- **Testdekning:** Ja. `SuperTests` (support: sak, svar og varsel) og e2e-testen for support i `super.spec.ts`.
- **Avhenger av:** Ingen.

### 7. `Caller.IsGuest` gjentar `GuestId != null`
- **Fil(er):** backend/src/Returapp.Api/Services/Jwt.cs:49 og :60-65, backend/src/Returapp.Api/Endpoints/Pickups.cs:26
- **Hva:** `Caller` har både `bool IsGuest` (fra kravet `guest`) og `string? GuestId` (fra kravet `gid`). Gjest-tokenet har alltid begge. Sjekker som `c.IsGuest && c.GuestId != null` tester derfor det samme to ganger.
- **Hvorfor:** Trinn 7 (minimum som virker): to felt for samme tilstand.
- **Forslag:** Gjør `IsGuest` om til en beregnet egenskap og fjern dobbeltsjekkene.
- **Diff-skisse:**
  ```diff
  -public record Caller(string? UserId, bool IsGuest, string? GuestId, string[] Roles, string? CompanyId)
  +public record Caller(string? UserId, string? GuestId, string[] Roles, string? CompanyId)
   {
  +    public bool IsGuest => GuestId != null;
  -        p.FindFirstValue("guest") == "true",
  -        || (c.IsGuest && c.GuestId != null && p.GuestId == c.GuestId)
  +        || (c.IsGuest && p.GuestId == c.GuestId)
  ```
- **Risiko:** Lav. Gjelder bare hvis det finnes tokens med `guest` uten `gid`, og `Jwt.Guest` lager dem ikke. Kravet `guest` kan fortsatt utstedes.
- **Testdekning:** Ja. `PickupTests` (gjest melder og ser egne ordre) og e2e-testene «Gjest kommer rett inn» og gjest-flyten i `pickups.spec.ts`.
- **Avhenger av:** Ingen.

### 8. Tom plassholder-komponent som ingen bruker
- **Fil(er):** frontend/src/app/shell/empty.ts:1-5
- **Hva:** `Empty` var «plassholder for skjermer som bygges i senere faser». Alle fasene er ferdige, og ingen rute importerer den lenger.
- **Hvorfor:** Trinn 1: død kode.
- **Forslag:** Slett filen.
- **Diff-skisse:**
  ```diff
  - /** Tom side – plassholder for skjermer som bygges i senere faser. */
  - @Component({ selector: 'ra-empty', host: { style: 'display:contents' }, template: '' })
  - export class Empty {}
  ```
- **Risiko:** Lav.
- **Testdekning:** Ja. `ng build` feiler hvis noe fortsatt importerer den.
- **Avhenger av:** Ingen.

### 9. Svarfelter som appen aldri leser
- **Fil(er):** backend/src/Returapp.Api/Endpoints/Auth.cs:256, backend/src/Returapp.Api/Endpoints/Pickups.cs:362, frontend/src/app/core/auth.store.ts:20, frontend/src/app/core/pickups.ts:41, backend/tests/Returapp.Api.Tests/MessageTests.cs:90
- **Hva:** `pushDevices` (i `/api/me`) og `companyPhone` (i hentingsobjektet) sendes med i API-svarene og står i TypeScript-typene, men ingen skjerm leser dem. `pushDevices` leses bare av én backend-test.
- **Hvorfor:** Trinn 1: API-flate uten bruker.
- **Forslag:** Fjern feltene. Testen kan sjekke abonnementet direkte i databasen.
- **Diff-skisse:**
  ```diff
  - … u.Vehicle, u.Areas, pushDevices = u.PushSubscriptions.Count };
  + … u.Vehicle, u.Areas };
  - p.CompanyId, companyName = company?.Name, companyPhone = company?.Phone,
  + p.CompanyId, companyName = company?.Name,
  -  pushDevices?: number;          (auth.store.ts)
  -  companyPhone: string | null;   (pickups.ts)
  - Assert.Equal(0, me.GetProperty("pushDevices").GetInt32());
  + Assert.Empty((await api.Db.Users.Find(u => u.Id == giver.Id).FirstAsync()).PushSubscriptions);
  ```
- **Risiko:** Lav. TypeScript-bygget finner eventuell bruk i frontend.
- **Testdekning:** Delvis. `MessageTests` må endres som vist, og `ng build` fanger frontend.
- **Avhenger av:** Ingen.

### 10. Prettier er installert og konfigurert, men kjøres aldri
- **Fil(er):** frontend/package.json:34, frontend/.prettierrc
- **Hva:** Ingen npm-script, CI-steg eller hook kjører Prettier. Koden bryter `printWidth: 100` over alt (malene har linjer på 300+ tegn), så verktøyet har aldri formatert repoet.
- **Hvorfor:** Trinn 1: avhengighet og konfigurasjon uten effekt.
- **Forslag:** Fjern pakken og `.prettierrc`. Alternativet er å ta Prettier i bruk på ordentlig i CI, men da skal malene ikke formateres om (de er kopiert ordrett fra designet).
- **Diff-skisse:**
  ```diff
  -    "prettier": "^3.8.1",
  - frontend/.prettierrc (printWidth 100, singleQuote, angular-parser for *.html)
  ```
- **Risiko:** Lav. En editor med «format on save» som leser `.prettierrc`, oppfører seg annerledes.
- **Testdekning:** Ikke relevant.
- **Avhenger av:** Ingen.

### 11. `PushPayload` er en egen klasse for én metode med én kaller
- **Fil(er):** backend/src/Returapp.Api/Services/Push.cs:52-63, backend/src/Returapp.Api/Services/Notify.cs:39
- **Hva:** En offentlig statisk klasse med én metode som bare `Notifier.Push` bruker.
- **Hvorfor:** Trinn 7: lag med én kaller.
- **Forslag:** Flytt serialiseringen inn i `Notifier.Push` som en privat metode.
- **Diff-skisse:**
  ```diff
  -public static class PushPayload
  -{
  -    public static string For(string title, string body, string url) => JsonSerializer.Serialize(new { notification = … });
  -}
  -        var payload = PushPayload.For(title, body, url);
  +        var payload = JsonSerializer.Serialize(new { notification = new { title, body, … } }); // format Angulars service worker forstår
  ```
- **Risiko:** Lav.
- **Testdekning:** Ja. `MessageTests` sjekker innholdet i push-varselet (`LastPush`).
- **Avhenger av:** Ingen.

### 12. Månedsnavnene er definert to ganger i frontend
- **Fil(er):** frontend/src/app/core/super.ts:84, frontend/src/app/core/format.ts:5
- **Hva:** `super.ts` har sin egen `MONTHS`-liste, identisk med den i `format.ts`.
- **Hvorfor:** Trinn 2: finnes allerede her.
- **Forslag:** Eksporter `MONTHS` fra `format.ts` og importer den i `super.ts`.
- **Diff-skisse:**
  ```diff
  -const MONTHS = ['jan', 'feb', 'mar', 'apr', 'mai', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'des'];   (super.ts)
  +import { MONTHS } from './format';
  -const MONTHS = [...]   (format.ts)
  +export const MONTHS = [...]
  ```
- **Risiko:** Lav.
- **Testdekning:** Ja. Den visuelle testen `super/companies` («Aug 2023», «Søkte 9. sep»).
- **Avhenger av:** Ingen.

### 13. `Pickup.Seq` lagres bare for å velge demobilder
- **Fil(er):** backend/src/Returapp.Api/Models/Pickup.cs:6, backend/src/Returapp.Api/Endpoints/Pickups.cs:62, backend/src/Returapp.Api/Seed/Seeder.cs:51 og :175
- **Hva:** Hver ordre lagrer tallet fra id-en (`R-2041` blir 2041) i et eget felt. Eneste leser er seeding av demobilder, som bruker tallet til å velge bildevariant.
- **Hvorfor:** Trinn 1: avledet data lagret uten bruk i appen.
- **Forslag:** Fjern feltet og les tallet fra id-en der det trengs.
- **Diff-skisse:**
  ```diff
  -    public int Seq { get; set; }
  -                Id = id, Seq = int.Parse(id[2..]), CategoryId = cat.Id, …
  +                Id = id, CategoryId = cat.Id, …
  -                var img = Images.Process(Images.Demo(p.Seq * 31 + i))!;
  +                var img = Images.Process(Images.Demo(int.Parse(p.Id[2..]) * 31 + i))!;
  ```
- **Risiko:** Lav. Gamle dokumenter beholder feltet, og demobildene får samme variant som før.
- **Testdekning:** Ja. `FoundationTests` (demo-reset beholder bildene) og de visuelle testene.
- **Avhenger av:** Ingen (samme fil som 5).

### 14. `Images.Process` har parametre som aldri brukes
- **Fil(er):** backend/src/Returapp.Api/Services/Images.cs:10
- **Hva:** `maxSide` og `thumbSide` har standardverdier, og ingen kaller overstyrer dem (opplasting og seeding bruker standarden).
- **Hvorfor:** Trinn 1: ubrukt fleksibilitet.
- **Forslag:** Bruk tallene direkte.
- **Diff-skisse:**
  ```diff
  -    public static ProcessedImage? Process(byte[] input, int maxSide = 2048, int thumbSide = 400)
  +    public static ProcessedImage? Process(byte[] input)
  -        using var big = Fit(oriented, maxSide);
  -        using var small = Fit(big, thumbSide);
  +        using var big = Fit(oriented, 2048);
  +        using var small = Fit(big, 400);
  ```
- **Risiko:** Lav.
- **Testdekning:** Ja. `PickupTests` (opplasting og nedskalering).
- **Avhenger av:** Ingen (samme fil som 5).

### 15. To nesten likt e2e-hjelpere som begge leser siste melding fra dev-API-et
- **Fil(er):** frontend/e2e/helpers.ts:5-9 og :12-20
- **Hva:** `devCode` spør `/api/dev/last-sms` til den svarer, og henter så samme adresse én gang til for å lese innholdet. `mailLink` gjør det samme mot `/api/dev/last-mail` med lagret svar og regex.
- **Hvorfor:** Trinn 2: samme mønster finnes allerede i filen.
- **Forslag:** Lag én hjelper som venter på et treff og returnerer det, og bruk den fra begge.
- **Diff-skisse:**
  ```diff
  +async function devMatch(request: APIRequestContext, url: string, field: 'text' | 'body', re: RegExp) {
  +  let value = '';
  +  await expect.poll(async () => { const r = await request.get(url); value = r.ok() ? (await r.json())[field] : ''; return re.test(value); }).toBe(true);
  +  return re.exec(value)![0];
  +}
  +export const devCode = (req, phone) => devMatch(req, `${API}/api/dev/last-sms?phone=${encodeURIComponent(phone)}`, 'text', /\d{6}/);
  +export const mailLink = (req, to, path) => devMatch(req, `${API}/api/dev/last-mail?to=${encodeURIComponent(to)}`, 'body', new RegExp(`/${path}/[\\w-]+`));
  ```
- **Risiko:** Lav. Gjelder bare testkode.
- **Testdekning:** Ja. Auth-testene (SMS-innlogging, invitasjon, glemt passord) bruker begge hjelperne.
- **Avhenger av:** Ingen.

### 16. Egen regex for tusenskille der `toLocaleString` gjør jobben
- **Fil(er):** frontend/src/app/core/format.ts:18-20, frontend/src/app/core/format.spec.ts:14
- **Hva:** `num()` setter mellomrom mellom hvert tredje siffer med en egen regex.
- **Hvorfor:** Trinn 3 (stdlib): `Number.prototype.toLocaleString('nb-NO')`.
- **Forslag:** Bruk `toLocaleString`. Norsk locale bruker hardt mellomrom (U+00A0), som ser likt ut og i tillegg hindrer linjeskift inne i tallet.
- **Diff-skisse:**
  ```diff
   export function num(n: number): string {
  -  return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  +  return Math.round(n).toLocaleString('nb-NO');
   }
  -    expect(num(1284)).toBe('1 284');
  +    expect(num(1284)).toBe('1 284');
  ```
- **Risiko:** Lav. Tekstsøk i tester som skriver tallet med vanlig mellomrom må bruke hardt mellomrom. I dag gjør ingen e2e-test det, og statistikktallene er maskert i den visuelle testen.
- **Testdekning:** Ja. `format.spec.ts` (må oppdateres som vist).
- **Avhenger av:** Ingen.

### 17. Samme «varsle giver, ellers SMS til gjest»-gren på fem steder
- **Fil(er):** backend/src/Returapp.Api/Endpoints/Pickups.cs:182-183, :197-198, :237-238 og :257-258, backend/src/Returapp.Api/Endpoints/Companies.cs:216-217, backend/src/Returapp.Api/Services/Notify.cs
- **Hva:** Hver statusendring gjentar `if (p.GiverUserId != null) await notify.User(...); else if (p.GuestPhone != null) await notify.Sms(...)`. Regelen «konto følger egne innstillinger, gjest får SMS» ligger dermed i hvert endepunkt i stedet for i varslingstjenesten.
- **Hvorfor:** Trinn 2: `Notifier` er allerede den ene veien for varsler, og regelen hører hjemme der.
- **Forslag:** Legg til `Notifier.Giver(Pickup, type, title, text, channels)` og bruk den fra alle fem stedene.
- **Diff-skisse:**
  ```diff
  +    /// Giver med konto får varsel etter egne innstillinger; gjest (uten konto) får SMS.
  +    public Task Giver(Pickup p, string type, string title, string text, Channels channels = Channels.Sms) =>
  +        p.GiverUserId != null ? User(p.GiverUserId, type, title, text, p.Id, channels)
  +        : p.GuestPhone != null ? Sms(p.GuestPhone, text) : Task.CompletedTask;
  -            if (p.GiverUserId != null) await notify.User(p.GiverUserId, "pickup.started", "Sjåføren er på vei", text, id, Channels.Sms);
  -            else if (p.GuestPhone != null) await notify.Sms(p.GuestPhone, text);
  +            await notify.Giver(p, "pickup.started", "Sjåføren er på vei", text);
  ```
- **Risiko:** Middels. Stedene er ikke helt like:
  - Tildeling sender til gjest bare når tidspunktet er planlagt.
  - Avvik har prefikset «Avvik på {id}:» for gjest.
  - Fullført henting sender i tillegg kvitteringen på e-post til brukere med konto.

  En ukritisk erstatning gjør at gjester stille mister eller får feil SMS.
- **Testdekning:** Delvis. `DriverTests` sjekker SMS til giver med konto (på vei og fullført), og `CoverageTests` en gjest-SMS. Grenene for gjest ved start, fullført og avvik er ikke testet, så legg til en gjest-sjekk før refaktoreringen.
- **Avhenger av:** Ingen.

### 18. Sikkerhetsheaderne gjentas i hver location i nginx
- **Fil(er):** infra/web/nginx.conf:26-46
- **Hva:** `X-Content-Type-Options` og `Strict-Transport-Security` står fire ganger, fordi nginx ikke arver `add_header` inn i en location som har egne `add_header`. Det eneste som faktisk varierer, er `Cache-Control`.
- **Hvorfor:** Trinn 4 (native plattform): nginx `map` lar én variabel bære forskjellen, så headerne kan settes én gang på server-nivå.
- **Forslag:** La en `map $uri $cache_control` avgjøre cache-regelen, sett alle headerne én gang i `server`, og behold location-blokkene bare for `try_files`. En tom verdi gjør at nginx ikke sender headeren, så `/api/` kan unntas slik at API-ets egne cache-headere ikke dubleres.
- **Diff-skisse:**
  ```diff
  +map $uri $cache_control {
  +    ~^/api/              "";
  +    ~*\.(js|css|woff2)$  "public, max-age=31536000, immutable";
  +    default              "no-cache";
  +}
   server {
  +    add_header Cache-Control $cache_control;
  +    add_header X-Content-Type-Options nosniff;
  +    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
  -    location = /index.html { add_header ×3 }  location ~ ^/(ngsw…)$ { add_header ×3 }  location ~* \.(js|css|woff2)$ { add_header ×3 … }
  ```
- **Risiko:** Middels. Headerne ville da også gjelde svar via `/api/`, der API-et allerede setter `nosniff` (to like verdier, ufarlig) og egen `Cache-Control` for bilder (må unntas som vist). Ikoner og andre ikke-hashede filer får `no-cache` i stedet for ingen header. Det går fordi service workeren cacher dem, men det er en endring.
- **Testdekning:** Nei. Headerne ble sjekket manuelt med `curl` i fase 13. En e2e-sjekk av `index.html`, en JS-fil og `/api/health` bør legges til først.
- **Avhenger av:** Ingen.

### 19. QR-bibliotek i frontend, når API-et allerede lager QR
- **Fil(er):** frontend/src/app/pickup/label.ts:3 og :36-44, frontend/package.json:23 og :32, frontend/angular.json:47, backend/src/Returapp.Api/Services/Pdf.cs:138
- **Hva:** Merkelappen bruker npm-pakkene `qrcode` og `@types/qrcode`. Pakken er CommonJS og krever unntak i `angular.json`. API-et har samtidig `QRCoder` og `Pdf.Qr(url)`, som gir samme SVG til PDF-merkelappen.
- **Hvorfor:** Trinn 2 og 5: funksjonaliteten finnes allerede i en installert avhengighet i repoet.
- **Forslag:** Legg til `GET /api/pickups/{id}/qr.svg` som returnerer `Pdf.Qr(...)`, og vis den i `label.ts` via `HttpClient` (med token). Fjern pakkene og unntaket.
- **Diff-skisse:**
  ```diff
  +        g.MapGet("/{id}/qr.svg", async (string id, HttpContext ctx, Db db, IConfiguration cfg) =>
  +            … CanRead … Results.Text(Pdf.Qr($"{cfg["App:BaseUrl"]}/p/{id}"), "image/svg+xml"));
  -import QRCode from 'qrcode';
  -        (await QRCode.toString(labelUrl(params), { type: 'svg', margin: 0, … })).replace('<svg ', '<svg width="180" height="180" '),
  +        await firstValueFrom(this.http.get(`/api/pickups/${params}/qr.svg`, { responseType: 'text' })),
  -    "qrcode": "^1.5.4",   "@types/qrcode": "^1.5.6",   "allowedCommonJsDependencies": ["qrcode"]
  ```
- **Risiko:** Høy.
  - Merkelappen virker i dag uten nett. Etter endringen må den ha vært åpnet på nett én gang, fordi service workeren cacher `/api/pickups**`.
  - SVG-en fra QRCoder har andre farger, marger og størrelse enn designet (#182119, gjennomsiktig bakgrunn, 180 px), og må justeres.
  - Lenken bygges fra `App__BaseUrl` i stedet for `location.origin`. Er variabelen feil satt, peker QR-en til feil domene.
- **Testdekning:** Svak. `pickups.spec.ts` åpner merkelappen, men den visuelle testen maskerer QR-en, og ingen test leser innholdet.
- **Avhenger av:** Ingen.

## Rekkefølge

Punkt 1–14 (funn 1–16) er gjennomført 2026-09-15 i commit på `opd`. Gjenstår: 15–17 (funn 17, 18 og 19).

- [x] 1. `@angular/forms` fjernes (funn 2)
- [x] 2. Slett `shell/empty.ts` (funn 8)
- [x] 3. Fjern ubrukte autorisasjonspolicyer (funn 3)
- [x] 4. Fjern `prettier` og `.prettierrc` (funn 10)
- [x] 5. CO₂-faktoren blir konstant i API og frontend (funn 1)
- [x] 6. JWT-innstillingene blir konstanter (funn 4)
- [x] 7. Fjern svarfeltene `pushDevices` og `companyPhone`, og oppdater `MessageTests` (funn 9)
- [x] 8. Filfelter, bildeparametre og `Pickup.Seq` i én runde (funn 5, 14, 13)
- [x] 9. Flytt `POST /api/support` inn i `Super.cs` (funn 6)
- [x] 10. `Caller.IsGuest` blir beregnet egenskap (funn 7)
- [x] 11. Flytt `PushPayload` inn i `Notifier` (funn 11)
- [x] 12. Del `MONTHS` fra `format.ts` (funn 12)
- [x] 13. `num()` bruker `toLocaleString('nb-NO')` (funn 16)
- [x] 14. Slå sammen e2e-hjelperne `devCode` og `mailLink` (funn 15)
- [ ] 15. Legg til gjest-test for SMS ved start, fullført og avvik, og innfør deretter `Notifier.Giver` (funn 17)
- [ ] 16. Legg til header-sjekk i e2e, og samle deretter nginx-headerne med `map` (funn 18)
- [ ] 17. Vurder QR fra API-et og fjern `qrcode`, etter en beslutning om merkelapp uten nett (funn 19)
