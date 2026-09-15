import { Component, inject } from '@angular/core';
import { Routes } from '@angular/router';
import { AuthStore } from '../core/auth.store';
import { Empty } from '../shell/empty';
import { ShellStore } from '../shell/shell.store';

@Component({ selector: 'ra-giver-home', host: { style: 'display:contents' }, template: '' })
class GiverHome {
  constructor() {
    const auth = inject(AuthStore);
    const user = auth.user();
    if (auth.isGuest() || !user) inject(ShellStore).header('Hei!', 'Meld henting uten konto');
    else inject(ShellStore).header(user.name ? 'Hei, ' + user.name.split(' ')[0] : 'Hei!', [user.org, user.postnr].filter(Boolean).join(' · '));
  }
}

export default [
  { path: 'home', data: { root: true }, component: GiverHome },
  { path: 'list', data: { root: true, title: 'Mine hentinger' }, component: Empty },
  { path: 'msgs', data: { root: true, title: 'Meldinger' }, component: Empty },
  { path: '', pathMatch: 'full', redirectTo: 'home' },
] satisfies Routes;
