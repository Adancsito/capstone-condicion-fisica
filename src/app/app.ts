import { Component, inject } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';

import { CloudService } from './core/cloud/cloud.service';
import { PwaService } from './core/pwa/pwa.service';
import { PwaBannerComponent } from './shared/pwa-banner.component';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, PwaBannerComponent],
  templateUrl: './app.html',
})
export class App {
  protected readonly cloud = inject(CloudService);

  constructor() {
    inject(PwaService); // empieza a escuchar la conexión, la instalación y las versiones nuevas
    // Se restaura la sesión guardada sin retrasar la primera pantalla.
    const idle = (globalThis as { requestIdleCallback?: (fn: () => void) => void }).requestIdleCallback;
    (idle ?? ((fn: () => void) => setTimeout(fn, 300)))(() => void this.cloud.start());
  }
}
