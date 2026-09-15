import { inject } from '@angular/core';
import { Routes } from '@angular/router';
import { AuthStore } from './core/auth.store';
import { authGuard, roleGuard } from './core/http';
import { ROLES } from './core/roles';
import { Shell } from './shell/shell';

export const routes: Routes = [
  { path: 'login', loadComponent: () => import('./auth/login').then((m) => m.Login) },
  { path: 'code', loadComponent: () => import('./auth/code').then((m) => m.Code) },
  { path: 'roles', canMatch: [authGuard], loadComponent: () => import('./auth/roles').then((m) => m.RolePicker) },
  { path: 'invite/:token', loadComponent: () => import('./auth/invite').then((m) => m.InvitePage) },
  { path: 'reset/:token', loadComponent: () => import('./auth/reset').then((m) => m.ResetPage) },
  {
    path: '',
    component: Shell,
    canMatch: [authGuard],
    children: [
      { path: 'g', canMatch: [roleGuard('giver')], loadChildren: () => import('./giver/giver.routes') },
      { path: 'd', canMatch: [roleGuard('driver')], loadChildren: () => import('./driver/driver.routes') },
      { path: 'a', canMatch: [roleGuard('admin')], loadChildren: () => import('./admin/admin.routes') },
      { path: 's', canMatch: [roleGuard('super')], loadChildren: () => import('./super/super.routes') },
      { path: 'p/:id', loadComponent: () => import('./pickup/detail').then((m) => m.PickupDetail) },
      { path: 'p/:id/label', data: { title: 'Merkelapp' }, loadComponent: () => import('./pickup/label').then((m) => m.PickupLabel) },
      { path: 'p/:id/receipt', data: { title: 'Kvittering' }, loadComponent: () => import('./pickup/receipt').then((m) => m.PickupReceipt) },
      { path: 'p/:id/complete', data: { title: 'Henting' }, loadComponent: () => import('./pickup/complete').then((m) => m.PickupComplete) },
      { path: 'p/:id/thread', data: { title: 'Meldinger' }, loadComponent: () => import('./shell/empty').then((m) => m.Empty) },
      { path: 'profile', data: { root: true, title: 'Profil' }, loadComponent: () => import('./profile/profile').then((m) => m.Profile) },
      { path: 'notifications', data: { title: 'Varsler' }, loadComponent: () => import('./notifications/notifications').then((m) => m.Notifications) },
      { path: '', pathMatch: 'full', redirectTo: () => ROLES[inject(AuthStore).role()].home },
    ],
  },
  { path: '**', redirectTo: '' },
];
