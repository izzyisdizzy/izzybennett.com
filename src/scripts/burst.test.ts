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
  it('bursts a button on pointerdown, not later on release', () => {
    const t = setup();
    t.pointerdown('btn');
    expect(t.bursting('btn')).toBe(true);
  });

  it('clears the burst when the longer layer ends, and on cancel', () => {
    const t = setup();
    t.pointerdown('btn');
    t.animationEnd('btn', 'iz-burst-a');
    expect(t.bursting('btn')).toBe(true);
    t.animationEnd('btn', 'iz-burst-b');
    expect(t.bursting('btn')).toBe(false);
    t.pointerdown('btn');
    t.animationEnd('btn', 'iz-burst-b', 'animationcancel');
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
    for (const id of ['btn', 'opt']) {
      t.pointerdown(id);
      t.keyClick(t.el(id));
    }
    expect(t.doc.querySelectorAll('.iz-burst')).toHaveLength(0);
  });
});
