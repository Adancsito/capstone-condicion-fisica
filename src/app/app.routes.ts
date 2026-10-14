import { Routes } from '@angular/router';

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
    path: 'investigador',
    title: 'Acceso investigador',
    loadComponent: () =>
      import('./features/investigador/investigador.page').then((m) => m.InvestigadorPage),
  },
  {
    path: 'acerca',
    title: 'Acerca del estudio',
    loadComponent: () => import('./features/acerca/acerca.page').then((m) => m.AcercaPage),
  },
  { path: '**', redirectTo: '' },
];
