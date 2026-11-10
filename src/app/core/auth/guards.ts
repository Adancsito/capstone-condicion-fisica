import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';

import { CloudService } from '../cloud/cloud.service';

/** Solo entra quien inició sesión; si no, va a Ingresar y vuelve aquí al terminar. */
export const authGuard: CanActivateFn = async (_route, state) => {
  const cloud = inject(CloudService);
  const router = inject(Router);
  await cloud.settled();
  return cloud.user() ? true : router.createUrlTree(['/ingresar'], { queryParams: { volver: state.url } });
};

/**
 * Solo entra una cuenta que el equipo agregó a mano como investigadora en Firebase. Sin sesión va a Ingresar; con sesión pero sin
 * permiso, a la pantalla donde se solicita.
 */
export const investigatorGuard: CanActivateFn = async (_route, state) => {
  const cloud = inject(CloudService);
  const router = inject(Router);
  await cloud.settled();
  if (!cloud.user()) {
    return router.createUrlTree(['/ingresar'], { queryParams: { volver: state.url } });
  }
  return cloud.isInvestigator() ? true : router.createUrlTree(['/cuenta/investigador']);
};
