/**
 * Reveal-on-scroll, written so it can never leave content hidden or a figure wrong.
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
 * Two further rules exist because breaking either of them puts wrong
 * information on the page rather than merely dropping an animation:
 *
 * - A target is revealed once and then unobserved. Toggling on
 *   `isIntersecting` would hide every block the reader has scrolled past,
 *   which re-runs the animation on the way back up and leaves anything
 *   off-screen invisible to printing.
 * - A counter always finishes on the number in `data-count-to`. The animation
 *   overwrites the markup value on its first frame, so if the frame loop then
 *   stalls (a background tab, a throttled or low-power renderer) the figure
 *   would otherwise freeze part-way and stay there. A timer and a
 *   visibility handler both settle it on the true value, and it runs once.
 */
(() => {
  const ARM_CLASS = 'reveal-armed';
  const SHOWN_CLASS = 'is-revealed';
  const FAILSAFE_MS = 1200;
  const COUNT_MS = 1200;

  const root = document.documentElement;
  if (!('IntersectionObserver' in window)) return;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  const observed = new WeakSet();
  const started = new WeakSet();
  const pending = new Set();
  let delivered = false;

  /** Write the real figure and stop caring about this counter. */
  const settle = (el) => {
    el.textContent = String(Number(el.dataset.countTo));
    pending.delete(el);
  };

  const countUp = (el) => {
    const target = Number(el.dataset.countTo);
    // The markup already holds the correct number, so anything unparseable
    // is left exactly as authored.
    if (!Number.isFinite(target)) return;
    if (started.has(el)) return;
    started.add(el);
    pending.add(el);

    // Independent of the frame loop: if the animation stalls or never runs,
    // the correct number still lands.
    const guard = window.setTimeout(() => settle(el), COUNT_MS + 400);

    const start = performance.now();
    const step = (now) => {
      if (!pending.has(el)) return;
      const t = Math.min((now - start) / COUNT_MS, 1);
      if (t >= 1) {
        window.clearTimeout(guard);
        settle(el);
        return;
      }
      el.textContent = String(Math.round(target * (1 - Math.pow(1 - t, 3))));
      requestAnimationFrame(step);
    };

    el.textContent = '0';
    requestAnimationFrame(step);
  };

  const observer = new IntersectionObserver(
    (entries) => {
      delivered = true;
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        entry.target.classList.add(SHOWN_CLASS);
        // Revealed content stays revealed.
        observer.unobserve(entry.target);
        const counter = entry.target.querySelector('[data-count-to]');
        if (counter) countUp(counter);
      }
    },
    // A percentage threshold is unreachable for a target taller than the
    // viewport, so entry is measured from the edge instead.
    { threshold: 0, rootMargin: '0px 0px -48px 0px' },
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

  /** Show everything, un-animated, and finish any counter still running. */
  const revealAll = () => {
    root.classList.remove(ARM_CLASS);
    for (const el of [...pending]) settle(el);
  };

  // If the observer never reports, show everything rather than hiding it.
  const failsafe = () => {
    if (delivered) return;
    root.classList.remove(ARM_CLASS);
  };

  // Leaving the tab stops the frame loop, so settle rather than freeze.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'hidden') return;
    for (const el of [...pending]) settle(el);
  });

  // Printing must not omit whatever the reader has not scrolled to.
  window.addEventListener('beforeprint', revealAll);

  scan();
  window.setTimeout(failsafe, FAILSAFE_MS);
  document.addEventListener('astro:page-load', () => {
    delivered = false;
    scan();
    window.setTimeout(failsafe, FAILSAFE_MS);
  });
})();
