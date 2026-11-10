import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { RulerComponent } from './ruler.component';

describe('RulerComponent', () => {
  let fixture: ComponentFixture<RulerComponent>;
  const el = () => fixture.nativeElement as HTMLElement;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [RulerComponent], providers: [provideZonelessChangeDetection()] }).compileComponents();
    fixture = TestBed.createComponent(RulerComponent);
  });

  it('pone la marca de la estimación dentro de la regla y describe el rango en el texto accesible', () => {
    fixture.componentRef.setInput('value', 38);
    fixture.componentRef.setInput('range', [26, 53]);
    fixture.componentRef.setInput('unit', 'kg');
    fixture.detectChanges();
    const marker = el().querySelector<HTMLElement>('.marker')!;
    const left = parseFloat(marker.style.left);
    expect(left).toBeGreaterThan(0);
    expect(left).toBeLessThan(100);
    expect(el().querySelector('.ruler')?.getAttribute('aria-label')).toContain('26,0 a 53,0 kg');
  });

  it('sin valor no dibuja la marca: la regla solo muestra el rango del estudio', () => {
    fixture.componentRef.setInput('range', [918, 1339]);
    fixture.componentRef.setInput('unit', 's');
    fixture.componentRef.setInput('decimals', 0);
    fixture.detectChanges();
    expect(el().querySelector('.marker')).toBeNull();
    expect(el().querySelector('.band')).not.toBeNull();
  });

  it('marca el cero (la línea de los pies) cuando la regla lo cruza', () => {
    fixture.componentRef.setInput('value', 2);
    fixture.componentRef.setInput('range', [-12, 12]);
    fixture.componentRef.setInput('unit', 'cm');
    fixture.detectChanges();
    expect(el().querySelector('.zero')).not.toBeNull();
  });

  it('divide la banda en niveles solo si recibe puntos de corte', () => {
    fixture.componentRef.setInput('value', 38);
    fixture.componentRef.setInput('range', [26, 53]);
    fixture.detectChanges();
    expect(el().querySelectorAll('.seg').length).toBe(0);
    fixture.componentRef.setInput('levels', { labels: ['Bajo', 'Promedio', 'Alto'], cutoffs: [34, 44], balancedAccuracy: 0.8, source: 'prueba' });
    fixture.detectChanges();
    expect(Array.from(el().querySelectorAll('.seg')).map((s) => s.textContent?.trim())).toEqual(['Bajo', 'Promedio', 'Alto']);
  });
});
