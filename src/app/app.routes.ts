import { Routes } from '@angular/router';

import { authGuard, investigatorGuard } from './core/auth/guards';

export const routes: Routes = [
  {
    path: '',
    pathMatch: 'full',
    title: 'Inicio',
    loadComponent: () => import('./features/inicio/inicio.page').then((m) => m.InicioPage),
  },
  {
    path: 'perfil',
    title: 'Mi perfil físico',
    loadComponent: () => import('./features/perfil/perfil.page').then((m) => m.PerfilPage),
  },
  {
    path: 'ingresar',
    title: 'Ingresar',
    data: { modo: 'ingresar' },
    loadComponent: () => import('./features/auth/auth.page').then((m) => m.AuthPage),
  },
  {
    path: 'registro',
    title: 'Crear cuenta',
    data: { modo: 'registro' },
    loadComponent: () => import('./features/auth/auth.page').then((m) => m.AuthPage),
  },
  {
    path: 'investigador',
    title: 'Acceso investigador',
    canActivate: [investigatorGuard],
    loadChildren: () =>
      import('./features/investigador/investigador.routes').then((m) => m.INVESTIGADOR_ROUTES),
  },
  {
    path: 'cuenta',
    canActivate: [authGuard],
    children: [
      { path: '', title: 'Cuenta', loadComponent: () => import('./features/cuenta/cuenta.page').then((m) => m.CuentaPage) },
      { path: 'investigador', title: 'Modo Investigador', loadComponent: () => import('./features/cuenta/solicitud.page').then((m) => m.SolicitudPage) },
    ],
  },
  {
    path: 'acerca',
    title: 'Acerca del estudio',
    loadComponent: () => import('./features/acerca/acerca.page').then((m) => m.AcercaPage),
  },
  { path: '**', redirectTo: '' },
];
