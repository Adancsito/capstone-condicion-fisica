import { DatePipe } from '@angular/common';
import { Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { Router, RouterLink } from '@angular/router';

import { CloudService } from '../../core/cloud/cloud.service';
import { sessionsToCsv, sessionsToJson } from '../../core/protocol/csv';
import { ProtocolService } from '../../core/protocol/protocol.service';
import { SessionRecord, SessionStatus } from '../../core/protocol/protocol.types';
import { PwaService } from '../../core/pwa/pwa.service';
import { FileExportService } from '../../core/storage/file-export.service';
import { parseBackup } from '../../core/storage/session-merge';
import { SessionStoreService } from '../../core/storage/session-store.service';

const STATUS_LABEL: Record<SessionStatus, string> = {
  borrador: 'En curso',
  completa: 'Completa',
  no_continua: 'No continúa',
};

/** Lista de sesiones del modo Investigador, con el avance hacia los 100 participantes, la nube y la exportación. */
@Component({
  selector: 'app-investigador-page',
  imports: [RouterLink, DatePipe],
  template: `
    <main class="page">
      <a class="back-link" routerLink="/">← Inicio</a>

      <header class="page-head">
        <h1>Sesiones de medición</h1>
        <a class="btn" routerLink="sesion/nueva">+ Nueva sesión</a>
      </header>

      <p class="notice info" role="note">
        Los registros se guardan primero en este dispositivo y funcionan sin conexión. Exporta una copia al terminar cada jornada.
        @if (cloud.configured) {
          Con tu cuenta de investigador se respaldan además en la nube, solo para ti.
        }
      </p>

      @if (protocols.failed()) {
        <p class="notice error" role="alert">No se pudo cargar el protocolo de captura.</p>
      }

      <section class="card" aria-label="Avance">
        <div class="progress-head">
          <p class="count"><strong>{{ completas() }}</strong> de 100 sesiones completas</p>
          <span class="pct">{{ completas() }} %</span>
        </div>
        <progress max="100" [value]="completas()" aria-label="Avance hacia 100 participantes"></progress>
        <dl class="stats">
          <div>
            <dt>Completas</dt>
            <dd>{{ completas() }}</dd>
          </div>
          <div>
            <dt>En curso</dt>
            <dd>{{ enCurso() }}</dd>
          </div>
          <div>
            <dt>No continúan</dt>
            <dd>{{ noContinua() }}</dd>
          </div>
        </dl>
      </section>

      @if (cloud.configured) {
        @if (cloud.user(); as u) {
          <section class="card cloud" aria-label="Nube">
            <div class="cloud-head">
              <h2>Nube (Firebase)</h2>
              <span class="chip on">Conectado</span>
            </div>
            <p class="muted">
              Sesión de {{ u.name || u.email }}. Tus sesiones se sincronizan solas al abrir esta pantalla y al volver la conexión; también
              puedes hacerlo a mano.
            </p>
            <div class="actions">
              <button type="button" class="btn" (click)="sync()" [disabled]="cloud.busy()">
                {{ cloud.busy() ? 'Sincronizando…' : 'Sincronizar ahora' }}
              </button>
              <button type="button" class="btn secondary" (click)="cloud.signOut()" [disabled]="cloud.busy()">Cerrar sesión</button>
            </div>
            @if (cloud.message()) {
              <p class="notice info" role="status">{{ cloud.message() }}</p>
            }
            @if (cloud.error()) {
              <p class="notice error" role="alert">{{ cloud.error() }}</p>
            }
          </section>
        }
      }

      <section class="tools" aria-label="Exportar e importar">
        <button type="button" class="btn secondary" (click)="exportCsv()" [disabled]="store.sessions().length === 0">Exportar CSV</button>
        <button type="button" class="btn secondary" (click)="exportJson()" [disabled]="store.sessions().length === 0">Respaldo JSON</button>
        <label class="btn secondary file" for="import-file">Importar respaldo</label>
        <input id="import-file" class="visually-hidden" type="file" accept="application/json,.json" (change)="importFile($event)" />
      </section>
      @if (importNote()) {
        <p class="notice info" role="status">{{ importNote() }}</p>
      }

      @if (store.sessions().length === 0) {
        <p class="empty">Todavía no hay sesiones registradas. Crea una con «Nueva sesión» o importa un respaldo.</p>
      } @else {
        <ul class="list" aria-label="Sesiones registradas">
          @for (s of store.sessions(); track s.id) {
            <li class="card row">
              <a [routerLink]="['sesion', s.id]" class="rowlink">
                <strong class="code">{{ s.id }}</strong>
                <span class="muted when">{{ s.updatedAt | date: 'd MMM, HH:mm' }}</span>
                <span class="badge" [class.ok]="s.status === 'completa'" [class.warn]="s.status !== 'completa'">{{ label(s) }}</span>
              </a>
              <button type="button" class="btn danger small" (click)="remove(s)" [attr.aria-label]="'Borrar ' + s.id">Borrar</button>
            </li>
          }
        </ul>
      }
    </main>
  `,
  styles: `
    .progress-head {
      display: flex;
      align-items: baseline;
      justify-content: space-between;
      gap: var(--space-3);
      margin-bottom: var(--space-3);
    }
    .count {
      margin: 0;
      font-size: 1.1rem;
    }
    .pct {
      color: var(--color-text-muted);
      font-weight: 600;
    }
    .stats {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: var(--space-3);
      margin: var(--space-4) 0 0;
    }
    .stats > div {
      background: var(--color-surface-alt);
      border-radius: var(--radius-md);
      padding: var(--space-3);
      text-align: center;
    }
    .stats dt {
      font-size: 0.78rem;
      color: var(--color-text-muted);
    }
    .stats dd {
      margin: 2px 0 0;
      font-size: 1.5rem;
      font-weight: 700;
    }
    .cloud {
      display: grid;
      gap: var(--space-4);
    }
    .cloud > * {
      margin: 0;
    }
    .cloud-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: var(--space-3);
    }
    .cloud-head h2 {
      margin: 0;
      font-size: 1.1rem;
    }
    .tools {
      display: flex;
      flex-wrap: wrap;
      gap: var(--space-3);
    }
    .file {
      cursor: pointer;
    }
    .empty {
      text-align: center;
      color: var(--color-text-muted);
      padding: var(--space-5) var(--space-4);
      border: 1.5px dashed var(--color-border);
      border-radius: var(--radius-lg);
      margin: 0;
    }
    .list {
      list-style: none;
      padding: 0;
      margin: 0;
      display: grid;
      gap: var(--space-3);
    }
    .row {
      display: flex;
      align-items: center;
      gap: var(--space-3);
      padding: var(--space-3) var(--space-4);
    }
    .rowlink {
      flex: 1;
      min-width: 0;
      display: flex;
      align-items: center;
      gap: var(--space-3);
      flex-wrap: wrap;
      color: inherit;
      text-decoration: none;
      min-height: 44px;
    }
    .code {
      font-size: 1.05rem;
    }
    .when {
      font-size: 0.85rem;
    }
  `,
})
export class InvestigadorPage {
  protected readonly store = inject(SessionStoreService);
  protected readonly protocols = inject(ProtocolService);
  private readonly files = inject(FileExportService);
  protected readonly cloud = inject(CloudService);
  private readonly pwa = inject(PwaService);
  private readonly router = inject(Router);
  protected readonly importNote = signal('');

  protected readonly completas = computed(() => this.store.sessions().filter((s) => s.status === 'completa').length);
  protected readonly enCurso = computed(() => this.store.sessions().filter((s) => s.status === 'borrador').length);
  protected readonly noContinua = computed(() => this.store.sessions().filter((s) => s.status === 'no_continua').length);

  constructor() {
    void this.protocols.load();
    void this.cloud.start();
    // Con la sesión iniciada, las sesiones se sincronizan al abrir la pantalla y cada vez que vuelve la conexión.
    effect(() => {
      // al cerrar la sesión, este modo deja de estar disponible
      if (this.cloud.ready() && !this.cloud.user()) {
        void this.router.navigateByUrl('/ingresar');
      }
    });
    effect(() => {
      if (this.cloud.user() && this.pwa.online()) {
        untracked(() => void this.sync(true));
      }
    });
  }

  protected async sync(quiet = false): Promise<void> {
    if (this.cloud.busy()) {
      return;
    }
    const result = await this.cloud.sync(this.store.sessions(), quiet);
    if (result && result.downloaded > 0) {
      this.store.replaceAll(result.merged);
    }
  }

  protected async importFile(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) {
      return;
    }
    const { records, skipped } = parseBackup(await file.text());
    if (records.length) {
      this.store.upsertMany(records);
    }
    this.importNote.set(
      records.length
        ? `Se importaron ${records.length} sesiones${skipped ? ` y se omitieron ${skipped} que no tenían el formato esperado` : ''}.`
        : 'El archivo no tiene sesiones con el formato del respaldo JSON.',
    );
    input.value = '';
  }

  protected label(s: SessionRecord): string {
    return STATUS_LABEL[s.status];
  }

  protected remove(s: SessionRecord): void {
    if (globalThis.confirm(`¿Borrar la sesión ${s.id}? Esta acción no se puede deshacer.`)) {
      this.store.remove(s.id);
    }
  }

  protected exportCsv(): void {
    const p = this.protocols.protocol();
    if (p) {
      void this.files.save(`sesiones_${stamp()}.csv`, '﻿' + sessionsToCsv(p, this.store.sessions()), 'text/csv;charset=utf-8');
    }
  }

  protected exportJson(): void {
    void this.files.save(`respaldo_sesiones_${stamp()}.json`, sessionsToJson(this.store.sessions()), 'application/json');
  }
}

function stamp(): string {
  return new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '');
}
