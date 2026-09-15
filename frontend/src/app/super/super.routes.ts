import { Routes } from '@angular/router';
import { Empty } from '../shell/empty';

export default [
  { path: 'dash', data: { root: true, title: 'Oversikt', sub: 'Returapp · alle firma' }, component: Empty },
  { path: 'orders', data: { root: true, title: 'Alle henteordre' }, component: Empty },
  { path: 'admin', data: { root: true, title: 'Administrasjon' }, component: Empty },
  { path: '', pathMatch: 'full', redirectTo: 'dash' },
] satisfies Routes;
