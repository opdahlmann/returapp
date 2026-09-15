import { ShellStore } from './shell.store';

describe('ShellStore', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('toast forsvinner etter 2,4 s, og ny toast starter timeren på nytt', () => {
    const s = new ShellStore();
    s.toast('Hei');
    vi.advanceTimersByTime(2000);
    s.toast('Igjen');
    vi.advanceTimersByTime(2000);
    expect(s.toastText()).toBe('Igjen');
    vi.advanceTimersByTime(500);
    expect(s.toastText()).toBe('');
  });

  it('sheet åpnes og lukkes', () => {
    const s = new ShellStore();
    class X {}
    s.openSheet(X, { a: 1 });
    expect(s.sheet()?.component).toBe(X);
    s.closeSheet();
    expect(s.sheet()).toBeNull();
  });
});
