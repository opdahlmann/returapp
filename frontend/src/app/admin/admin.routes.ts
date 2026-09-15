import { Component, inject } from '@angular/core';
import { Routes } from '@angular/router';
import { AuthStore } from '../core/auth.store';
import { Empty } from '../shell/empty';
import { ShellStore } from '../shell/shell.store';

@Component({ selector: 'ra-admin-company', host: { style: 'display:contents' }, template: '' })
class AdminCompany {
  constructor() {
    inject(ShellStore).header(inject(AuthStore).user()?.company?.name ?? 'Firma');
  }
}

export default [
  { path: 'inbox', data: { root: true, title: 'Innboks' }, component: Empty },
  { path: 'routes', data: { root: true, title: 'Ruteplan' }, component: Empty },
  { path: 'company', data: { root: true }, component: AdminCompany },
  { path: 'coverage', data: { title: 'Dekningsområde' }, loadComponent: () => import('./coverage').then((m) => m.CoverageArea) },
  { path: '', pathMatch: 'full', redirectTo: 'inbox' },
] satisfies Routes;
