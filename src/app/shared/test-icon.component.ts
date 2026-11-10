import { Component, input } from '@angular/core';

import { ComponentKey } from '../core/model/model-bundle.types';

/** Un trazo por instrumento de medición: balanza, caminata, dinamómetro, cronómetro y regla. */
@Component({
  selector: 'app-test-icon',
  template: `
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      @switch (kind()) {
        @case ('Y1') {
          <rect x="4" y="4" width="16" height="16" rx="3" />
          <path d="M8 11a4 4 0 0 1 8 0" />
          <path d="M12 11l1.8-2.4" />
        }
        @case ('Y2') {
          <path d="M3 19c2.5-7 5.5-7 8 0s5.5 5 8-9" />
          <circle cx="19" cy="6" r="1.6" />
        }
        @case ('Y3') {
          <path d="M4 16a8 8 0 1 1 16 0" />
          <path d="M12 16l4-5" />
          <path d="M4 19.5h16" />
        }
        @case ('Y4') {
          <circle cx="12" cy="13.5" r="7" />
          <path d="M12 13.5V9.5M9.5 3.5h5" />
        }
        @case ('Y5') {
          <rect x="3" y="9" width="18" height="6.5" rx="1.2" />
          <path d="M7 9v3M11 9v2M15 9v3M19 9v2" />
        }
      }
    </svg>
  `,
  styles: `
    :host {
      display: inline-flex;
      width: 1.5rem;
      height: 1.5rem;
    }
    svg {
      width: 100%;
      height: 100%;
    }
  `,
})
export class TestIconComponent {
  readonly kind = input.required<ComponentKey>();
}
