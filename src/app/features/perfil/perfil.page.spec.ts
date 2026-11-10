import { HttpErrorResponse, provideHttpClient, withInterceptors } from '@angular/common/http';
import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { throwError } from 'rxjs';

import { CloudService } from '../../core/cloud/cloud.service';
import { FakeCloud } from '../../core/cloud/fake-cloud';
import { PerfilPage } from './perfil.page';

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Hace que el paquete del estudio no exista, para que estas pruebas usen el de demostración y no dependan de los datos reales. */
const withoutStudyBundle = withInterceptors([
  (req, next) => (req.url.endsWith('current.json') ? throwError(() => new HttpErrorResponse({ status: 404, url: req.url })) : next(req)),
]);

/** Prueba de integración con el paquete de demostración real servido desde public/model-bundles. */
describe('PerfilPage (con el paquete de demostración)', () => {
  let fixture: ComponentFixture<PerfilPage>;
  let el: HTMLElement;

  async function settle(): Promise<void> {
    await wait(50);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  function type(id: string, value: number): void {
    const input = el.querySelector<HTMLInputElement>(`#${id}`)!;
    input.value = String(value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }

  const button = (text: string) => Array.from(el.querySelectorAll('button')).find((b) => b.textContent?.trim().startsWith(text));

  beforeEach(async () => {
    localStorage.removeItem('capstone.perfil.historial');
    await TestBed.configureTestingModule({
      imports: [PerfilPage],
      providers: [provideZonelessChangeDetection(), provideHttpClient(withoutStudyBundle), provideRouter([]), { provide: CloudService, useClass: FakeCloud }],
    }).compileComponents();
    fixture = TestBed.createComponent(PerfilPage);
    el = fixture.nativeElement as HTMLElement;
    fixture.detectChanges();
    await wait(400); // carga del paquete
    await settle();
  });

  afterEach(() => localStorage.removeItem('capstone.perfil.historial'));

  it('rotula el paquete de demostración y aclara que no es un diagnóstico', () => {
    expect(el.querySelector('.demo-banner')?.textContent).toContain('DEMOSTRACIÓN');
    expect(el.textContent).toContain('no es un diagnóstico médico');
  });

  it('genera el formulario a partir del paquete y marca las obligatorias', async () => {
    button('Empezar')!.click();
    await settle();
    const labels = Array.from(el.querySelectorAll('label')).map((l) => l.textContent?.trim() ?? '');
    expect(labels.some((t) => t.startsWith('Peso') && t.endsWith('*'))).toBeTrue();
    expect(labels.some((t) => t.startsWith('Talla') && t.endsWith('*'))).toBeTrue();
    expect(labels.some((t) => t.startsWith('Edad') && !t.endsWith('*'))).toBeTrue(); // opcional: no la usan todos los modelos
  });

  it('no avanza con una obligatoria vacía y muestra el error', async () => {
    button('Empezar')!.click();
    await settle();
    type('f-peso_kg_prom', 70);
    button('Ver mi perfil')!.click();
    await settle();
    expect(el.querySelector('small.error')?.textContent).toContain('Ingresa un valor');
    expect(el.querySelectorAll('article.result').length).toBe(0);
  });

  it('muestra cinco tarjetas independientes, sin puntaje total, y mezcla valores con "Requiere prueba directa"', async () => {
    button('Empezar')!.click();
    await settle();
    type('f-peso_kg_prom', 70);
    type('f-talla_cm_prom', 170);
    type('f-edad_anios', 28);
    el.querySelectorAll<HTMLInputElement>('input[type=radio]')[1].click();
    button('Ver mi perfil')!.click();
    await settle();
    expect(el.querySelectorAll('article.result').length).toBe(5);
    expect(el.querySelectorAll('[data-testid=value]').length).toBeGreaterThan(0);
    expect(el.querySelectorAll('[data-testid=direct]').length).toBeGreaterThan(0);
    expect(el.textContent).not.toMatch(/puntaje total:|total de puntos/i);
  });

  async function fillAndSubmit(): Promise<void> {
    button('Empezar')!.click();
    await settle();
    type('f-peso_kg_prom', 70);
    type('f-talla_cm_prom', 170);
    button('Ver mi perfil')!.click();
    await settle();
  }

  it('sin iniciar sesión da el resultado completo, no ofrece guardar y pide iniciar sesión para el historial', async () => {
    await fillAndSubmit();
    expect(el.querySelectorAll('article.result').length).toBe(5);
    expect(button('Guardar en mi historial')).toBeUndefined();
    expect(el.textContent).toContain('Registrarse');
    button('Historial')!.click();
    await settle();
    expect(el.textContent).toContain('Ingresa para ver tu historial');
  });

  it('con la sesión iniciada guarda el perfil en la cuenta, lo muestra en el historial y permite borrarlo', async () => {
    const cloud = TestBed.inject(CloudService) as unknown as FakeCloud;
    cloud.login();
    await settle();
    await fillAndSubmit();
    expect(el.textContent).not.toContain('Guarda este perfil');
    button('Guardar en mi historial')!.click();
    await settle();
    expect(cloud.saved.length).toBe(1);
    expect(el.textContent).toContain('Guardado en tu historial');
    button('Historial')!.click();
    await settle();
    expect(el.textContent).toContain('DEMOSTRACIÓN');
    button('Borrar')!.click();
    await settle();
    expect(cloud.saved.length).toBe(0);
  });
});

describe('PerfilPage (con el paquete del estudio)', () => {
  it('no rotula como demostración y declara que son modelos preliminares', async () => {
    localStorage.removeItem('capstone.perfil.historial');
    await TestBed.configureTestingModule({
      imports: [PerfilPage],
      providers: [provideZonelessChangeDetection(), provideHttpClient(), provideRouter([]), { provide: CloudService, useClass: FakeCloud }],
    }).compileComponents();
    const fixture = TestBed.createComponent(PerfilPage);
    fixture.detectChanges();
    await wait(400);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('.demo-banner')).toBeNull();
    expect(el.textContent).toContain('participantes del estudio');
    expect(el.textContent).not.toContain('DEMOSTRACIÓN');
  });

  it('pide primero peso, talla, edad y sexo, da una estimación rápida y ofrece la medición más precisa', async () => {
    localStorage.removeItem('capstone.perfil.historial');
    await TestBed.configureTestingModule({
      imports: [PerfilPage],
      providers: [provideZonelessChangeDetection(), provideHttpClient(), provideRouter([]), { provide: CloudService, useClass: FakeCloud }],
    }).compileComponents();
    const fixture = TestBed.createComponent(PerfilPage);
    const el = fixture.nativeElement as HTMLElement;
    const settle = async () => {
      await wait(50);
      fixture.detectChanges();
      await fixture.whenStable();
      fixture.detectChanges();
    };
    const button = (text: string) => Array.from(el.querySelectorAll('button')).find((b) => b.textContent?.trim().startsWith(text));
    const type = (id: string, value: number) => {
      const input = el.querySelector<HTMLInputElement>(`#${id}`)!;
      input.value = String(value);
      input.dispatchEvent(new Event('input', { bubbles: true }));
    };
    fixture.detectChanges();
    await wait(400);
    await settle();
    button('Empezar')!.click();
    await settle();
    expect(el.querySelector('#f-cintura_cm_prom')).toBeNull();
    expect(button('¿Medición más precisa?')).toBeDefined();
    type('f-peso_kg_prom', 68);
    type('f-talla_cm_prom', 168);
    type('f-edad_anios', 24);
    el.querySelectorAll<HTMLInputElement>('input[type=radio]')[1].click();
    button('Ver mi perfil')!.click();
    await settle();
    expect(el.textContent).toContain('Estimación rápida');
    expect(el.querySelectorAll('[data-testid=value]').length).toBeGreaterThan(0);
    button('¿Medición más precisa?')!.click();
    await settle();
    expect(el.querySelector('#f-cintura_cm_prom')).not.toBeNull();
    expect(button('Volver a la medición rápida')).toBeDefined();
  });

  it('muestra primero los componentes estimados y deja los de prueba directa en un panel desplegable', async () => {
    localStorage.removeItem('capstone.perfil.historial');
    await TestBed.configureTestingModule({
      imports: [PerfilPage],
      providers: [provideZonelessChangeDetection(), provideHttpClient(), provideRouter([]), { provide: CloudService, useClass: FakeCloud }],
    }).compileComponents();
    const fixture = TestBed.createComponent(PerfilPage);
    const el = fixture.nativeElement as HTMLElement;
    const settle = async () => {
      await wait(50);
      fixture.detectChanges();
      await fixture.whenStable();
      fixture.detectChanges();
    };
    const button = (text: string) => Array.from(el.querySelectorAll('button')).find((b) => b.textContent?.trim().startsWith(text));
    const type = (id: string, value: number) => {
      const input = el.querySelector<HTMLInputElement>(`#${id}`)!;
      input.value = String(value);
      input.dispatchEvent(new Event('input', { bubbles: true }));
    };
    fixture.detectChanges();
    await wait(400);
    await settle();
    button('Empezar')!.click();
    await settle();
    type('f-peso_kg_prom', 68);
    type('f-talla_cm_prom', 168);
    type('f-edad_anios', 24);
    el.querySelectorAll<HTMLInputElement>('input[type=radio]')[1].click();
    button('Ver mi perfil')!.click();
    await settle();
    const details = el.querySelector<HTMLDetailsElement>('details.direct-group')!;
    expect(details).not.toBeNull();
    expect(details.open).toBeFalse();
    expect(details.querySelectorAll('[data-testid=direct]').length).toBeGreaterThan(0);
    expect(details.querySelectorAll('[data-testid=value]').length).toBe(0);
    const outside = Array.from(el.querySelectorAll('[data-testid=value]')).filter((v) => !details.contains(v));
    expect(outside.length).toBeGreaterThan(0);
  });
});
