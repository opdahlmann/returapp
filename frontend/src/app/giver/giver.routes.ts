import { Routes } from '@angular/router';

export default [
  { path: 'home', data: { root: true }, loadComponent: () => import('./home').then((m) => m.GiverHome) },
  { path: 'list', data: { root: true, title: 'Mine hentinger' }, loadComponent: () => import('./list').then((m) => m.GiverList) },
  { path: 'msgs', data: { root: true, title: 'Meldinger' }, loadComponent: () => import('./msgs').then((m) => m.GiverMsgs) },
  { path: 'new', data: { title: 'Meld henting' }, loadComponent: () => import('./new').then((m) => m.GiverNew) },
  { path: '', pathMatch: 'full', redirectTo: 'home' },
] satisfies Routes;
