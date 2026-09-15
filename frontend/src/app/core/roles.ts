export type Role = 'giver' | 'driver' | 'admin' | 'super';
export const ROLE_ORDER: Role[] = ['giver', 'driver', 'admin', 'super'];

// Tekster og ikoner som i prototypen (Component.ROLE / TABS).
export const ROLES: Record<Role, { l: string; d: string; icon: string; home: string }> = {
  giver: { l: 'Byggeplass / giver', d: 'Meld inn ting som kan gjenbrukes, følg hentingen', icon: 'home', home: '/g/home' },
  driver: { l: 'Sjåfør', d: 'Dagens rute, henting og kvittering', icon: 'truck', home: '/d/today' },
  admin: { l: 'Retur-admin', d: 'Fordel oppdrag, planlegg ruter, dekningsområde', icon: 'building', home: '/a/inbox' },
  super: { l: 'Superbruker', d: 'Drift av Returapp: firma, brukere, kategorier', icon: 'star', home: '/s/dash' },
};

export interface Tab { path: string; l: string; i: string; badge?: string }

export const TABS: Record<Role, Tab[]> = {
  giver: [{ path: '/g/home', l: 'Hjem', i: 'home' }, { path: '/g/list', l: 'Hentinger', i: 'box' }, { path: '/g/msgs', l: 'Meldinger', i: 'chat', badge: 'msgs' }, { path: '/profile', l: 'Profil', i: 'user' }],
  driver: [{ path: '/d/today', l: 'I dag', i: 'truck' }, { path: '/d/market', l: 'Børs', i: 'tag', badge: 'market' }, { path: '/d/route', l: 'Rute', i: 'route' }, { path: '/profile', l: 'Profil', i: 'user' }],
  admin: [{ path: '/a/inbox', l: 'Innboks', i: 'inbox', badge: 'inbox' }, { path: '/a/routes', l: 'Ruter', i: 'route' }, { path: '/a/company', l: 'Firma', i: 'building' }, { path: '/profile', l: 'Profil', i: 'user' }],
  super: [{ path: '/s/dash', l: 'Oversikt', i: 'grid' }, { path: '/s/orders', l: 'Ordre', i: 'inbox' }, { path: '/s/admin', l: 'Admin', i: 'layers' }, { path: '/profile', l: 'Profil', i: 'user' }],
};

export type Status = 'ny' | 'tildelt' | 'planlagt' | 'underveis' | 'hentet' | 'avvik' | 'avbrutt';

// [etikett, bakgrunn, tekstfarge] som prototypens STATUS.
export const STATUS: Record<Status, [string, string, string]> = {
  ny: ['Mottatt', 'var(--info-bg)', 'var(--info)'],
  tildelt: ['Tildelt', 'var(--warn-bg)', 'var(--warn)'],
  planlagt: ['Planlagt', 'var(--tint)', 'var(--tint-tx)'],
  underveis: ['Under henting', 'var(--tint)', 'var(--tint-tx)'],
  hentet: ['Hentet', 'var(--pri)', 'var(--pri-tx)'],
  avvik: ['Avvik', 'var(--dan-bg)', 'var(--dan)'],
  avbrutt: ['Avbrutt', 'var(--sf2)', 'var(--mu)'],
};
