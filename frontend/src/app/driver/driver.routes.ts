import { Routes } from '@angular/router';

export default [
  { path: 'today', data: { root: true, title: 'I dag' }, loadComponent: () => import('./driver').then((m) => m.DriverToday) },
  { path: 'market', data: { root: true, title: 'Oppdragsbørs' }, loadComponent: () => import('./driver').then((m) => m.DriverMarket) },
  { path: 'route', data: { root: true, title: 'Rute' }, loadComponent: () => import('./driver').then((m) => m.DriverRoute) },
  { path: '', pathMatch: 'full', redirectTo: 'today' },
] satisfies Routes;
