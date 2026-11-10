import { Component, computed, input, output } from '@angular/core';

import { FieldSpec, FieldValue } from '../core/protocol/protocol.types';

/** Un campo del protocolo, generado a partir de su especificación. */
@Component({
  selector: 'app-field',
  template: `
    <div class="field">
      @if (field().type === 'select') {
        <fieldset>
          <legend>{{ field().label }}</legend>
          @if (asChips()) {
            <div class="choices" role="radiogroup">
              @for (o of field().options; track o.value) {
                <label class="choice">
                  <input type="radio" [name]="field().key" [checked]="value() === o.value" (change)="changed.emit(o.value)" />
                  {{ o.label }}
                </label>
              }
            </div>
          } @else {
            <select class="input" [id]="id()" [attr.aria-invalid]="error() ? 'true' : null" (change)="onSelect($event)">
              <option value="" [selected]="value() === null || value() === ''">Elige…</option>
              @for (o of field().options; track o.value) {
                <option [value]="o.value" [selected]="value() === o.value">{{ o.label }}</option>
              }
            </select>
          }
        </fieldset>
      } @else {
        <label [for]="id()">{{ field().label }}@if (field().unit) { <span class="muted"> ({{ field().unit }})</span> }</label>
        @if (field().type === 'textarea') {
          <textarea class="input area" rows="3" [id]="id()" [value]="text()" (input)="onText($event)"></textarea>
        } @else {
          <input
            class="input" [id]="id()" [type]="htmlType()" [attr.inputmode]="inputMode()" [attr.step]="step()"
            [value]="text()" [attr.aria-invalid]="error() ? 'true' : null" [attr.aria-describedby]="id() + '-h'"
            (input)="onText($event)"
          />
        }
      }
      @if (field().help) {
        <small [id]="id() + '-h'">{{ field().help }}</small>
      }
      @if (error(); as e) {
        <small class="error" role="alert">{{ e }}</small>
      }
    </div>
  `,
  styles: `
    .area { min-height: 90px; padding: var(--space-3); }
  `,
})
export class FieldInputComponent {
  readonly field = input.required<FieldSpec>();
  readonly value = input<FieldValue>(null);
  readonly error = input<string | null>(null);
  readonly changed = output<FieldValue>();

  protected readonly id = computed(() => `c-${this.field().key}`);
  protected readonly text = computed(() => (this.value() === null ? '' : String(this.value())));
  protected readonly asChips = computed(() => (this.field().options?.length ?? 0) <= 4);
  protected readonly htmlType = computed(() => {
    switch (this.field().type) {
      case 'number':
      case 'integer':
        return 'number';
      case 'date':
        return 'date';
      case 'time':
        return 'time';
      default:
        return 'text';
    }
  });
  protected readonly inputMode = computed(() =>
    this.field().type === 'integer' ? 'numeric' : this.field().type === 'number' ? 'decimal' : null,
  );
  protected readonly step = computed(() => (this.field().type === 'number' ? 'any' : this.field().type === 'integer' ? '1' : null));

  protected onText(event: Event): void {
    const raw = (event.target as HTMLInputElement | HTMLTextAreaElement).value;
    const t = this.field().type;
    if (t === 'number' || t === 'integer') {
      this.changed.emit(raw === '' ? null : Number(raw));
    } else {
      this.changed.emit(raw === '' ? null : raw);
    }
  }

  protected onSelect(event: Event): void {
    const raw = (event.target as HTMLSelectElement).value;
    this.changed.emit(raw === '' ? null : raw);
  }
}
