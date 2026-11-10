import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-acerca-page',
  imports: [RouterLink],
  template: `
    <main class="page">
      <a class="back-link" routerLink="/">← Inicio</a>
      <h1>Acerca del estudio</h1>
      <p class="lead">
        Capstone de la UPN sobre cuánto permiten estimar las medidas corporales cinco resultados físicos. La metodología de desarrollo de los modelos es CRISP-DM.
      </p>

      <section class="card" aria-labelledby="alcance">
        <h2 id="alcance">Alcance</h2>
        <ul>
          <li>Muestra planificada: 100 adultos de 18 a 40 años.</li>
          <li>Recolección en gimnasios de Lima.</li>
          <li>Cinco componentes evaluados por separado, sin puntaje total.</li>
        </ul>
      </section>

      <section class="card" aria-labelledby="resultados">
        <h2 id="resultados">Cómo se muestran los resultados</h2>
        <p>
          Cada componente tiene su propio modelo. Se muestra el valor en la unidad de su prueba solo si el modelo superó a una línea de base al validarlo en
          personas no vistas. En cualquier otro caso, o si tus medidas están fuera del rango con que se entrenó, la aplicación indica «Requiere prueba directa».
          No hay puntaje total.
        </p>
      </section>

      <section class="card" aria-labelledby="limites">
        <h2 id="limites">Límites</h2>
        <p>Los resultados no representan a toda la población peruana. La aplicación no constituye un diagnóstico médico.</p>
      </section>
    </main>
  `,
  styles: `
    ul {
      margin: 0;
      padding-left: var(--space-5);
      display: grid;
      gap: var(--space-2);
    }
  `,
})
export class AcercaPage {}
