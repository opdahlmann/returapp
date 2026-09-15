import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { ErrorHandler, inject, Injectable, isDevMode } from '@angular/core';
import { CanMatchFn, Router } from '@angular/router';
import { catchError, from, switchMap, throwError } from 'rxjs';
import { AuthStore } from './auth.store';
import { Role } from './roles';

export const APP_VERSION = '1.0.0';

/** Stien uten hemmelige token (invitasjons- og reset-lenker). */
export const safePath = (path: string) => path.replace(/\/(invite|reset)\/.*/, '/$1/…');

/** Uventede feil logges i konsollen og sendes til API-loggen (maks 5 per sidevisning). Token i invitasjons-/reset-lenker fjernes. */
@Injectable()
export class ClientErrorHandler implements ErrorHandler {
  private sent = 0;

  handleError(error: unknown) {
    console.error(error);
    if (isDevMode() || this.sent++ >= 5) return;
    const message = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
    fetch('/api/client-errors', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message: message.slice(0, 500), url: safePath(location.pathname), version: APP_VERSION }), keepalive: true }).catch(() => {});
  }
}

/** Bearer på /api-kall. 401 → refresh én gang → prøv igjen → ellers logg ut. */
export const tokenInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(AuthStore);
  const router = inject(Router);
  if (!req.url.startsWith('/api/')) return next(req);
  const withToken = (token: string | null) => (token ? req.clone({ setHeaders: { Authorization: `Bearer ${token}` } }) : req);

  return next(withToken(auth.accessToken())).pipe(
    catchError((err: HttpErrorResponse) => {
      if (err.status !== 401 || req.url.startsWith('/api/auth/') || !auth.accessToken()) return throwError(() => err);
      return from(auth.refresh()).pipe(
        switchMap((token) => {
          if (token) return next(withToken(token));
          auth.logout();
          router.navigate(['/login'], { queryParams: { returnUrl: router.url } });
          return throwError(() => err);
        }),
      );
    }),
  );
};

/** Innlogget bruker eller gjest. */
export const authGuard: CanMatchFn = (_route, segments) => {
  const auth = inject(AuthStore);
  if (auth.isLoggedIn()) return true;
  const returnUrl = '/' + segments.map((s) => s.path).join('/');
  return inject(Router).createUrlTree(['/login'], { queryParams: returnUrl !== '/' ? { returnUrl } : {} });
};

/** Rolle-område: brukeren må ha rollen; aktiv rolle følger URL-en (dype lenker). */
export const roleGuard =
  (role: Role): CanMatchFn =>
  () => {
    const auth = inject(AuthStore);
    if (!auth.roles().includes(role)) return inject(Router).createUrlTree(['/']);
    auth.setRole(role);
    return true;
  };
