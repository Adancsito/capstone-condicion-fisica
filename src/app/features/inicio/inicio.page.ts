import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-inicio-page',
  imports: [RouterLink],
  template: `
    <main class="page">
      <h1>Estimación multicomponente de la condición física</h1>
      <p class="muted">Capstone UPN · medidas corporales y cinco resultados físicos.</p>

      <p class="notice" role="note">
        Versión de desarrollo. Todavía no hay modelos entrenados ni datos del estudio.
      </p>

      <nav class="modes" aria-label="Modos de la aplicación">
        <a class="card" routerLink="/perfil">
          <h2>Mi perfil físico</h2>
          <p class="muted">Ingresa tus medidas corporales y consulta el perfil de los cinco componentes.</p>
        </a>
        <a class="card" routerLink="/investigador">
          <h2>Acceso investigador</h2>
          <p class="muted">Registro de sesiones de medición con consentimiento y pruebas físicas.</p>
        </a>
      </nav>

      <p><a routerLink="/acerca">Acerca del estudio</a></p>
    </main>
  `,
  styles: `
    .modes {
      display: grid;
      gap: var(--space-4);
      margin: var(--space-5) 0;
    }
    .card h2 {
      margin-bottom: var(--space-2);
    }
    .card p {
      margin: 0;
    }
  `,
})
export class InicioPage {}
