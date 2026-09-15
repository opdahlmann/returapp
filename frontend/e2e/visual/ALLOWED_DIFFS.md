# Kjente avvik mot prototypen

`visual.spec.ts` sammenligner hver skjerm i lys og mørk modus mot referansebildene i
`docs/design/screens/{rolle}/{skjerm}-{tema}.png`. Terskelen er **1 %** avvikende piksler
(pixelmatch-algoritmen: YIQ-avstand 0.1, antialiasing telles ikke). Alt som ikke kan være likt,
maskeres i `screens.ts` i stedet for å heve terskelen. Denne listen forklarer hvert avvik.

## Oppdatere referansebildene

Bare når designet (`docs/design/Returapp-standalone.html`) endres:

```bash
cd frontend
CAPTURE=1 npx playwright test --project reference
```

Referansen tas med to justeringer av prototypen, som beskrevet under «Prototypefeil».

## Rammen

| Avvik | Håndtering |
|---|---|
| Statuslinje (9:41, Dynamic Island), hjem-indikator og runde hjørner finnes bare i telefonrammen | `FRAME_MASKS` i `compare.ts` |

## Data som ikke kan være lik

| Avvik | Håndtering |
|---|---|
| Designet er låst til fredag 11. september 2026 og blander faste datoer («Tor 10. sep») med «I dag». Appen viser datoer ut fra dagens dato og bruker «I dag»/«I går» konsekvent | Maske på datotekster (`dates`). Demo-dataene settes tilbake med datoer fra i dag før testen (`POST /api/dev/reset-demo`) |
| Ekte bilder i stedet for bildeikon-plassholdere | Maske på `img` |
| Ekte QR-kode i stedet for designets pseudo-mønster | Maske på QR-en |
| Statistikk regnes fra historikken; designet har faste tall og stolper | Maske på tall og kategoriradene |
| Rutelengde regnes fra adressene («ca 15 km» i designet) | Maske på km-teksten |
| Dekningsområde og postnummer-oversikt bruker ekte postnummerregister (alle kommuner i fylket, faktiske antall); designet har et utvalg | Maske på kommunekortene og antall / fast område under søkefeltet |
| Designets demo-bruker har alle fire roller og ulike navn per rolle. Ingen testbruker har det | Rollevalg og profil: rollelisten byttes til alle fire i nettleseren (`allRoles`), navnet per rolle maskeres |
| Superbrukers «Ubehandlet»-liste står i dataenes rekkefølge i designet; appen viser nyeste først | Sammenlignes på «Uten firma» (én ordre i begge) |

## Bevisste tekstendringer

| Designet | Appen | Håndtering |
|---|---|---|
| «Demo: hvilken som helst kode fungerer» på kodeskjermen | Fjernet | Under terskel |
| «Prøv 4878 (Grimstad) for å se hvordan det ser ut uten dekning.» i postnummer-arket | «Vi bruker postnummeret til å finne hentefirma som dekker deg.» | Maske |
| «Returapp 2.0 · prototype» | «Returapp {versjon}» | Under terskel |
| Avdelinger: første kort «mottak av vinduer …», andre kort uten «mottak av» | Uten «mottak av» på alle kort | Under terskel |

## Prototypefeil som appen ikke kopierer

| Feil i prototypen | Appen | Referansebildet |
|---|---|---|
| Innholdsflatene er flex-kolonner med `overflow:auto`. Når innholdet er høyere enn skjermen, krymper barna under egen høyde: søkefelt blir 24 px, filterchips og bildestripen blir 0 px (usynlige) | `.ra-scroll`-regelen i `styles.css`: barn krymper aldri | Tas med samme regel injisert (`openPrototype`) |
| Scroll-posisjonen følger med til neste skjerm (kvitteringen åpnes halvveis nedscrollet) | Hver skjerm starter øverst | Scroll nullstilles før bildet tas |

## Utenfor testen

- iOS får 16 px i skjemafelt (designet: 15 px) for å unngå auto-zoom – gjelder bare Safari på iOS.
- Kontrast: innloggingens «eller»-skille (3,3:1) og `--mu` på `--sf2` i lys modus (4,3:1) er under 4,5:1 i designet og er ikke endret.
- Svakhet: endringer som bare rører noen få piksler (hjørneradius, fargenyanser under YIQ-terskelen) fanges ikke av 1 %-terskelen. Mellomrom og skriftstørrelse fanges (14 → 18 px gap gir over 1 %).
