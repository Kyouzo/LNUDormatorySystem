/* ==========================================================================
   LNU Dormitory Portal — shared behaviours + motion layer
   - Works with zero dependencies. GSAP 3.12 (+ScrollTrigger) and Lenis 1.1
     are optional enhancements loaded from CDN (see assets/DESIGN.md).
   - Load this file in <head> WITHOUT defer (after the deferred CDN scripts)
     so entrance animations start from a hidden state with no flash.
     Loaded at the end of <body> it still works; entrances are then skipped.
   - prefers-reduced-motion: no Lenis, no entrances, no canvas, no magnet.
   ========================================================================== */
(function () {
  'use strict';

  if (window.Portal && window.Portal.__init) return; // included twice: run once
  const doc = document;
  const root = doc.documentElement;
  const mq = (q) => (window.matchMedia ? window.matchMedia(q) : { matches: false });
  const reduced = mq('(prefers-reduced-motion: reduce)').matches;
  const finePointer = mq('(hover: hover) and (pointer: fine)').matches;
  const loadedInHead = !doc.body;

  // Hide reveal targets before first paint; portal.css has a 2.5s failsafe.
  if (loadedInHead && !reduced) root.classList.add('motion');

  const REVEAL_SEL = '[data-reveal], .content-stack > .panel, .summary-grid > .panel, .violation-grid > .panel, .card-grid > .feature-card';
  const EASE = 'expo.out'; // closest GSAP core ease to cubic-bezier(.16,1,.3,1)

  const qsa = (sel, ctx) => Array.prototype.slice.call((ctx || doc).querySelectorAll(sel));
  const onReady = (fn) => (doc.readyState === 'loading' ? doc.addEventListener('DOMContentLoaded', fn) : fn());

  const Portal = (window.Portal = window.Portal || {});
  Portal.__init = true;
  Portal.lenis = null;

  /* ---------- Existing behaviour ---------- */
  function currentYear() {
    qsa('[data-current-year]').forEach((node) => { node.textContent = new Date().getFullYear(); });
  }

  /* ---------- Toast ---------- */
  let toastStack = null;
  Portal.toast = function (message, opts) {
    const o = opts || {};
    if (!toastStack) {
      toastStack = doc.createElement('div');
      toastStack.className = 'toast-stack';
      toastStack.setAttribute('role', 'status');
      toastStack.setAttribute('aria-live', 'polite');
      doc.body.appendChild(toastStack);
    }
    const t = doc.createElement('div');
    t.className = 'toast' + (o.type ? ' toast-' + o.type : '');
    t.textContent = String(message);
    toastStack.appendChild(t);
    while (toastStack.children.length > 3) toastStack.removeChild(toastStack.firstChild);
    requestAnimationFrame(() => requestAnimationFrame(() => t.classList.add('is-visible')));
    const dismiss = () => {
      t.classList.add('is-leaving');
      setTimeout(() => t.remove(), 180);
    };
    setTimeout(dismiss, o.duration || 3200);
    return dismiss;
  };

  /* ---------- Dialog (<dialog class="dialog">) ---------- */
  Portal.openDialog = function (dialog) {
    const d = typeof dialog === 'string' ? doc.getElementById(dialog) : dialog;
    if (!d || d.open) return;
    if (typeof d.showModal === 'function') d.showModal(); else d.setAttribute('open', '');
    if (Portal.lenis) Portal.lenis.stop();
  };
  Portal.closeDialog = function (dialog) {
    const d = typeof dialog === 'string' ? doc.getElementById(dialog) : dialog;
    if (!d || !d.open || d.classList.contains('is-closing')) return;
    const finish = () => {
      d.classList.remove('is-closing');
      if (typeof d.close === 'function') d.close(); else d.removeAttribute('open');
    };
    if (reduced) return finish();
    d.classList.add('is-closing');
    setTimeout(finish, 150);
  };
  function wireDialogs() {
    doc.addEventListener('click', (e) => {
      const opener = e.target.closest('[data-dialog-open]');
      if (opener) { e.preventDefault(); Portal.openDialog(opener.getAttribute('data-dialog-open')); return; }
      const closer = e.target.closest('[data-dialog-close]');
      if (closer) { Portal.closeDialog(closer.closest('dialog')); return; }
      if (e.target.matches && e.target.matches('dialog.dialog[open]')) Portal.closeDialog(e.target); // backdrop click
    });
    qsa('dialog.dialog').forEach((d) => {
      d.addEventListener('cancel', (e) => { e.preventDefault(); Portal.closeDialog(d); });
      d.addEventListener('close', () => { if (Portal.lenis) Portal.lenis.start(); });
    });
  }

  /* ---------- Sidebar: shared gold hover indicator ---------- */
  function navIndicator() {
    qsa('.sidebar .nav').forEach((nav) => {
      const links = qsa('a', nav);
      if (!links.length) return;
      const bar = doc.createElement('span');
      bar.className = 'nav-indicator';
      bar.setAttribute('aria-hidden', 'true');
      nav.appendChild(bar);
      nav.classList.add('has-indicator');
      const current = () => nav.querySelector('a[aria-current="page"]');
      const moveTo = (link, instant) => {
        if (!link) { bar.classList.remove('is-visible'); return; }
        if (instant) bar.style.transition = 'none';
        bar.style.transform = 'translateY(' + (link.offsetTop + (link.offsetHeight - 22) / 2) + 'px)';
        bar.classList.add('is-visible');
        if (instant) { void bar.offsetWidth; bar.style.transition = ''; }
      };
      moveTo(current(), true);
      links.forEach((a) => {
        a.addEventListener('pointerenter', () => moveTo(a));
        a.addEventListener('focus', () => moveTo(a));
      });
      nav.addEventListener('pointerleave', () => moveTo(current()));
      nav.addEventListener('focusout', (e) => { if (!nav.contains(e.relatedTarget)) moveTo(current()); });
      window.addEventListener('resize', () => moveTo(current(), true), { passive: true });
    });
  }

  /* ---------- Hero background: drifting diagonal light rails (canvas) ---------- */
  function heroLines(host) {
    if (host.querySelector(':scope > .hero-lines')) return;
    const canvas = doc.createElement('canvas');
    canvas.className = 'hero-lines';
    canvas.setAttribute('aria-hidden', 'true');
    const ctx = canvas.getContext && canvas.getContext('2d');
    if (!ctx) return;
    host.insertBefore(canvas, host.firstChild);

    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    const RAIL = 56 * Math.SQRT2; // rails x + y = c, 56px apart
    let w = 0, h = 0, streaks = [], raf = 0, last = 0, visible = true;

    const spawn = (s, fresh) => {
      const rails = Math.floor((w + h) / RAIL);
      s.c = (1 + Math.floor(Math.random() * Math.max(rails, 1))) * RAIL;
      s.len = 70 + Math.random() * 170;
      s.speed = 28 + Math.random() * 46;           // px per second along x
      s.alpha = 0.16 + Math.random() * 0.3;
      s.gold = Math.random() < 0.35;
      const xStart = Math.max(0, s.c - h);
      const xEnd = Math.min(w, s.c);
      s.x = fresh ? xStart + Math.random() * (xEnd - xStart + s.len) : xStart - Math.random() * 240;
      return s;
    };
    const resize = () => {
      const r = host.getBoundingClientRect();
      w = r.width; h = r.height;
      canvas.width = Math.max(1, Math.round(w * dpr));
      canvas.height = Math.max(1, Math.round(h * dpr));
      const count = Math.max(6, Math.min(18, Math.round((w + h) / 110)));
      streaks = [];
      for (let i = 0; i < count; i++) streaks.push(spawn({}, true));
      draw();
    };
    const draw = () => {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      ctx.lineWidth = 1.2;
      ctx.lineCap = 'round';
      for (let i = 0; i < streaks.length; i++) {
        const s = streaks[i];
        const x0 = s.x - s.len;
        const rgb = s.gold ? '229,185,60' : '255,255,255';
        const g = ctx.createLinearGradient(x0, s.c - x0, s.x, s.c - s.x);
        g.addColorStop(0, 'rgba(' + rgb + ',0)');
        g.addColorStop(1, 'rgba(' + rgb + ',' + s.alpha + ')');
        ctx.strokeStyle = g;
        ctx.beginPath();
        ctx.moveTo(x0, s.c - x0);
        ctx.lineTo(s.x, s.c - s.x);
        ctx.stroke();
      }
    };
    const tick = (now) => {
      const dt = last ? Math.min((now - last) / 1000, 0.05) : 0;
      last = now;
      for (let i = 0; i < streaks.length; i++) {
        const s = streaks[i];
        s.x += s.speed * dt;
        if (s.x - s.len > Math.min(w, s.c)) spawn(s, false);
      }
      draw();
      raf = requestAnimationFrame(tick);
    };
    const play = () => { if (!raf && visible && !doc.hidden) { last = 0; raf = requestAnimationFrame(tick); } };
    const pause = () => { if (raf) cancelAnimationFrame(raf); raf = 0; };

    resize();
    if ('ResizeObserver' in window) new ResizeObserver(resize).observe(host);
    else window.addEventListener('resize', resize, { passive: true });
    if ('IntersectionObserver' in window) {
      new IntersectionObserver((entries) => {
        visible = entries[0].isIntersecting;
        visible ? play() : pause();
      }).observe(host);
    }
    doc.addEventListener('visibilitychange', () => (doc.hidden ? pause() : play()));
    play();
  }

  /* ---------- Split text into words (keeps the accessible name) ---------- */
  function splitWords(el) {
    const label = el.textContent.replace(/\s+/g, ' ').trim();
    const words = [];
    const walk = (node) => {
      Array.prototype.slice.call(node.childNodes).forEach((child) => {
        if (child.nodeType === 3) {
          const frag = doc.createDocumentFragment();
          child.textContent.split(/(\s+)/).forEach((part) => {
            if (!part) return;
            if (/^\s+$/.test(part)) { frag.appendChild(doc.createTextNode(part)); return; }
            const span = doc.createElement('span');
            span.className = 'split-word';
            span.setAttribute('aria-hidden', 'true');
            span.textContent = part;
            words.push(span);
            frag.appendChild(span);
          });
          child.parentNode.replaceChild(frag, child);
        } else if (child.nodeType === 1 && child.tagName !== 'BR') {
          walk(child);
        }
      });
    };
    walk(el);
    el.setAttribute('aria-label', label);
    return words;
  }

  /* ---------- Count-up ---------- */
  function countUp(gsap, el) {
    const raw = el.getAttribute('data-count') || el.textContent;
    const target = parseFloat(String(raw).replace(/[^0-9.\-]/g, ''));
    if (!isFinite(target)) return;
    const decimals = el.hasAttribute('data-count-decimals')
      ? parseInt(el.getAttribute('data-count-decimals'), 10) || 0
      : ((String(raw).split('.')[1] || '').replace(/\D/g, '').length);
    const prefix = el.getAttribute('data-count-prefix') || '';
    const suffix = el.getAttribute('data-count-suffix') || '';
    const fmt = new Intl.NumberFormat(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
    const finalText = prefix + fmt.format(target) + suffix;
    el.textContent = finalText;
    // Lock width at the final value so the roll never shifts layout.
    if (getComputedStyle(el).display === 'inline') el.style.display = 'inline-block';
    el.style.minWidth = el.getBoundingClientRect().width + 'px';
    el.style.fontVariantNumeric = 'tabular-nums';
    const state = { v: 0 };
    const run = () => gsap.to(state, {
      v: target, duration: 0.8, ease: 'power3.out',
      onUpdate: () => { el.textContent = prefix + fmt.format(state.v) + suffix; },
      onComplete: () => { el.textContent = finalText; },
    });
    el.textContent = prefix + fmt.format(0) + suffix;
    if (window.ScrollTrigger) window.ScrollTrigger.create({ trigger: el, start: 'top 92%', once: true, onEnter: run });
    else run();
  }

  /* ---------- Magnetic buttons (fine pointers) ---------- */
  function magnetic(gsap) {
    const movers = new WeakMap();
    let active = null;
    const get = (btn) => {
      let m = movers.get(btn);
      if (!m) {
        m = { x: gsap.quickTo(btn, 'x', { duration: 0.3, ease: 'power3.out' }), y: gsap.quickTo(btn, 'y', { duration: 0.3, ease: 'power3.out' }) };
        movers.set(btn, m);
      }
      return m;
    };
    const release = () => { if (active) { const m = get(active); m.x(0); m.y(0); active = null; } };
    doc.addEventListener('pointermove', (e) => {
      if (e.pointerType !== 'mouse') return;
      const btn = e.target.closest && e.target.closest('.button:not(.full):not([data-no-magnet]):not(:disabled)');
      if (btn !== active) release();
      if (!btn) return;
      active = btn;
      const r = btn.getBoundingClientRect();
      const dx = (e.clientX - (r.left + r.width / 2)) / (r.width / 2);
      const dy = (e.clientY - (r.top + r.height / 2)) / (r.height / 2);
      const m = get(btn);
      m.x(Math.max(-1, Math.min(1, dx)) * 4);
      m.y(Math.max(-1, Math.min(1, dy)) * 3);
    }, { passive: true });
    doc.addEventListener('pointerleave', release);
    window.addEventListener('blur', release);
  }

  /* ---------- Lenis smooth scroll ---------- */
  function smoothScroll(gsap) {
    if (!window.Lenis) return;
    qsa('.modal, .modal-content, .history-content, dialog, [data-scroll-container]').forEach((n) => n.setAttribute('data-lenis-prevent', ''));
    let lenis;
    try { lenis = new window.Lenis({ lerp: 0.12, smoothWheel: true, autoRaf: false }); } catch (err) { return; }
    Portal.lenis = lenis;
    if (gsap) {
      if (window.ScrollTrigger) lenis.on('scroll', window.ScrollTrigger.update);
      gsap.ticker.add((time) => lenis.raf(time * 1000));
      gsap.ticker.lagSmoothing(0);
    } else {
      const loop = (t) => { lenis.raf(t); requestAnimationFrame(loop); };
      requestAnimationFrame(loop);
    }
  }

  /* ---------- Entrances ---------- */
  // Shrinking gaps: 0, 60, 110, 150, 180, 200, 210ms... total stays under ~250ms.
  const staggerDelay = (i) => {
    let d = 0;
    for (let k = 1; k <= i; k++) d += Math.max(0.01, 0.07 - k * 0.01);
    return Math.min(d, 0.24);
  };

  function entrances(gsap) {
    const ST = window.ScrollTrigger;
    const heroes = qsa('[data-hero]');
    const inHero = (el) => heroes.some((h) => h !== el && h.contains(el));
    const targets = qsa(REVEAL_SEL).filter((el) => !inHero(el) && !el.closest('.modal, dialog'));

    // Hero timelines (the one authored moment: up to ~0.9s).
    heroes.forEach((hero) => {
      const kids = Array.prototype.slice.call(hero.children).filter((k) => !k.classList.contains('hero-lines'));
      const heading = hero.querySelector('[data-split]') || kids.find((k) => /^H[12]$/.test(k.tagName));
      const tl = gsap.timeline({ defaults: { ease: EASE } });
      let afterHeading = 0;
      kids.forEach((kid) => {
        const holdsHeading = heading && (kid === heading || kid.contains(heading));
        if (holdsHeading) {
          const words = splitWords(heading);
          if (kid !== heading) {
            qsa(':scope > *', kid).forEach((sib) => {
              if (sib === heading || sib.contains(heading)) return;
              gsap.set(sib, { opacity: 0, y: 8 });
              tl.to(sib, { opacity: 1, y: 0, duration: 0.5 }, 0.1 + 0.06 * afterHeading++);
            });
          }
          gsap.set(kid, { opacity: 1 });
          gsap.set(words, { opacity: 0, y: '0.45em' });
          tl.to(words, { opacity: 1, y: 0, duration: 0.6, stagger: Math.min(0.045, 0.3 / Math.max(words.length, 1)) }, 0);
        } else if (afterHeading === 0 && heading && (kid.compareDocumentPosition(heading) & Node.DOCUMENT_POSITION_FOLLOWING)) {
          // Decoration before the heading (brand, eyebrow): fade in place with the lead.
          gsap.set(kid, { opacity: 0 });
          tl.to(kid, { opacity: 1, duration: 0.4 }, 0);
        } else {
          const step = afterHeading++;
          gsap.set(kid, { opacity: 0, y: Math.max(4, 10 - step * 2) });
          tl.to(kid, { opacity: 1, y: 0, duration: 0.5, clearProps: 'transform' }, 0.1 + 0.06 * step);
        }
      });
    });

    gsap.set(targets, { opacity: 0, y: 12 });
    const reveal = (batch) => gsap.to(batch, {
      opacity: 1, y: 0, duration: 0.32, ease: EASE, overwrite: true,
      stagger: (i) => staggerDelay(i), clearProps: 'opacity,transform',
    });
    if (ST && targets.length) ST.batch(targets, { start: 'top 94%', once: true, onEnter: reveal });
    else if (targets.length) reveal(targets);
  }

  /* ---------- Init ---------- */
  function revealAll() { root.classList.remove('motion'); }

  onReady(() => {
    currentYear();
    wireDialogs();
    navIndicator();
    if (!reduced) qsa('.hero-band, .auth-aside, [data-hero-lines]').forEach(heroLines);

    const gsap = window.gsap;
    const ownsEntrance = root.classList.contains('motion');
    const late = performance.now() > 2200; // CSS failsafe already revealed content

    if (reduced || !gsap) {
      revealAll();
      if (!reduced) smoothScroll(null);
      return;
    }
    if (window.ScrollTrigger) gsap.registerPlugin(window.ScrollTrigger);
    smoothScroll(gsap);
    if (finePointer) magnetic(gsap);

    try {
      if (ownsEntrance && !late) {
        entrances(gsap);
        qsa('[data-count]').forEach((el) => countUp(gsap, el));
      }
    } catch (err) {
      gsap.set(qsa(REVEAL_SEL + ', [data-hero] > *, .split-word'), { clearProps: 'opacity,transform' });
    }
    revealAll();
    if (window.ScrollTrigger) window.addEventListener('load', () => window.ScrollTrigger.refresh(), { once: true });
  });

  Portal.refresh = () => { if (window.ScrollTrigger) window.ScrollTrigger.refresh(); };
})();
