import { Routes } from '@angular/router';
import { Empty } from '../shell/empty';

export default [
  { path: 'dash', data: { root: true, title: 'Oversikt', sub: 'Returapp · alle firma' }, component: Empty },
  { path: 'orders', data: { root: true, title: 'Alle henteordre' }, component: Empty },
  { path: 'admin', data: { root: true, title: 'Administrasjon' }, loadComponent: () => import('./admin-menu').then((m) => m.AdminMenu) },
  { path: 'cats', data: { title: 'Kategorier' }, loadComponent: () => import('./categories').then((m) => m.Categories) },
  { path: 'postnr', data: { title: 'Postnummer' }, loadComponent: () => import('./postnr').then((m) => m.SuperPostnr) },
  { path: 'companies', data: { title: 'Hentefirma' }, component: Empty },
  { path: 'users', data: { title: 'Brukere' }, component: Empty },
  { path: 'notice', data: { title: 'Systemvarsel' }, component: Empty },
  { path: 'support', data: { title: 'Support' }, component: Empty },
  { path: '', pathMatch: 'full', redirectTo: 'dash' },
] satisfies Routes;
