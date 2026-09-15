import { Me, nextAfterLogin, rolesOf } from './auth.store';

const user = (roles: Partial<Me['roles']>) => ({ roles: { giver: false, driver: false, admin: false, super: false, ...roles } }) as Me;

describe('rolle-valg etter innlogging', () => {
  it('én rolle går rett til rollens første fane', () => {
    expect(nextAfterLogin(user({ admin: true }))).toBe('/a/inbox');
    expect(nextAfterLogin(user({ driver: true }))).toBe('/d/today');
  });

  it('flere roller viser "Hvem er du i dag?"', () => {
    expect(nextAfterLogin(user({ giver: true, super: true }))).toBe('/roles');
  });

  it('roller i fast rekkefølge', () => {
    expect(rolesOf(user({ super: true, giver: true, driver: true }))).toEqual(['giver', 'driver', 'super']);
  });
});
