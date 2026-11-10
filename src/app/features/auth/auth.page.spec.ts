import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';

import { CloudService } from '../../core/cloud/cloud.service';
import { FakeCloud } from '../../core/cloud/fake-cloud';
import { AuthPage } from './auth.page';

describe('AuthPage', () => {
  let cloud: FakeCloud;
  let navigated: string[];

  beforeEach(async () => {
    navigated = [];
    await TestBed.configureTestingModule({
      imports: [AuthPage],
      providers: [provideZonelessChangeDetection(), provideRouter([]), { provide: CloudService, useClass: FakeCloud }],
    }).compileComponents();
    cloud = TestBed.inject(CloudService) as unknown as FakeCloud;
    spyOn(TestBed.inject(Router), 'navigateByUrl').and.callFake((url) => {
      navigated.push(String(url));
      return Promise.resolve(true);
    });
  });

  function create(modo: 'ingresar' | 'registro', volver?: string): ComponentFixture<AuthPage> {
    const fixture = TestBed.createComponent(AuthPage);
    fixture.componentRef.setInput('modo', modo);
    if (volver) {
      fixture.componentRef.setInput('volver', volver);
    }
    fixture.detectChanges();
    return fixture;
  }

  const type = (el: HTMLElement, id: string, value: string) => {
    const input = el.querySelector<HTMLInputElement>('#' + id)!;
    input.value = value;
    input.dispatchEvent(new Event('input', { bubbles: true }));
  };

  it('Ingresar pide correo y contraseña, y avisa si faltan', () => {
    const fixture = create('ingresar');
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('h1')?.textContent).toContain('Ingresar');
    expect(el.querySelector('#a-nombre')).toBeNull();
    el.querySelector('form')!.dispatchEvent(new Event('submit', { cancelable: true }));
    fixture.detectChanges();
    expect(el.textContent).toContain('Escribe un correo válido');
    expect(el.textContent).toContain('Escribe tu contraseña');
  });

  it('Registrarse pide nombre, contraseña repetida y el consentimiento antes de crear la cuenta', async () => {
    const fixture = create('registro', '/perfil');
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('h1')?.textContent).toContain('Crear cuenta');
    const form = el.querySelector('form')!;
    type(el, 'a-nombre', 'Ana');
    type(el, 'a-correo', 'ana@example.com');
    type(el, 'a-clave', 'corta');
    type(el, 'a-clave2', 'otra');
    form.dispatchEvent(new Event('submit', { cancelable: true }));
    fixture.detectChanges();
    expect(el.textContent).toContain('Usa al menos 8 caracteres');
    expect(el.textContent).toContain('Las contraseñas no coinciden');
    expect(el.textContent).toContain('debes aceptar');
    expect(cloud.user()).toBeNull();

    type(el, 'a-clave', 'una-clave-larga');
    type(el, 'a-clave2', 'una-clave-larga');
    el.querySelector<HTMLInputElement>('input[type=checkbox]')!.click();
    form.dispatchEvent(new Event('submit', { cancelable: true }));
    await fixture.whenStable();
    fixture.detectChanges();
    expect(cloud.user()?.name).toBe('Ana');
    expect(navigated).toContain('/perfil');
  });

  it('el botón de Google de Registrarse queda desactivado hasta aceptar', () => {
    const fixture = create('registro');
    const el = fixture.nativeElement as HTMLElement;
    const google = Array.from(el.querySelectorAll('button')).find((b) => b.textContent?.includes('Continuar con Google'))!;
    expect(google.disabled).toBeTrue();
    el.querySelector<HTMLInputElement>('input[type=checkbox]')!.click();
    fixture.detectChanges();
    expect(google.disabled).toBeFalse();
  });

  it('no vuelve a rutas externas: si el destino no es interno va a la cuenta', async () => {
    const fixture = create('ingresar', '//sitio-malo.example');
    cloud.login();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(navigated).toEqual(['/cuenta']);
  });
});
