import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { CanMatchFn, Router } from '@angular/router';
import { catchError, from, switchMap, throwError } from 'rxjs';
import { AuthStore } from './auth.store';
import { Role } from './roles';

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
