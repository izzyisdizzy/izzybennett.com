/**
 * Dizzy — the global `window.Dizzy`, as documentation.
 *
 * The components themselves are markup plus the `dz-` classes in `bundle.css`; only
 * these three behaviours need script. Nothing here renders anything, so a page that
 * never loads the bundle still gets every component, just without the bounce split,
 * the seamless marquee loop and the segmented control's keyboard handling.
 */
declare namespace Dizzy {
  interface BouncifyOptions {
    /** Text to split. Defaults to the element's current textContent. */
    text?: string;
    /**
     * `"always"` (default) loops. `"hover"` bounces in waves while hovered or focused, and a
     * wave in progress finishes after the pointer leaves. `"once"` is `"hover"` plus one wave on load.
     */
    trigger?: 'always' | 'hover' | 'once';
    /** Per-character delay, e.g. `"90ms"`. Defaults to the `--dz-bounce-stagger` value. */
    stagger?: string;
  }

  interface MarqueeOptions {
    /** Scroll speed. Default 60. */
    pxPerSecond?: number;
  }

  interface SegmentedControl {
    select(button: HTMLElement): void;
    buttons: HTMLElement[];
  }

  /** Split an element's text into per-character spans and start the bounce. Safe to call twice. */
  function bouncify(el: HTMLElement, options?: BouncifyOptions): HTMLElement;

  /** Duplicate a `.dz-marquee__track` for a seamless loop and set its duration from its width. */
  function marquee(el: HTMLElement, options?: MarqueeOptions): HTMLElement;

  /** Wire a `.dz-seg` control: single pressed button, arrow-key roving, value callback. */
  function segmented(el: HTMLElement, onChange?: (value: string | null, button: HTMLElement) => void): SegmentedControl;

  /** Start every `[data-dz-bounce]` and `[data-dz-marquee]` inside `root` (default: document). */
  function init(root?: ParentNode): void;

  /** True when the viewer asked for reduced motion. The CSS already respects it; use this for JS-driven extras. */
  function prefersReducedMotion(): boolean;
}
