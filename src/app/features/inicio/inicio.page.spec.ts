import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { InicioPage } from './inicio.page';

describe('InicioPage', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [InicioPage],
      providers: [provideZonelessChangeDetection(), provideRouter([])],
    }).compileComponents();
  });

  it('should link to the profile and researcher modes', () => {
    const fixture = TestBed.createComponent(InicioPage);
    fixture.detectChanges();
    const hrefs = Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll('nav a'),
    ).map((a) => a.getAttribute('href'));
    expect(hrefs).toEqual(['/perfil', '/investigador']);
  });

  it('should state that there are no trained models yet', () => {
    const fixture = TestBed.createComponent(InicioPage);
    fixture.detectChanges();
    const notice = (fixture.nativeElement as HTMLElement).querySelector('.notice');
    expect(notice?.textContent).toContain('Todavía no hay modelos entrenados');
  });
});
