/* izzybennett.com flows — motion helpers.

   1. Button bursts start on press. Pointer-down (or keyboard activation) adds .iz-burst to a
      Dizzy button or cafe option, which plays the pixel burst as a one-shot animation; it runs
      to the end however quickly the button is released, and the class clears when it does.
      Skipped under reduced motion.

   2. Titles bounce in single waves, as on the live site (its local Dizzy
   patch, izzybennett.com #73). data-dz-bounce="once" waves once on load, then on hover or
   focus; "hover" waves on hover or focus only. A wave in progress finishes after the pointer
   leaves instead of freezing letters mid-air; while still hovered or focused it goes again.
   Loads after the Dizzy bundle and wraps Dizzy.init, leaving the vendored bundle untouched.
   Reduced motion is checked per wave, so no wave starts while it's on. */
(function (global) {
  'use strict';
  var D = global.Dizzy;
  if (!D || D.izWaves) return;

  function wave(el, playNow) {
    if (el.getAttribute('data-iz-wave') === 'true') return;
    var spans = el.querySelectorAll(':scope > span');
    var last = spans[spans.length - 1];
    if (!last) return;
    el.setAttribute('data-iz-wave', 'true');
    el.classList.add('iz-bounce-wave');

    function start() {
      if (D.prefersReducedMotion() || el.classList.contains('iz-bouncing')) return;
      void el.offsetWidth; // restart the keyframes even if the class was just removed
      el.classList.add('iz-bouncing');
    }
    last.addEventListener('animationend', function () {
      el.classList.remove('iz-bouncing');
      if (el.matches(':hover, :focus-visible')) start();
    });
    last.addEventListener('animationcancel', function () { el.classList.remove('iz-bouncing'); });
    el.addEventListener('mouseenter', start);
    el.addEventListener('focusin', start);
    if (playNow) start();
  }

  var init = D.init;
  D.init = function (root) {
    init(root);
    var scope = root || document;
    [].slice.call(scope.querySelectorAll('[data-dz-bounce="once"], [data-dz-bounce="hover"]')).forEach(function (el) {
      wave(el, el.getAttribute('data-dz-bounce') === 'once');
    });
  };
  D.izWaves = true;
})(window);

(function (global) {
  'use strict';
  var doc = global.document;
  if (!doc || global.izBurst) return;
  global.izBurst = true;
  var SEL = '.dz-btn, .iz-option';
  function reduced() {
    return typeof global.matchMedia === 'function' && global.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }
  function burst(el) {
    if (!el || el.disabled || reduced()) return;
    el.classList.remove('iz-burst');
    void el.offsetWidth; // restart the keyframes on a quick second press
    el.classList.add('iz-burst');
  }
  doc.addEventListener('pointerdown', function (e) {
    if (e.target.closest) burst(e.target.closest(SEL));
  });
  // Keyboard activation (Enter / Space) arrives as a click with no pointer detail.
  doc.addEventListener('click', function (e) {
    if (e.detail === 0 && e.target.closest) burst(e.target.closest(SEL));
  });
  doc.addEventListener('animationend', function (e) {
    if (e.animationName === 'iz-burst-b' && e.target.classList) e.target.classList.remove('iz-burst');
  });
})(window);
