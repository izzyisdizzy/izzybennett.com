import { describe, expect, it } from 'vitest';
import { Window as HappyWindow } from 'happy-dom';
import { installBurst } from './burst';

// Each test gets its own window: installBurst is once-per-document.
function setup({ reduced = false } = {}) {
  // happy-dom's own types differ from lib.dom's; the script only sees the DOM surface.
  const win = new HappyWindow() as unknown as Window & typeof globalThis;
  const doc = win.document;
  // happy-dom's matchMedia doesn't model prefers-reduced-motion; stand in for the OS setting.
  win.matchMedia = ((q: string) => ({
    matches: reduced && q.includes('prefers-reduced-motion: reduce'),
  })) as unknown as typeof win.matchMedia;
  doc.body.innerHTML = `
    <button class="dz-btn" id="btn">Go</button>
    <button class="dz-btn" id="off" disabled>Off</button>
    <a class="dz-btn" id="aria-off" aria-disabled="true" href="#">Off</a>
    <label class="iz-option" id="opt"><input type="radio" name="d" /><span>Latte</span></label>
    <label class="iz-option" id="opt-off"><input type="radio" name="d" disabled /><span>Mocha</span></label>
    <div class="dz-seg">
      <button class="dz-seg__btn" id="seg-us" aria-pressed="true">US</button>
      <button class="dz-seg__btn" id="seg" aria-pressed="false">Grams</button>
    </div>
    <p id="plain">text</p>`;
  installBurst(doc, win);
  const el = (id: string) => doc.getElementById(id)!;
  const bursting = (id: string) => el(id).classList.contains('iz-burst');
  const pointerdown = (id: string) => el(id).dispatchEvent(new win.Event('pointerdown', { bubbles: true }));
  const keyClick = (target: Element) =>
    target.dispatchEvent(new win.MouseEvent('click', { bubbles: true, detail: 0 }));
  const animationEnd = (id: string, animationName: string, type = 'animationend') => {
    const e = new win.Event(type, { bubbles: true });
    Object.defineProperty(e, 'animationName', { value: animationName });
    el(id).dispatchEvent(e);
  };
  return { win, doc, el, bursting, pointerdown, keyClick, animationEnd };
}

describe('installBurst', () => {
  it('bursts a button on pointerdown', () => {
    const t = setup();
    t.pointerdown('btn');
    expect(t.bursting('btn')).toBe(true);
  });

  it('clears the burst when the longer layer ends', () => {
    const t = setup();
    t.pointerdown('btn');
    t.animationEnd('btn', 'iz-burst-a');
    expect(t.bursting('btn')).toBe(true);
    t.animationEnd('btn', 'iz-burst-b');
    expect(t.bursting('btn')).toBe(false);
  });

  it('clears the burst when it is cancelled for real', () => {
    const t = setup();
    t.pointerdown('btn');
    t.animationEnd('btn', 'iz-burst-b', 'animationcancel');
    expect(t.bursting('btn')).toBe(false);
  });

  it('restarts on a quick second press, surviving the old burst being cancelled', () => {
    const t = setup();
    t.pointerdown('btn');
    t.pointerdown('btn');
    // The restart cancels the first burst; that event lands after the class is back on.
    t.animationEnd('btn', 'iz-burst-b', 'animationcancel');
    expect(t.bursting('btn')).toBe(true);
    // The new burst still clears when it finishes.
    t.animationEnd('btn', 'iz-burst-b');
    expect(t.bursting('btn')).toBe(false);
  });

  it('bursts on keyboard activation (a click with no pointer detail)', () => {
    const t = setup();
    t.keyClick(t.el('btn'));
    expect(t.bursting('btn')).toBe(true);
  });

  it('ignores a pointer click (detail 1)', () => {
    const t = setup();
    t.el('btn').dispatchEvent(new t.win.MouseEvent('click', { bubbles: true, detail: 1 }));
    expect(t.bursting('btn')).toBe(false);
  });

  it("bursts a cafe option from anywhere inside it, and doesn't restart on the label's forwarded click", () => {
    const t = setup();
    t.el('opt').querySelector('span')!.dispatchEvent(new t.win.Event('pointerdown', { bubbles: true }));
    expect(t.bursting('opt')).toBe(true);
    t.animationEnd('opt', 'iz-burst-b');
    // The label's click is forwarded to its input with detail 0, right after the press.
    t.keyClick(t.el('opt').querySelector('input')!);
    expect(t.bursting('opt')).toBe(false);
  });

  it('bursts an option picked from the keyboard (arrow keys click the radio)', () => {
    const t = setup();
    t.keyClick(t.el('opt').querySelector('input')!);
    expect(t.bursting('opt')).toBe(true);
  });

  it("treats the label's forwarded click as an echo even after a long press", () => {
    const t = setup();
    const label = t.el('opt');
    let now = 0;
    t.win.performance.now = () => now;
    label.dispatchEvent(new t.win.Event('pointerdown', { bubbles: true }));
    t.animationEnd('opt', 'iz-burst-b');
    now = 2000; // held well past the echo window before release
    // In a browser the label's own click (detail 1) reaches the document first, then the
    // forwarded click on its input (detail 0). happy-dom forwards before bubbling, so send the
    // pointer click from inside the option (the input, which has no label to forward it) to get
    // the browser's order.
    const input = label.querySelector('input')!;
    input.dispatchEvent(new t.win.MouseEvent('click', { bubbles: true, detail: 1 }));
    t.keyClick(input);
    expect(t.bursting('opt')).toBe(false);
  });

  it('bursts a segmented-control button (the recipe US / Grams switch) on press and from the keyboard', () => {
    const pressed = setup();
    pressed.pointerdown('seg');
    expect(pressed.bursting('seg')).toBe(true);
    // A fresh window: a click right after the press would count as its echo.
    const keyed = setup();
    keyed.keyClick(keyed.el('seg'));
    expect(keyed.bursting('seg')).toBe(true);
  });

  // Stands in for the recipe engine's US / Grams handler: an arrow key on a button selects and
  // focuses its neighbour on keydown, with no click.
  function arrowNav(t: ReturnType<typeof setup>) {
    for (const id of ['seg-us', 'seg']) {
      t.el(id).addEventListener('keydown', (e) => {
        if ((e as KeyboardEvent).key !== 'ArrowRight') return;
        e.preventDefault();
        (t.el(id === 'seg-us' ? 'seg' : 'seg-us') as HTMLElement).focus();
      });
    }
  }
  const arrow = (t: ReturnType<typeof setup>, id: string, key = 'ArrowRight') =>
    t.el(id).dispatchEvent(new t.win.KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));

  it('bursts the segmented button an arrow key moves to', () => {
    const t = setup();
    arrowNav(t);
    (t.el('seg-us') as HTMLElement).focus();
    arrow(t, 'seg-us');
    expect(t.bursting('seg')).toBe(true);
    expect(t.bursting('seg-us')).toBe(false);
  });

  it('ignores arrow keys nothing handled', () => {
    const t = setup();
    (t.el('seg-us') as HTMLElement).focus();
    arrow(t, 'seg-us');
    arrow(t, 'seg-us', 'ArrowLeft');
    expect(t.doc.querySelectorAll('.iz-burst')).toHaveLength(0);
  });

  it('leaves disabled controls alone', () => {
    const t = setup();
    for (const id of ['off', 'aria-off', 'opt-off']) {
      t.pointerdown(id);
      t.keyClick(t.el(id));
      expect(t.bursting(id)).toBe(false);
    }
  });

  it('ignores presses outside buttons and options', () => {
    const t = setup();
    t.pointerdown('plain');
    expect(t.doc.querySelectorAll('.iz-burst')).toHaveLength(0);
  });

  it('adds no classes at all under reduced motion', () => {
    const t = setup({ reduced: true });
    for (const id of ['btn', 'opt', 'seg']) {
      t.pointerdown(id);
      t.keyClick(t.el(id));
    }
    arrowNav(t);
    (t.el('seg-us') as HTMLElement).focus();
    arrow(t, 'seg-us');
    expect(t.doc.querySelectorAll('.iz-burst')).toHaveLength(0);
  });
});
