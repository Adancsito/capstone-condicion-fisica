import { Routes } from '@angular/router';

export const INVESTIGADOR_ROUTES: Routes = [
  {
    path: '',
    title: 'Sesiones de medición',
    loadComponent: () => import('./investigador.page').then((m) => m.InvestigadorPage),
  },
  {
    path: 'sesion/:id',
    title: 'Sesión de medición',
    loadComponent: () => import('./sesion.page').then((m) => m.SesionPage),
  },
];
