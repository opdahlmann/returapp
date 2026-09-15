import { Routes } from '@angular/router';
import { longDate } from '../core/format';
import { Empty } from '../shell/empty';

export default [
  { path: 'today', data: { root: true, title: 'I dag', sub: longDate() }, component: Empty },
  { path: 'market', data: { root: true, title: 'Oppdragsbørs' }, component: Empty },
  { path: 'route', data: { root: true, title: 'Rute' }, component: Empty },
  { path: '', pathMatch: 'full', redirectTo: 'today' },
] satisfies Routes;
