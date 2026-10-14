import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-perfil-page',
  imports: [RouterLink],
  template: `
    <main class="page">
      <a class="back-link" routerLink="/">← Inicio</a>
      <h1>Mi perfil físico</h1>
      <p class="muted">
        Aquí se ingresarán las medidas corporales y se mostrará el perfil de los cinco componentes:
        composición corporal, capacidad cardiorrespiratoria, fuerza muscular, resistencia muscular
        y flexibilidad.
      </p>
      <p class="notice" role="note">En construcción.</p>
    </main>
  `,
})
export class PerfilPage {}
