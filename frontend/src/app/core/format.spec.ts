import { co2, dayChips, initials, kg, longDate, num, phone, relDay, relTime } from './format';

const now = new Date(2026, 8, 11, 14, 32); // fredag 11. september 2026, som prototypen

describe('format', () => {
  it('kg og tonn som i designet', () => {
    expect(kg(720)).toBe('720 kg');
    expect(kg(1400)).toBe('1,4 t');
    expect(kg(1000)).toBe('1,0 t');
  });

  it('co2 og tall', () => {
    expect(co2(480)).toBe(432);
    expect(num(1284)).toBe('1 284');
  });

  it('relDay', () => {
    expect(relDay('2026-09-11', now)).toBe('I dag');
    expect(relDay('2026-09-12', now)).toBe('I morgen');
    expect(relDay('2026-09-16', now)).toBe('Ons 16. sep');
  });

  it('relTime', () => {
    expect(relTime(new Date(2026, 8, 11, 7, 52), now)).toBe('I dag, 07:52');
    expect(relTime(new Date(2026, 8, 10, 15, 2), now)).toBe('I går, 15:02');
    expect(relTime(new Date(2026, 8, 8, 13, 40), now)).toBe('Tir 8. sep, 13:40');
  });

  it('longDate og dag-chips', () => {
    expect(longDate(now)).toBe('Fredag 11. september');
    expect(dayChips(now).map((d) => d.label)).toEqual(['I dag', 'I morgen', 'Søn 13.', 'Man 14.', 'Tir 15.', 'Ons 16.']);
    expect(dayChips(now)[0].v).toBe('2026-09-11');
  });

  it('telefon og initialer', () => {
    expect(phone('+4791234567')).toBe('912 34 567');
    expect(initials('Demo Superbruker')).toBe('DS');
  });
});
