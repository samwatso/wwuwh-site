// ============================================
// WWUWH Scrollytelling + Framed Hero (IntegratedBio-style)
// ============================================

(() => {
  'use strict';

  document.documentElement.classList.add('js');

  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const root = document.documentElement;
  const header = document.getElementById('main-header');
  const scrollyContainer = document.querySelector('.scrolly-container');
  const heroOverlay = document.querySelector('.hero-overlay');
  const heroVideo = document.querySelector('.hero-video');

  // ------------------------------------------------
  // Framed shell -> full-bleed transition
  // ------------------------------------------------
  let frameStartGap = 16;
  let frameStartRadius = 28;

  function computeFrameDefaults() {
    frameStartGap = window.innerWidth >= 768 ? 22 : 16;
    frameStartRadius = window.innerWidth >= 768 ? 34 : 28;
  }

  function clamp(v, min, max) {
    return Math.min(Math.max(v, min), max);
  }

  function updateFrame() {
    // Collapse the "frame" quickly as the user starts scrolling.
    // Range tuned to feel like IntegratedBio.
    const range = 240;
    const y = window.scrollY || 0;
    const p = clamp(y / range, 0, 1);

    const gap = frameStartGap * (1 - p);
    const radius = frameStartRadius * (1 - p);

    root.style.setProperty('--frame-gap', `${gap.toFixed(2)}px`);
    root.style.setProperty('--frame-radius', `${radius.toFixed(2)}px`);

    // Subtle border/shadow blending as the frame disappears
    const borderA = (0.32 * (1 - p)) + (0.08 * p);
    root.style.setProperty('--frame-border', `rgba(255,255,255,${borderA.toFixed(3)})`);

    const shadowA = (0.35 * (1 - p)) + (0.18 * p);
    root.style.setProperty('--frame-shadow', `0 20px 80px rgba(0,0,0,${shadowA.toFixed(3)})`);

    if (header) {
      if (y > 30) header.classList.add('scrolled');
      else header.classList.remove('scrolled');
    }
  }

  // ------------------------------------------------
  // Hero overlay fade (keeps text readable at top, reveals video as you scroll)
  // ------------------------------------------------
  function updateHeroOverlay() {
    if (!heroOverlay || !scrollyContainer || prefersReducedMotion) return;

    const containerTop = scrollyContainer.offsetTop;
    const containerH = scrollyContainer.offsetHeight;
    const viewportH = window.innerHeight;

    const y = (window.scrollY || 0) - containerTop;
    const denom = Math.max(containerH - viewportH, 1);
    const p = clamp(y / denom, 0, 1);

    const opacity = 0.85 - (p * 0.25); // 0.85 -> 0.60
    heroOverlay.style.opacity = opacity.toFixed(3);
  }

  // ------------------------------------------------
  // Mobile nav toggle
  // ------------------------------------------------
  const navToggle = document.querySelector('.nav-toggle');
  const navMenu = document.querySelector('.nav-menu');

  function closeNav() {
    if (!navMenu || !navToggle) return;
    navMenu.classList.remove('active');
    navToggle.setAttribute('aria-expanded', 'false');
  }

  if (navToggle && navMenu) {
    navToggle.addEventListener('click', () => {
      const expanded = navToggle.getAttribute('aria-expanded') === 'true';
      navToggle.setAttribute('aria-expanded', String(!expanded));
      navMenu.classList.toggle('active');
    });

    navMenu.querySelectorAll('a').forEach((a) => a.addEventListener('click', closeNav));

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') closeNav();
    });
  }

  function handleNavResize() {
    if (window.innerWidth >= 768) closeNav();
  }

  // ------------------------------------------------
  // Scrollytelling: active chapter class
  // ------------------------------------------------
  const chapters = Array.from(document.querySelectorAll('.chapter'));

  function initChapterObserver() {
    if (!chapters.length) return;

    if (prefersReducedMotion) {
      chapters.forEach((c) => c.classList.add('is-active'));
      return;
    }

    const chapterObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting && entry.intersectionRatio > 0.4) {
            chapters.forEach((ch) => ch.classList.remove('is-active'));
            entry.target.classList.add('is-active');
          }
        });
      },
      { root: null, rootMargin: '-22% 0px -22% 0px', threshold: [0, 0.25, 0.5, 0.75, 1] }
    );

    chapters.forEach((c) => chapterObserver.observe(c));
    if (chapters[0]) chapters[0].classList.add('is-active');
  }

  // ------------------------------------------------
  // Video: pause when not visible (performance)
  // ------------------------------------------------
  function initVideoObserver() {
    if (!heroVideo || prefersReducedMotion) return;

    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            heroVideo.play().catch(() => {});
          } else {
            heroVideo.pause();
          }
        });
      },
      { threshold: 0.25 }
    );

    io.observe(heroVideo);
  }

  // ------------------------------------------------
  // Smooth scroll for anchor links
  // ------------------------------------------------
  document.querySelectorAll('a[href^="#"]').forEach((anchor) => {
    anchor.addEventListener('click', (e) => {
      const id = anchor.getAttribute('href');
      if (!id || id === '#') return;

      const target = document.querySelector(id);
      if (!target) return;

      e.preventDefault();
      closeNav();
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  });

  // ------------------------------------------------
  // RAF-throttled scroll handler
  // ------------------------------------------------
  let ticking = false;

  function onScroll() {
    if (ticking) return;
    ticking = true;
    window.requestAnimationFrame(() => {
      updateFrame();
      updateHeroOverlay();
      ticking = false;
    });
  }

  // ------------------------------------------------
  // Init
  // ------------------------------------------------
  computeFrameDefaults();
  updateFrame();
  updateHeroOverlay();
  initChapterObserver();
  initVideoObserver();
  handleNavResize();

  window.addEventListener('scroll', onScroll, { passive: true });

  let resizeTimer;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      computeFrameDefaults();
      updateFrame();
      updateHeroOverlay();
      handleNavResize();
    }, 150);
  });
})();