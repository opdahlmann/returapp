import { wizardError } from '../giver/new';
import { Pickup, timeline, when } from './pickups';

const now = new Date(2026, 8, 11, 14, 32);
const base = (over: Partial<Pickup>): Pickup =>
  ({ status: 'ny', day: null, slot: null, companyName: 'Ombruksfabrikken AS', createdAt: new Date(2026, 8, 10, 8, 14).toISOString(), statusLog: [], pickedAt: null, deviation: null, cancelledAt: null, ...over }) as Pickup;

describe('when', () => {
  it('som prototypen', () => {
    expect(when(base({ day: '2026-09-16', slot: '09–12' }), now)).toBe('Ons 16. sep · 09–12');
    expect(when(base({ slot: '07–15' }), now)).toBe('Fleksibel · 07–15');
    expect(when(base({ status: 'tildelt' }), now)).toBe('Ikke avtalt');
  });
});

describe('timeline', () => {
  it('planlagt: tre første steg gjort, hentet grå', () => {
    const rows = timeline(base({ status: 'planlagt', day: '2026-09-16', slot: '09–12' }), now);
    expect(rows.map((r) => r.label)).toEqual(['Mottatt', 'Tildelt Ombruksfabrikken AS', 'Planlagt Ons 16. sep · 09–12', 'Hentet']);
    expect(rows.map((r) => r.dot)).toEqual(['var(--pri)', 'var(--pri)', 'var(--pri)', 'var(--bd)']);
    expect(rows[0].time).toBe('I går, 08:14');
  });

  it('avvik legges til i rødt, og steg nådd før avvik vises som gjort', () => {
    const rows = timeline(base({ status: 'avvik', statusLog: [{ status: 'ny', at: '', byUserId: null }, { status: 'planlagt', at: '', byUserId: null }], deviation: { reason: 'Varen var ødelagt', note: 'Knust', at: '' } }), now);
    expect(rows.at(-1)).toEqual({ label: 'Avvik: Varen var ødelagt', time: 'Knust', dot: 'var(--dan)', fg: 'var(--dan)' });
    expect(rows[2].dot).toBe('var(--pri)');
  });

  it('avbrutt erstatter alt', () => {
    expect(timeline(base({ status: 'avbrutt' }), now).map((r) => r.label)).toEqual(['Avbrutt av giver']);
  });
});

describe('wizard-validering', () => {
  const ok = { qty: '24', address: 'Tangen 8', postnr: '4608', guest: false, contactName: '', contactPhone: '' };
  it('steg 3 krever mengde', () => {
    expect(wizardError(3, { ...ok, qty: '' })).toBe('Oppgi antall / mengde');
    expect(wizardError(3, { ...ok, qty: '12,5' })).toBeNull();
  });
  it('steg 4 krever adresse og 4-sifret postnr, gjest også navn og mobil', () => {
    expect(wizardError(4, { ...ok, postnr: '460' })).toBe('Adresse og postnummer må fylles ut');
    expect(wizardError(4, { ...ok, guest: true })).toBe('Skriv inn navn og mobilnummer');
    expect(wizardError(4, { ...ok, guest: true, contactName: 'Per', contactPhone: '912 34 567' })).toBeNull();
  });
});
