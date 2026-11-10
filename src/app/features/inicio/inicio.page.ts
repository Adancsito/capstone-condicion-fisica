import { Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';

import { COMPONENT_INFO } from '../../core/model/component-info';
import { CloudService } from '../../core/cloud/cloud.service';
import { ModelBundleService } from '../../core/model/model-bundle.service';
import { DemoBannerComponent } from '../../shared/demo-banner.component';
import { InstallCardComponent } from '../../shared/install-card.component';
import { TestIconComponent } from '../../shared/test-icon.component';

@Component({
  selector: 'app-inicio-page',
  imports: [RouterLink, DemoBannerComponent, InstallCardComponent, TestIconComponent],
  template: `
    <app-demo-banner [isDemo]="bundles.isDemo()" />
    <main class="page">
      <header class="hero">
        <h1>Cinco pruebas físicas, estimadas con medidas de tu cuerpo</h1>
        <p class="lead">
          Con tu peso, tu talla y algunas circunferencias, la aplicación estima por separado tu grasa corporal, tu fuerza, tu resistencia, tu
          flexibilidad y tu capacidad al caminar. Si una estimación no es confiable, te lo dice y te pide la prueba directa.
        </p>
        <div class="tape" aria-hidden="true"></div>
        <div class="actions stretch">
          <a class="btn" routerLink="/perfil">Medir mi perfil</a>
          <a class="btn secondary" routerLink="/acerca">Cómo funciona</a>
        </div>
        @if (status(); as s) {
          <p class="muted status" role="status">{{ s }}</p>
        }
      </header>

      <app-install-card />

      <section aria-labelledby="que-estima">
        <h2 id="que-estima">Qué estima la aplicación</h2>
        <ul class="tests">
          @for (c of components(); track c.key) {
            <li>
              <span class="glyph"><app-test-icon [kind]="c.key" /></span>
              <div>
                <h3>{{ c.title }}</h3>
                <p class="muted">{{ c.directTest }}</p>
              </div>
              @if (c.ready !== null) {
                <span class="chip" [class.on]="c.ready">{{ c.ready ? 'Se estima' : 'Prueba directa' }}</span>
              }
            </li>
          }
        </ul>
        <p class="muted note">Cada resultado es independiente. No hay un puntaje total.</p>
      </section>

      @if (cloud.isInvestigator()) {
      <a class="card team" routerLink="/investigador">
        <span class="glyph alt">
          <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <rect x="5" y="4" width="14" height="17" rx="2.5" />
            <path d="M9 4.5h6M9 11h6M9 15h4" />
          </svg>
        </span>
        <div>
          <h2>Para el equipo de investigación</h2>
          <p class="muted">Registra sesiones de medición con consentimiento, seguridad y pruebas. Funciona sin conexión.</p>
        </div>
      </a>
      }
    </main>
  `,
  styles: `
    .hero {
      display: grid;
      gap: var(--space-4);
      padding-top: var(--space-3);
    }
    .hero h1,
    .hero p {
      margin: 0;
    }
    .hero h1 {
      max-width: 16ch;
      font-size: clamp(1.9rem, 8vw, 2.8rem);
    }
    /* Cinta de medir: la marca de la aplicación */
    .tape {
      height: 30px;
      margin: var(--space-1) 0;
      background:
        repeating-linear-gradient(to right, var(--color-scale) 0 1.5px, transparent 1.5px 12px) bottom / 100% 12px no-repeat,
        repeating-linear-gradient(to right, var(--color-primary) 0 2.5px, transparent 2.5px 60px) bottom / 100% 24px no-repeat;
      border-bottom: 2px solid var(--color-primary);
    }
    .status {
      font-size: 0.88rem;
    }
    h2 {
      margin-bottom: var(--space-3);
    }
    .tests {
      list-style: none;
      margin: 0;
      padding: 0 var(--space-4);
      background: var(--color-surface);
      border-radius: var(--radius-lg);
      box-shadow: var(--shadow-card);
    }
    .tests li {
      display: grid;
      grid-template-columns: auto 1fr auto;
      gap: var(--space-3);
      align-items: center;
      padding: var(--space-3) 0;
      border-bottom: 0.5px solid var(--color-border);
    }
    .tests li:last-child {
      border-bottom: 0;
    }
    .tests h3 {
      margin: 0;
      font-size: 1.05rem;
    }
    .tests p {
      margin: 0;
      font-size: 0.88rem;
    }
    .glyph {
      display: grid;
      place-items: center;
      width: 44px;
      height: 44px;
      border-radius: 14px;
      background: var(--glyph-bg);
      color: var(--glyph-fg);
    }
    .glyph.alt {
      background: var(--color-surface-alt);
      color: var(--color-text);
    }
    .note {
      margin-top: var(--space-3);
      font-size: 0.9rem;
    }
    .team {
      display: grid;
      grid-template-columns: auto 1fr;
      gap: var(--space-4);
      align-items: center;
    }
    .team h2 {
      margin: 0 0 var(--space-1);
      font-size: 1.3rem;
    }
    .team p {
      margin: 0;
    }
    @media (max-width: 559px) {
      .tests li {
        grid-template-columns: auto 1fr;
      }
      .tests .chip {
        grid-column: 2;
        justify-self: start;
      }
    }
  `,
})
export class InicioPage {
  protected readonly bundles = inject(ModelBundleService);
  protected readonly cloud = inject(CloudService);

  /** Los cinco componentes; si el paquete ya cargó, con la marca de cuáles se estiman y cuáles piden la prueba directa. */
  protected readonly components = computed(() => {
    const spec = this.bundles.bundle()?.components ?? [];
    return COMPONENT_INFO.map((c) => ({
      ...c,
      title: c.name.replace(/\s*\(.*\)\s*/, ''),
      ready: spec.length ? !!spec.find((s) => s.key === c.key)?.meetsCriteria : null,
    }));
  });

  protected readonly status = computed(() => {
    const b = this.bundles.bundle();
    if (!b) {
      return null;
    }
    const n = b.components.filter((c) => c.meetsCriteria).length;
    const base = b.manifest.isDemo ? 'Paquete de demostración' : `Modelos entrenados con ${b.manifest.trainedRows} participantes`;
    return `${base}. ${n} de 5 componentes se estiman; los demás piden la prueba directa.`;
  });

  constructor() {
    void this.bundles.load();
  }
}
