// The pixel burst on press (Dizzy M13), ported from the design canvas's
// docs/design/flows/iz-bounce.js. The pixels themselves are CSS (site.css, "button burst"):
// this only adds `.iz-burst` to a button, cafe option or segmented-control button (the recipe
// page's US / Grams switch) the moment it's pressed, so the one-shot keyframes play on press
// rather than release, and clears it when they finish.

const SELECTOR = '.dz-btn, .iz-option, .dz-seg__btn';
// The longer of the two burst layers (::before); when it ends, the whole burst is over.
const LAST_ANIMATION = 'iz-burst-b';
const ARROW_KEYS = new Set(['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown']);
// A mouse click on an option's <label> also fires a forwarded click on its <input>, with
// detail 0 like a keyboard click. Within this window of a pointerdown on the same element,
// that click is the echo of the press, not a second one.
const ECHO_MS = 500;

const installed = new WeakSet<Document>();

function isDisabled(el: Element): boolean {
  if ((el as HTMLButtonElement).disabled) return true;
  if (el.getAttribute('aria-disabled') === 'true') return true;
  // An .iz-option is a <label>; its real control is the input inside it.
  const input = el.classList.contains('iz-option') ? el.querySelector('input') : null;
  return input?.disabled ?? false;
}

export function installBurst(doc: Document, win: Window & typeof globalThis): void {
  if (installed.has(doc)) return;
  installed.add(doc);

  const lastPointer = new WeakMap<Element, number>();
  // Elements whose running burst was just restarted. Restarting cancels the old animation, and
  // that animationcancel arrives a frame later, after the class is back on: it belongs to the
  // old burst, so it must not clear the new one.
  const restarted = new WeakSet<Element>();
  const reduced = () =>
    typeof win.matchMedia === 'function' && win.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function target(e: Event): Element | null {
    return e.target instanceof win.Element ? e.target.closest(SELECTOR) : null;
  }

  function burst(el: Element | null): void {
    if (!el || reduced() || isDisabled(el)) return;
    if (el.classList.contains('iz-burst')) restarted.add(el);
    el.classList.remove('iz-burst');
    void (el as HTMLElement).offsetWidth; // restart the keyframes on a quick second press
    el.classList.add('iz-burst');
  }

  doc.addEventListener('pointerdown', (e) => {
    const el = target(e);
    if (!el) return;
    lastPointer.set(el, win.performance.now());
    burst(el);
  });

  // Keyboard activation (Enter / Space, and arrow keys moving between radios) arrives as a
  // click with no pointer detail.
  doc.addEventListener('click', (e) => {
    const el = target(e);
    if (!el) return;
    // A pointer click restarts the echo window, so a press held longer than it still counts
    // the label's forwarded click, which follows at once, as an echo.
    if ((e as MouseEvent).detail !== 0) {
      lastPointer.set(el, win.performance.now());
      return;
    }
    const pressed = lastPointer.get(el);
    if (pressed !== undefined && win.performance.now() - pressed < ECHO_MS) return;
    burst(el);
  });

  // A segmented control's arrow keys (the recipe page's US / Grams switch) select the
  // neighbouring button on keydown and move focus to it, with no click. The control's own
  // handler sits on the button, so by the time the keydown reaches the document focus has
  // already moved: burst the newly focused button when the key was handled.
  doc.addEventListener('keydown', (e) => {
    if (!ARROW_KEYS.has(e.key) || !e.defaultPrevented) return;
    const from = e.target instanceof win.Element ? e.target.closest('.dz-seg__btn') : null;
    const to = doc.activeElement;
    if (!from || !to || to === from || !to.matches('.dz-seg__btn')) return;
    if (to.closest('.dz-seg') !== from.closest('.dz-seg')) return;
    burst(to);
  });

  const clear = (e: Event) => {
    if ((e as AnimationEvent).animationName !== LAST_ANIMATION) return;
    if (!(e.target instanceof win.Element)) return;
    if (e.type === 'animationcancel' && restarted.has(e.target)) {
      restarted.delete(e.target);
      return;
    }
    restarted.delete(e.target);
    e.target.classList.remove('iz-burst');
  };
  doc.addEventListener('animationend', clear);
  doc.addEventListener('animationcancel', clear);
}
