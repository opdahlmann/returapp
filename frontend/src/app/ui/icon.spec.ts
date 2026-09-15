import { TestBed } from '@angular/core/testing';
import { Icon } from './icon';
import { ICONS } from './icons';

describe('ra-icon', () => {
  it('rendrer én path per ikon-segment, med riktig størrelse', async () => {
    const f = TestBed.createComponent(Icon);
    f.componentRef.setInput('name', 'truck');
    f.componentRef.setInput('size', 24);
    await f.whenStable();
    const svg: SVGElement = f.nativeElement.querySelector('svg');
    expect(svg.getAttribute('width')).toBe('24');
    expect(svg.querySelectorAll('path').length).toBe(ICONS['truck'].length);
  });

  it('ukjent ikon faller tilbake til "annet"', async () => {
    const f = TestBed.createComponent(Icon);
    f.componentRef.setInput('name', 'finnes-ikke');
    await f.whenStable();
    expect(f.nativeElement.querySelectorAll('path').length).toBe(ICONS['annet'].length);
  });
});
