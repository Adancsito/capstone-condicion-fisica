import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { App } from './app';
import { CloudService } from './core/cloud/cloud.service';
import { FakeCloud } from './core/cloud/fake-cloud';
import { routes } from './app.routes';

describe('App', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [provideZonelessChangeDetection(), provideRouter(routes), { provide: CloudService, useClass: FakeCloud }],
    }).compileComponents();
  });

  it('should create the app', () => {
    const fixture = TestBed.createComponent(App);
    expect(fixture.componentInstance).toBeTruthy();
  });

  it('sin cuenta el menú ofrece Ingresar y Registrarse y no muestra Investigador', () => {
    const fixture = TestBed.createComponent(App);
    const cloud = TestBed.inject(CloudService) as unknown as FakeCloud;
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    const menu = () => Array.from(el.querySelectorAll('nav.tabbar a, nav.topnav a')).map((a) => a.textContent?.trim());
    expect(menu()).toContain('Ingresar');
    expect(menu()).toContain('Registrarse');
    expect(menu()).not.toContain('Cuenta');
    expect(menu()).not.toContain('Sesiones');
    expect(menu()).not.toContain('Investigador');
    cloud.login(false);
    fixture.detectChanges();
    expect(menu()).toContain('Cuenta');
    expect(menu()).not.toContain('Ingresar');
    expect(menu()).not.toContain('Sesiones');
    cloud.login(true);
    fixture.detectChanges();
    expect(menu()).toContain('Sesiones');
    expect(menu()).toContain('Investigador');
  });

  it('should render a router outlet', () => {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).querySelector('router-outlet')).not.toBeNull();
  });

  it('should define the public and protected routes and a fallback', () => {
    const paths = routes.map((route) => route.path);
    expect(paths).toEqual(['', 'perfil', 'ingresar', 'registro', 'investigador', 'cuenta', 'acerca', '**']);
  });
});
