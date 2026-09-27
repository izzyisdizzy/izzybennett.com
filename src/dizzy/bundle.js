/* Dizzy — behaviour bundle.
   Plain browser JavaScript, no framework: the site is Astro + Tailwind, so the
   components are markup plus the classes in bundle.css, and this file only adds the
   three behaviours that markup alone cannot express. Loads as a classic script and
   assigns window.Dizzy. */
(function (global) {
  'use strict';

  var REDUCED = function () {
    return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  };

  /* Wrap every character of an element in its own span and stagger the bounce.
     Idempotent: an element already split is left alone. Whitespace stays a plain
     text node so words still wrap, and the element keeps its accessible name
     because the characters remain in document order. */
  function bouncify(el, options) {
    if (!el || el.getAttribute('data-dz-bouncified') === 'true') return el;
    var opts = options || {};
    var text = opts.text != null ? opts.text : el.textContent;
    var stagger = opts.stagger;
    var frag = document.createDocumentFragment();
    var index = 0;

    /* Local patch (izzybennett.com): split by grapheme cluster, not UTF-16 code unit, so an
       emoji or a combining accent bounces as one glyph instead of two broken halves. Upstream
       Dizzy still uses charAt(i). */
    var chars = typeof Intl !== 'undefined' && Intl.Segmenter
      ? Array.prototype.map.call(Array.from(new Intl.Segmenter().segment(text)), function (s) { return s.segment; })
      : Array.from(text);

    for (var i = 0; i < chars.length; i++) {
      var ch = chars[i];
      if (ch === ' ' || ch === '\n' || ch === '\t') {
        frag.appendChild(document.createTextNode(ch));
        continue;
      }
      var span = document.createElement('span');
      span.textContent = ch;
      span.style.setProperty('--dz-i', String(index));
      span.setAttribute('aria-hidden', 'false');
      frag.appendChild(span);
      index++;
    }

    el.textContent = '';
    el.appendChild(frag);
    el.classList.add('dz-bouncy');
    if (opts.trigger === 'hover') el.classList.add('dz-bouncy--hover');
    if (opts.trigger === 'once') el.classList.add('dz-bouncy--once');
    if (stagger) el.style.setProperty('--dz-bounce-stagger', stagger);
    el.setAttribute('data-dz-bouncified', 'true');
    if (opts.trigger === 'hover' || opts.trigger === 'once') replayOnHover(el, opts.trigger === 'once');
    return el;
  }

  /* Local patch (izzybennett.com): drive `hover`/`once` bounces as single waves. Each wave
     adds .dz-bouncing and the last letter's animationend removes it, so a pointer that
     leaves mid-wave lets the wave finish; while still hovered or focused, it goes again.
     Upstream Dizzy pauses an infinite loop instead, which freezes letters mid-bounce. */
  function replayOnHover(el, playNow) {
    if (REDUCED()) return;
    var spans = el.querySelectorAll(':scope > span');
    var last = spans[spans.length - 1];
    if (!last) return;

    function start() {
      if (el.classList.contains('dz-bouncing')) return;
      void el.offsetWidth; // restart the keyframes even if the class was just removed
      el.classList.add('dz-bouncing');
    }

    last.addEventListener('animationend', function () {
      el.classList.remove('dz-bouncing');
      if (el.matches(':hover, :focus-visible')) start();
    });
    el.addEventListener('mouseenter', start);
    el.addEventListener('focusin', start);
    if (playNow) start();
  }

  /* Duplicate a marquee's content once so the loop has no visible seam, and set the
     duration from the track width at a steady 60px per second. The duplicate is
     aria-hidden, so a screen reader reads the message exactly once. */
  function marquee(el, options) {
    if (!el || el.getAttribute('data-dz-marquee-ready') === 'true') return el;
    var opts = options || {};
    var track = el.querySelector('.dz-marquee__track');
    if (!track) return el;

    var clone = track.cloneNode(true);
    clone.setAttribute('aria-hidden', 'true');
    el.appendChild(clone);

    var speed = opts.pxPerSecond || 60;
    var width = track.scrollWidth || 600;
    el.style.setProperty('--dz-marquee-duration', Math.max(8, Math.round((width * 2) / speed)) + 's');
    el.setAttribute('data-dz-marquee-ready', 'true');
    if (REDUCED()) el.setAttribute('data-dz-reduced', 'true');
    return el;
  }

  /* Wire a segmented control: one pressed button at a time, arrow-key roving, and a
     callback with the chosen value. The caller owns what the value means. */
  function segmented(el, onChange) {
    if (!el) return el;
    var buttons = [].slice.call(el.querySelectorAll('.dz-seg__btn'));

    function select(btn) {
      buttons.forEach(function (b) { b.setAttribute('aria-pressed', String(b === btn)); });
      if (typeof onChange === 'function') onChange(btn.getAttribute('data-value'), btn);
    }

    buttons.forEach(function (btn, i) {
      btn.addEventListener('click', function () { select(btn); });
      btn.addEventListener('keydown', function (event) {
        var step = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
        if (!step) return;
        event.preventDefault();
        var next = buttons[(i + step + buttons.length) % buttons.length];
        next.focus();
        select(next);
      });
    });

    return { select: select, buttons: buttons };
  }

  /* Scan a subtree and start everything declared in markup:
     [data-dz-bounce], [data-dz-bounce="hover"], [data-dz-bounce="once"] and [data-dz-marquee]. */
  function init(root) {
    var scope = root || document;
    [].slice.call(scope.querySelectorAll('[data-dz-bounce]')).forEach(function (el) {
      var trigger = el.getAttribute('data-dz-bounce');
      bouncify(el, { trigger: trigger === 'hover' || trigger === 'once' ? trigger : 'always' });
    });
    [].slice.call(scope.querySelectorAll('[data-dz-marquee]')).forEach(function (el) {
      marquee(el);
    });
  }

  global.Dizzy = { bouncify: bouncify, marquee: marquee, segmented: segmented, init: init, prefersReducedMotion: REDUCED };
})(window);
