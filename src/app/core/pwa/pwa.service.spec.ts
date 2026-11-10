import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { PwaService } from './pwa.service';

describe('PwaService', () => {
  beforeEach(() => {
    localStorage.removeItem('capstone.pwa.instalar.oculto');
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
  });

  afterEach(() => localStorage.removeItem('capstone.pwa.instalar.oculto'));

  it('ofrece instalar solo cuando el navegador lo permite y deja ocultar la invitación', () => {
    const pwa = TestBed.inject(PwaService);
    expect(pwa.showInstall()).toBeFalse();
    window.dispatchEvent(new Event('beforeinstallprompt', { cancelable: true }));
    expect(pwa.canPrompt()).toBeTrue();
    expect(pwa.showInstall()).toBeTrue();
    pwa.hideInstall();
    expect(pwa.showInstall()).toBeFalse();
    expect(JSON.parse(localStorage.getItem('capstone.pwa.instalar.oculto') ?? 'false')).toBeTrue();
  });

  it('sigue la conexión del dispositivo', () => {
    const pwa = TestBed.inject(PwaService);
    window.dispatchEvent(new Event('offline'));
    expect(pwa.online()).toBeFalse();
    window.dispatchEvent(new Event('online'));
    expect(pwa.online()).toBeTrue();
  });

  it('deja de ofrecer instalar cuando la aplicación ya se instaló', () => {
    const pwa = TestBed.inject(PwaService);
    window.dispatchEvent(new Event('beforeinstallprompt', { cancelable: true }));
    window.dispatchEvent(new Event('appinstalled'));
    expect(pwa.installed()).toBeTrue();
    expect(pwa.showInstall()).toBeFalse();
  });
});
