import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { CanActivateFn, Router, UrlTree, provideRouter } from '@angular/router';

import { CloudService } from '../cloud/cloud.service';
import { FakeCloud } from '../cloud/fake-cloud';
import { authGuard, investigatorGuard } from './guards';

describe('Rutas protegidas', () => {
  let cloud: FakeCloud;
  let router: Router;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection(), provideRouter([]), { provide: CloudService, useClass: FakeCloud }] });
    cloud = TestBed.inject(CloudService) as unknown as FakeCloud;
    router = TestBed.inject(Router);
  });

  const run = (guard: CanActivateFn, url: string) =>
    TestBed.runInInjectionContext(() => guard({} as never, { url } as never)) as Promise<boolean | UrlTree>;

  it('sin sesión, Cuenta y Investigador mandan a Ingresar y recuerdan a dónde volver', async () => {
    for (const guard of [authGuard, investigatorGuard]) {
      const r = (await run(guard, '/investigador')) as UrlTree;
      expect(router.serializeUrl(r)).toBe('/ingresar?volver=%2Finvestigador');
    }
  });

  it('con sesión pero sin aprobar, Investigador manda a la pantalla de solicitud', async () => {
    cloud.login(false);
    expect(await run(authGuard, '/cuenta')).toBeTrue();
    const r = (await run(investigatorGuard, '/investigador')) as UrlTree;
    expect(router.serializeUrl(r)).toBe('/cuenta/investigador');
  });

  it('la cuenta aprobada a mano entra al modo Investigador', async () => {
    cloud.login(true);
    expect(await run(investigatorGuard, '/investigador')).toBeTrue();
  });
});
