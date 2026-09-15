import { Routes } from '@angular/router';

export default [
  { path: 'inbox', data: { root: true, title: 'Innboks' }, loadComponent: () => import('./inbox').then((m) => m.AdminInbox) },
  { path: 'routes', data: { root: true, title: 'Ruteplan' }, loadComponent: () => import('./routes').then((m) => m.AdminRoutes) },
  { path: 'company', data: { root: true, title: 'Firma' }, loadComponent: () => import('./company').then((m) => m.AdminCompany) },
  { path: 'drivers', data: { title: 'Sjåfører' }, loadComponent: () => import('./company').then((m) => m.AdminDrivers) },
  { path: 'depts', data: { title: 'Avdelinger' }, loadComponent: () => import('./company').then((m) => m.AdminDepts) },
  { path: 'stats', data: { title: 'Statistikk' }, loadComponent: () => import('./company').then((m) => m.AdminStats) },
  { path: 'coverage', data: { title: 'Dekningsområde' }, loadComponent: () => import('./coverage').then((m) => m.CoverageArea) },
  { path: '', pathMatch: 'full', redirectTo: 'inbox' },
] satisfies Routes;
