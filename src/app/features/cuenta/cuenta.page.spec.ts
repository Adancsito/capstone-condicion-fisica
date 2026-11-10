import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { CloudService } from '../../core/cloud/cloud.service';
import { FakeCloud } from '../../core/cloud/fake-cloud';
import { CuentaPage } from './cuenta.page';
import { SolicitudPage } from './solicitud.page';

describe('CuentaPage', () => {
  let cloud: FakeCloud;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CuentaPage, SolicitudPage],
      providers: [provideZonelessChangeDetection(), provideRouter([]), { provide: CloudService, useClass: FakeCloud }],
    }).compileComponents();
    cloud = TestBed.inject(CloudService) as unknown as FakeCloud;
  });

  async function render<T>(type: new () => T): Promise<ComponentFixture<T>> {
    const fixture = TestBed.createComponent(type);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    return fixture;
  }

  it('muestra la cuenta y, a quien no es investigador, solo ofrece solicitarlo', async () => {
    cloud.login(false);
    const el = (await render(CuentaPage)).nativeElement as HTMLElement;
    expect(el.textContent).toContain('Persona de prueba');
    expect(el.textContent).toContain('prueba@example.com');
    expect(el.textContent).toContain('0 perfiles guardados');
    expect(el.textContent).toContain('Solicitar ser investigador');
    expect(el.textContent).not.toContain('Sesiones de medición');
  });

  it('a la cuenta aprobada a mano le muestra el acceso a las sesiones de medición', async () => {
    cloud.login(true);
    const el = (await render(CuentaPage)).nativeElement as HTMLElement;
    expect(el.textContent).toContain('Sesiones de medición');
    expect(el.textContent).not.toContain('Solicitar ser investigador');
  });

  it('la solicitud pide un motivo, se envía y queda como pendiente', async () => {
    cloud.login(false);
    const fixture = await render(SolicitudPage);
    const el = fixture.nativeElement as HTMLElement;
    const form = el.querySelector('form')!;
    form.dispatchEvent(new Event('submit', { cancelable: true }));
    fixture.detectChanges();
    expect(cloud.requests.length).toBe(0);
    expect(el.textContent).toContain('Cuéntanos en una o dos frases');
    const motivo = el.querySelector<HTMLTextAreaElement>('#s-motivo')!;
    motivo.value = 'Soy parte del equipo que mide a los participantes';
    motivo.dispatchEvent(new Event('input', { bubbles: true }));
    form.dispatchEvent(new Event('submit', { cancelable: true }));
    await fixture.whenStable();
    fixture.detectChanges();
    expect(cloud.requests.length).toBe(1);
    expect(el.textContent).toContain('Estamos revisando tu solicitud');
  });
});
