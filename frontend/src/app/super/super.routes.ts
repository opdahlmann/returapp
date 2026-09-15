import { Routes } from '@angular/router';

const s = () => import('./super');

export default [
  { path: 'dash', data: { root: true, title: 'Oversikt', sub: 'Returapp · alle firma' }, loadComponent: () => s().then((m) => m.SuperDash) },
  { path: 'orders', data: { root: true, title: 'Alle henteordre' }, loadComponent: () => s().then((m) => m.SuperOrders) },
  { path: 'admin', data: { root: true, title: 'Administrasjon' }, loadComponent: () => import('./admin-menu').then((m) => m.AdminMenu) },
  { path: 'companies', data: { title: 'Hentefirma' }, loadComponent: () => s().then((m) => m.SuperCompanies) },
  { path: 'companies/:id', data: { title: 'Hentefirma' }, loadComponent: () => s().then((m) => m.SuperCompanyDetail) },
  { path: 'users', data: { title: 'Brukere' }, loadComponent: () => s().then((m) => m.SuperUsers) },
  { path: 'cats', data: { title: 'Kategorier' }, loadComponent: () => import('./categories').then((m) => m.Categories) },
  { path: 'postnr', data: { title: 'Postnummer' }, loadComponent: () => import('./postnr').then((m) => m.SuperPostnr) },
  { path: 'notice', data: { title: 'Systemvarsel' }, loadComponent: () => s().then((m) => m.SuperNotice) },
  { path: 'support', data: { title: 'Support' }, loadComponent: () => s().then((m) => m.SuperSupport) },
  { path: '', pathMatch: 'full', redirectTo: 'dash' },
] satisfies Routes;
