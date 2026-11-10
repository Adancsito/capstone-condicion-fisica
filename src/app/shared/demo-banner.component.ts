import { Component, input } from '@angular/core';

/** Franja fija que rotula toda pantalla que muestre valores de un paquete de demostración. */
@Component({
  selector: 'app-demo-banner',
  template: `
    @if (isDemo()) {
      <p class="demo-banner" role="status">
        DEMOSTRACIÓN: valores ilustrativos, no provienen del estudio.
      </p>
    }
  `,
})
export class DemoBannerComponent {
  readonly isDemo = input.required<boolean>();
}
