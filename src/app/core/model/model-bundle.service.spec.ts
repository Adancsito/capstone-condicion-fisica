import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { ModelBundleService, bundleProblem } from './model-bundle.service';
import { ModelBundle } from './model-bundle.types';

function bundle(isDemo: boolean): ModelBundle {
  return {
    manifest: { schemaVersion: 1, bundleVersion: 'x', createdAt: '', isDemo, description: '', population: '', trainedRows: 1, validationNote: '' },
    inputs: [],
    components: ['Y1', 'Y2', 'Y3', 'Y4', 'Y5'].map((key) => ({
      key: key as 'Y1', name: key, unit: 'kg', directTest: '', note: null, features: [], model: null, meetsCriteria: false,
      metrics: null, trainRange: {}, trainN: 0,
    })),
    levels: null,
  };
}

const notFound = { status: 404, statusText: 'No encontrado' };
const tick = () => new Promise((r) => setTimeout(r));

describe('Paquete de modelo', () => {
  it('rechaza un paquete de demostración cuando la compilación no lo permite', () => {
    expect(bundleProblem(bundle(true), false)).toContain('demostración');
    expect(bundleProblem(bundle(true), true)).toBeNull();
    expect(bundleProblem(bundle(false), false)).toBeNull();
  });

  it('rechaza formatos incompletos y esquemas desconocidos', () => {
    expect(bundleProblem({}, true)).toContain('formato');
    const b = bundle(false);
    b.manifest.schemaVersion = 2;
    expect(bundleProblem(b, true)).toContain('esquema');
    const c = bundle(false);
    c.components = c.components.slice(0, 3);
    expect(bundleProblem(c, true)).toContain('cinco');
  });

  describe('carga', () => {
    let http: HttpTestingController;
    let service: ModelBundleService;

    beforeEach(() => {
      TestBed.configureTestingModule({
        providers: [provideZonelessChangeDetection(), provideHttpClient(), provideHttpClientTesting()],
      });
      http = TestBed.inject(HttpTestingController);
      service = TestBed.inject(ModelBundleService);
    });

    it('usa el paquete definitivo si existe', async () => {
      const done = service.load();
      http.expectOne('model-bundles/current.json').flush(bundle(false));
      await done;
      expect(service.state()).toBe('ready');
      expect(service.isDemo()).toBeFalse();
    });

    it('en desarrollo cae al paquete de demostración y lo declara', async () => {
      const done = service.load();
      http.expectOne('model-bundles/current.json').flush('', notFound);
      await tick();
      http.expectOne('model-bundles/demo.json').flush(bundle(true));
      await done;
      expect(service.state()).toBe('ready');
      expect(service.isDemo()).toBeTrue();
    });

    it('queda no disponible si no hay ningún paquete', async () => {
      const done = service.load();
      http.expectOne('model-bundles/current.json').flush('', notFound);
      await tick();
      http.expectOne('model-bundles/demo.json').flush('', notFound);
      await done;
      expect(service.state()).toBe('unavailable');
    });
  });
});
