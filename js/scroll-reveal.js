/**
 * Reveal-on-scroll, written so it can never leave content hidden.
 *
 * The obvious implementation sets `opacity: 0` on every target up front and
 * relies on an IntersectionObserver callback to bring it back. If that callback
 * never arrives, the page silently loses its content, which for a product site
 * is a worse outcome than having no animation at all.
 *
 * So the order is inverted:
 *
 * 1. Content is visible by default; the CSS that hides it is gated behind the
 *    `reveal-armed` class on <html>, which only this script adds.
 * 2. The class is added only once an observer exists and targets are found.
 * 3. If no callback has been delivered shortly afterwards, the class is removed
 *    again and everything simply shows, un-animated.
 *
 * An element containing `[data-count-to]` counts up on entry. The final value
 * is already in the markup, so the number is correct whether or not this runs.
 */
(() => {
  const ARM_CLASS = 'reveal-armed';
  const SHOWN_CLASS = 'is-revealed';
  const FAILSAFE_MS = 1200;

  const root = document.documentElement;
  if (!('IntersectionObserver' in window)) return;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  const observed = new WeakSet();
  const counted = new WeakMap();
  let delivered = false;

  const countUp = (el) => {
    const target = Number(el.dataset.countTo);
    if (!Number.isFinite(target)) return;
    const running = counted.get(el);
    if (running) cancelAnimationFrame(running);
    const start = performance.now();
    const step = (now) => {
      const t = Math.min((now - start) / 1200, 1);
      el.textContent = String(Math.round(target * (1 - Math.pow(1 - t, 3))));
      if (t < 1) counted.set(el, requestAnimationFrame(step));
    };
    el.textContent = '0';
    counted.set(el, requestAnimationFrame(step));
  };

  const observer = new IntersectionObserver(
    (entries) => {
      delivered = true;
      for (const entry of entries) {
        entry.target.classList.toggle(SHOWN_CLASS, entry.isIntersecting);
        if (!entry.isIntersecting) continue;
        const counter = entry.target.querySelector('[data-count-to]');
        if (counter) countUp(counter);
      }
    },
    { threshold: 0.2 },
  );

  const scan = () => {
    const targets = document.querySelectorAll('[data-reveal]');
    if (targets.length === 0) return;
    root.classList.add(ARM_CLASS);
    for (const el of targets) {
      if (observed.has(el)) continue;
      observed.add(el);
      observer.observe(el);
    }
  };

  // If the observer never reports, show everything rather than hiding it.
  const failsafe = () => {
    if (delivered) return;
    root.classList.remove(ARM_CLASS);
  };

  scan();
  window.setTimeout(failsafe, FAILSAFE_MS);
  document.addEventListener('astro:page-load', () => {
    delivered = false;
    scan();
    window.setTimeout(failsafe, FAILSAFE_MS);
  });
})();
