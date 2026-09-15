import { safePath } from './http';

describe('safePath', () => {
  it('fjerner token fra invitasjons- og reset-lenker', () => {
    expect(safePath('/invite/abc123-xyz')).toBe('/invite/…');
    expect(safePath('/reset/abc123')).toBe('/reset/…');
    expect(safePath('/p/R-2041')).toBe('/p/R-2041');
  });
});
