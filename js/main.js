// Everything the page does on scroll that is not the 3D scene. The HTML is
// complete without this file: entrance states are only applied from here, so a
// failure leaves a plain readable page rather than a blank one.

import { createAvatar } from './avatar.js';
import { createStack } from './stack.js';

const { gsap, ScrollTrigger, Lenis } = window;
const root = document.documentElement;
const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];

gsap.registerPlugin(ScrollTrigger);

function supportsWebGL() {
  try { return !!document.createElement('canvas').getContext('webgl2'); } catch { return false; }
}

let avatar = null;
if (supportsWebGL()) {
  try {
    avatar = createAvatar($('#scene'), { reduced });
    createStack($('#stack-canvas'), $('#stack'), { reduced });
  } catch (e) {
    console.warn('3D scene unavailable', e);
    avatar = null;
  }
}
if (!avatar) root.classList.add('no-webgl');

// Smooth scrolling, driven from GSAP's ticker so pins and the scene stay in step.
let lenis = null;
if (!reduced) {
  lenis = new Lenis({ lerp: 0.1, smoothWheel: true });
  lenis.on('scroll', ScrollTrigger.update);
  gsap.ticker.add((t) => lenis.raf(t * 1000));
  gsap.ticker.lagSmoothing(0);
}
$$('a[href^="#"]').forEach((a) => {
  a.addEventListener('click', (e) => {
    const target = $(a.getAttribute('href'));
    if (!target) return;
    e.preventDefault();
    if (lenis) lenis.scrollTo(target, { duration: 1.6 });
    else target.scrollIntoView();
  });
});

// Hero role: the outgoing word rises and hollows into an outline above the new one.
const roles = $$('.role-word');
if (!reduced && roles.length > 1) {
  let on = 0;
  $('.role').classList.add('cycling');
  roles.forEach((r, i) => { r.classList.toggle('is-on', i === 0); r.classList.toggle('is-up', i === roles.length - 1); });
  setInterval(() => {
    const prev = on;
    on = (on + 1) % roles.length;
    roles.forEach((r, i) => {
      r.classList.toggle('is-on', i === on);
      r.classList.toggle('is-up', i === prev);
    });
  }, 2600);
}

// Paragraphs that light up word by word as they scroll through.
$$('[data-words]').forEach((p) => {
  if (reduced) return;
  const words = p.textContent.trim().split(/\s+/);
  p.setAttribute('aria-label', p.textContent.trim());
  p.innerHTML = words.map((w) => `<span aria-hidden="true" class="w">${w} </span>`).join('');
  gsap.fromTo($$('.w', p), { opacity: 0.16 }, {
    opacity: 1, stagger: 0.05, ease: 'none',
    scrollTrigger: { trigger: p, start: 'top 82%', end: 'bottom 52%', scrub: 0.6 },
  });
});

if (!reduced) {
  $$('[data-rise]').forEach((el) => {
    gsap.from(el, {
      y: 46, opacity: 0, duration: 1, ease: 'power3.out',
      scrollTrigger: { trigger: el, start: 'top 88%', once: true },
    });
  });

  // Career: the line draws itself and each stop lights as the tip reaches it.
  const line = $('.line-fill');
  const list = $('.stops');
  gsap.fromTo(line, { scaleY: 0 }, {
    scaleY: 1, ease: 'none',
    scrollTrigger: { trigger: list, start: 'top 60%', end: 'bottom 60%', scrub: 0.5 },
  });
  $$('.stop').forEach((row) => {
    ScrollTrigger.create({ trigger: row, start: 'top 60%', onToggle: (s) => row.classList.toggle('lit', s.isActive || s.progress === 1), end: 'max' });
    gsap.from(row.children, {
      y: 26, opacity: 0, duration: 0.8, stagger: 0.07, ease: 'power3.out',
      scrollTrigger: { trigger: row, start: 'top 84%', once: true },
    });
  });

  // Work: pinned, sliding sideways, on screens wide enough to hold a panel.
  gsap.matchMedia().add('(min-width: 900px)', () => {
    const track = $('.work-track');
    const distance = () => track.scrollWidth - window.innerWidth;
    const slide = gsap.to(track, {
      x: () => -distance(), ease: 'none',
      scrollTrigger: {
        trigger: '#work', pin: true, start: 'top top',
        end: () => `+=${distance()}`, scrub: 0.7, invalidateOnRefresh: true,
        onUpdate: (s) => {
          const n = Math.min($$('.panel').length - 1, Math.round(s.progress * ($$('.panel').length - 1)));
          $$('.work-dots i').forEach((d, i) => d.classList.toggle('on', i === n));
        },
      },
    });
    $$('.panel').forEach((p) => {
      gsap.from(p.querySelector('.panel-art'), {
        scale: 0.88, opacity: 0.2, ease: 'none',
        scrollTrigger: { trigger: p, containerAnimation: slide, start: 'left 95%', end: 'left 40%', scrub: true },
      });
    });
  });
}

// Resume: read it in place. The links still point at the PDF, so without this
// (or without <dialog>) they simply open it in a new tab.
const cv = $('.cv');
if (cv && typeof cv.showModal === 'function') {
  const page = $('.cv-page', cv);
  const pdf = 'Shamith-Poojari-Resume.pdf';
  const fill = () => {
    if (page.firstChild) return;
    // Phones mostly cannot draw a PDF inside a page, so they get a picture of it.
    if (navigator.pdfViewerEnabled) {
      page.innerHTML = `<iframe src="${pdf}#view=FitH" title="Shamith S Poojari's resume"></iframe>`;
    } else {
      page.innerHTML = `<img src="img/resume.png" width="2000" height="2828" alt="Shamith S Poojari's resume">`;
    }
  };
  const open = (e) => {
    e.preventDefault();
    fill();
    lenis?.stop();
    cv.showModal();
  };
  $$('[data-cv-open]').forEach((a) => a.addEventListener('click', open));
  $('.cv-close', cv).addEventListener('click', () => cv.close());
  // A click on the dimmed backdrop lands on the dialog itself.
  cv.addEventListener('click', (e) => { if (e.target === cv) cv.close(); });
  cv.addEventListener('close', () => lenis?.start());
}

// What I do: one open at a time, on hover where there is hover.
const cards = $$('.card');
const openCard = (card) => cards.forEach((c) => {
  const open = c === card;
  c.classList.toggle('open', open);
  $('button', c).setAttribute('aria-expanded', String(open));
});
if (cards.length) {
  openCard(cards[0]);
  cards.forEach((c) => {
    $('button', c).addEventListener('click', () => openCard(c));
    if (finePointer) c.addEventListener('pointerenter', () => openCard(c));
  });
}

// A soft glowing dot for a cursor, swelling over anything clickable.
if (finePointer && !reduced) {
  const dot = $('.cursor');
  root.classList.add('has-cursor');
  const x = gsap.quickTo(dot, 'x', { duration: 0.28, ease: 'power3' });
  const y = gsap.quickTo(dot, 'y', { duration: 0.28, ease: 'power3' });
  window.addEventListener('pointermove', (e) => { x(e.clientX); y(e.clientY); dot.style.opacity = 1; }, { passive: true });
  document.addEventListener('pointerover', (e) => {
    dot.classList.toggle('big', !!e.target.closest('a, button'));
    dot.classList.toggle('text', !!e.target.closest('h1, h2, .role'));
  });
}

ScrollTrigger.addEventListener('refresh', () => avatar && avatar.measure());
window.addEventListener('load', () => ScrollTrigger.refresh());
// Cards opening and closing change the page's height, and everything below them
// is positioned from measurements, so measure again whenever the height settles.
let lastHeight = 0, settle = 0;
new ResizeObserver(() => {
  const h = document.body.offsetHeight;
  if (h === lastHeight) return;
  lastHeight = h;
  clearTimeout(settle);
  settle = setTimeout(() => ScrollTrigger.refresh(), 250);
}).observe(document.body);
document.fonts?.ready.then(() => ScrollTrigger.refresh());

// Loader: a hash settling, character by character, onto the real SHA-256 of my
// name, then the curtain lifts and the character rises into frame.
async function nameHash() {
  try {
    const raw = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('Shamith S Poojari'));
    return [...new Uint8Array(raw)].map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, 32);
  } catch {
    return 'a78bfa'.repeat(6).slice(0, 32);
  }
}

function entrance() {
  avatar?.play();
  if (reduced) return;
  gsap.from('.hero-left > *, .hero-right > *', { y: 44, opacity: 0, duration: 1.1, stagger: 0.09, ease: 'power3.out', delay: 0.25 });
  gsap.from('.nav > *, .rail', { opacity: 0, duration: 1, delay: 0.7 });
}

async function runLoader() {
  const el = $('.loader');
  if (reduced || !el) { el?.remove(); entrance(); return; }
  const out = $('.loader-hash'), count = $('.loader-count');
  const hash = await nameHash();
  const hex = '0123456789abcdef';
  const start = performance.now(), length = 1500;
  await new Promise((done) => {
    const id = setInterval(() => {
      const t = Math.min(1, (performance.now() - start) / length);
      const fixed = Math.floor(t * hash.length);
      let s = hash.slice(0, fixed);
      for (let i = fixed; i < hash.length; i++) s += hex[Math.floor(Math.random() * 16)];
      out.textContent = s;
      count.textContent = `${Math.round(t * 100)}%`;
      if (t >= 1) { clearInterval(id); done(); }
    }, 40);
  });
  $('.loader-status').textContent = 'verified';
  await new Promise((r) => setTimeout(r, 260));
  entrance();
  el.classList.add('done');
  setTimeout(() => el.remove(), 1100);
}

window.__booted = true;
runLoader();
