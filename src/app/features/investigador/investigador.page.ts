import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-investigador-page',
  imports: [RouterLink],
  template: `
    <main class="page">
      <a class="back-link" routerLink="/">← Inicio</a>
      <h1>Acceso investigador</h1>
      <p class="muted">
        Aquí se registrarán las sesiones de medición: consentimiento, tamizaje, antropometría y
        pruebas físicas de referencia.
      </p>
      <p class="notice" role="note">En construcción.</p>
    </main>
  `,
})
export class InvestigadorPage {}
