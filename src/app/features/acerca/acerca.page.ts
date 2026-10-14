import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-acerca-page',
  imports: [RouterLink],
  template: `
    <main class="page">
      <a class="back-link" routerLink="/">← Inicio</a>
      <h1>Acerca del estudio</h1>
      <p>
        Capstone de la UPN sobre cuánto permiten estimar las medidas corporales cinco resultados
        físicos. La metodología de desarrollo de los modelos es CRISP-DM.
      </p>
      <h2>Alcance</h2>
      <ul>
        <li>Muestra planificada: 100 adultos de 18 a 40 años.</li>
        <li>Recolección en gimnasios de Lima.</li>
        <li>Cinco componentes evaluados por separado, sin puntaje total.</li>
      </ul>
      <h2>Límites</h2>
      <p>
        Los resultados no representan a toda la población peruana. La aplicación no constituye un
        diagnóstico médico.
      </p>
    </main>
  `,
})
export class AcercaPage {}
