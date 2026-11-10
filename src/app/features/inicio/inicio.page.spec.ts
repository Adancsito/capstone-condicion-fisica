import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { InicioPage } from './inicio.page';

describe('InicioPage', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [InicioPage],
      providers: [provideZonelessChangeDetection(), provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();
  });

  it('should link to the profile and about pages and hide the researcher card', () => {
    const fixture = TestBed.createComponent(InicioPage);
    fixture.detectChanges();
    const hrefs = Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('a')).map((a) => a.getAttribute('href'));
    expect(hrefs).toEqual(['/perfil', '/acerca']);
  });

  it('should list the five components and state there is no total score', () => {
    const fixture = TestBed.createComponent(InicioPage);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelectorAll('.tests li').length).toBe(5);
    expect(el.textContent).toContain('No hay un puntaje total');
  });
});
