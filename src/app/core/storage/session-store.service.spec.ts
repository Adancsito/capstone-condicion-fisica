import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { SessionStoreService } from './session-store.service';

describe('SessionStoreService', () => {
  let store: SessionStoreService;
  const KEY = 'capstone.investigador.sesiones';

  beforeEach(() => {
    localStorage.removeItem(KEY);
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
    store = TestBed.inject(SessionStoreService);
  });

  afterEach(() => localStorage.removeItem(KEY));

  it('sugiere el siguiente código libre', () => {
    expect(store.nextCode()).toBe('P001');
    store.save(null, { id_participante: 'P001' }, 'borrador');
    store.save(null, { id_participante: 'P004' }, 'borrador');
    expect(store.nextCode()).toBe('P005');
  });

  it('guarda, actualiza y conserva la fecha de creación', () => {
    const first = store.save(null, { id_participante: 'P001', edad_anios: 21 }, 'borrador');
    const again = store.save('P001', { id_participante: 'P001', edad_anios: 22 }, 'completa');
    expect(store.sessions().length).toBe(1);
    expect(again?.createdAt).toBe(first?.createdAt);
    expect(store.get('P001')?.values['edad_anios']).toBe(22);
    expect(store.get('P001')?.status).toBe('completa');
  });

  it('no deja pisar otro registro al cambiar el código', () => {
    store.save(null, { id_participante: 'P001' }, 'borrador');
    store.save(null, { id_participante: 'P002' }, 'borrador');
    expect(store.save('P002', { id_participante: 'P001' }, 'borrador')).toBeNull();
    expect(store.sessions().map((s) => s.id)).toEqual(['P001', 'P002']);
  });

  it('mueve el registro al nuevo código si está libre', () => {
    store.save(null, { id_participante: 'P001' }, 'borrador');
    store.save('P001', { id_participante: 'P009' }, 'borrador');
    expect(store.sessions().map((s) => s.id)).toEqual(['P009']);
  });

  it('persiste en el almacenamiento local y borra', () => {
    store.save(null, { id_participante: 'P001' }, 'borrador');
    expect(JSON.parse(localStorage.getItem(KEY) ?? '[]').length).toBe(1);
    store.remove('P001');
    expect(store.sessions()).toEqual([]);
  });
});
