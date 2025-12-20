/**
 * WWUWH Scroll Interactions
 * - Scrolly 01/02/03 section activation with sticky rail
 * - Lazy-load Behold Instagram widget
 * - Progress line animation
 */

(function () {
  'use strict';

  // ----------------------------------------
  // Configuration
  // ----------------------------------------
  const BEHOLD_SCRIPT_URL = 'https://w.behold.so/widget.js';
  const INSTAGRAM_THRESHOLD = 0.1;

  // Check reduced motion preference
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Track if Behold script has been loaded
  let beholdLoaded = false;

  // ----------------------------------------
  // Utility: Safe query selector
  // ----------------------------------------
  function $(selector, context) {
    return (context || document).querySelector(selector);
  }

  function $$(selector, context) {
    return Array.from((context || document).querySelectorAll(selector));
  }

  // ----------------------------------------
  // Behold Instagram Widget Loader
  // ----------------------------------------
  function loadBeholdScript() {
    if (beholdLoaded) return;
    beholdLoaded = true;

    try {
      const script = document.createElement('script');
      script.type = 'module';
      script.src = BEHOLD_SCRIPT_URL;
      script.onerror = function () {
        beholdLoaded = false;
      };
      document.body.appendChild(script);
    } catch (e) {
      beholdLoaded = false;
    }
  }

  function initInstagramLazyLoad() {
    const instagramSection = $('#instagram');
    if (!instagramSection) return;

    // Remove any static script tag (we load dynamically)
    const existingScript = $('script[src*="behold.so"]');
    if (existingScript) {
      existingScript.remove();
    }

    if ('IntersectionObserver' in window) {
      const observer = new IntersectionObserver(
        function (entries) {
          entries.forEach(function (entry) {
            if (entry.isIntersecting) {
              loadBeholdScript();
              observer.disconnect();
            }
          });
        },
        {
          rootMargin: '200px 0px',
          threshold: INSTAGRAM_THRESHOLD
        }
      );
      observer.observe(instagramSection);
    } else {
      loadBeholdScript();
    }
  }

  // ----------------------------------------
  // Scrolly 01/02/03 Section
  // ----------------------------------------
  function initScrollySection() {
    const scrollySection = $('#scrolly-steps');
    const scrollyWrapper = $('.scrolly-wrapper');
    if (!scrollySection || !scrollyWrapper) return;

    const steps = $$('.scrolly-step');
    const numbers = $$('.scrolly-number');
    const progressLine = $('.scrolly-progress-line');
    const rail = $('.scrolly-rail');

    if (!steps.length) return;

    // Track which step is currently active
    let activeStep = 0;

    // Reduced motion: show all as active, no scroll-linked changes
    if (prefersReducedMotion) {
      steps.forEach(function (step) {
        step.classList.add('is-active');
      });
      numbers.forEach(function (num) {
        num.classList.add('is-active');
      });
      if (progressLine) {
        progressLine.style.height = '100%';
      }
      return;
    }

    // Set initial state
    if (steps[0]) {
      steps[0].classList.add('is-active');
    }
    if (numbers[0]) {
      numbers[0].classList.add('is-active');
    }

    // IntersectionObserver for step activation
    if ('IntersectionObserver' in window) {
      
      // Observer for individual steps
      const stepObserver = new IntersectionObserver(
        function (entries) {
          // Find the most visible step
          let mostVisibleStep = null;
          let maxRatio = 0;

          entries.forEach(function (entry) {
            if (entry.isIntersecting && entry.intersectionRatio > maxRatio) {
              maxRatio = entry.intersectionRatio;
              mostVisibleStep = entry.target;
            }
          });

          // Also check all currently observed steps
          steps.forEach(function (step) {
            const rect = step.getBoundingClientRect();
            const viewportCenter = window.innerHeight / 2;
            const stepCenter = rect.top + rect.height / 2;
            const distanceFromCenter = Math.abs(viewportCenter - stepCenter);
            
            // If step is in viewport and closer to center
            if (rect.top < window.innerHeight && rect.bottom > 0) {
              if (!mostVisibleStep || distanceFromCenter < Math.abs(viewportCenter - (mostVisibleStep.getBoundingClientRect().top + mostVisibleStep.getBoundingClientRect().height / 2))) {
                mostVisibleStep = step;
              }
            }
          });

          if (mostVisibleStep) {
            const stepNum = parseInt(mostVisibleStep.getAttribute('data-step'), 10);
            if (stepNum !== activeStep) {
              updateActiveStep(stepNum);
            }
          }
        },
        {
          rootMargin: '-30% 0px -30% 0px',
          threshold: [0, 0.25, 0.5, 0.75, 1]
        }
      );

      steps.forEach(function (step) {
        stepObserver.observe(step);
      });

      // Also use scroll listener for smoother updates
      let ticking = false;
      window.addEventListener('scroll', function () {
        if (!ticking) {
          window.requestAnimationFrame(function () {
            updateOnScroll();
            ticking = false;
          });
          ticking = true;
        }
      }, { passive: true });

    } else {
      // Fallback: show all steps
      steps.forEach(function (step) {
        step.classList.add('is-active');
      });
      numbers.forEach(function (num) {
        num.classList.add('is-active');
      });
      if (progressLine) {
        progressLine.style.height = '100%';
      }
    }

    function updateOnScroll() {
      const viewportCenter = window.innerHeight / 2;
      let closestStep = null;
      let closestDistance = Infinity;

      steps.forEach(function (step) {
        const rect = step.getBoundingClientRect();
        
        // Only consider steps that are at least partially visible
        if (rect.bottom > 0 && rect.top < window.innerHeight) {
          const stepCenter = rect.top + rect.height / 2;
          const distance = Math.abs(viewportCenter - stepCenter);
          
          if (distance < closestDistance) {
            closestDistance = distance;
            closestStep = step;
          }
        }
      });

      if (closestStep) {
        const stepNum = parseInt(closestStep.getAttribute('data-step'), 10);
        if (stepNum !== activeStep) {
          updateActiveStep(stepNum);
        }
      }
    }

    function updateActiveStep(stepNum) {
      activeStep = stepNum;

      // Update step panels
      steps.forEach(function (step) {
        const num = parseInt(step.getAttribute('data-step'), 10);
        if (num <= stepNum) {
          step.classList.add('is-active');
        } else {
          step.classList.remove('is-active');
        }
      });

      // Update numbers in rail
      numbers.forEach(function (numEl) {
        const num = parseInt(numEl.getAttribute('data-step'), 10);
        if (num <= stepNum) {
          numEl.classList.add('is-active');
        } else {
          numEl.classList.remove('is-active');
        }
      });

      // Update progress line
      if (progressLine) {
        const progress = (stepNum / steps.length) * 100;
        progressLine.style.height = progress + '%';
      }
    }
  }

  // ----------------------------------------
  // Hero Scroll Cue Hide on Scroll
  // ----------------------------------------
  function initHeroScrollCue() {
    const scrollCue = $('.hero-scroll-cue');
    if (!scrollCue) return;

    let hidden = false;

    function handleScroll() {
      if (hidden) return;

      if (window.scrollY > 100) {
        scrollCue.style.opacity = '0';
        scrollCue.style.pointerEvents = 'none';
        hidden = true;
        window.removeEventListener('scroll', handleScroll);
      }
    }

    window.addEventListener('scroll', handleScroll, { passive: true });
  }

  // ----------------------------------------
  // Smooth Scroll for Anchor Links
  // ----------------------------------------
  function initSmoothScroll() {
    if (prefersReducedMotion) return;

    const anchorLinks = $$('a[href^="#"]');

    anchorLinks.forEach(function (link) {
      link.addEventListener('click', function (e) {
        const href = link.getAttribute('href');
        if (!href || href === '#') return;

        const target = $(href);
        if (!target) return;

        e.preventDefault();

        const headerHeight = $('.site-header')?.offsetHeight || 0;
        const targetPosition = target.getBoundingClientRect().top + window.scrollY - headerHeight - 20;

        window.scrollTo({
          top: targetPosition,
          behavior: 'smooth'
        });

        if (history.pushState) {
          history.pushState(null, null, href);
        }
      });
    });
  }

  // ----------------------------------------
  // Section Fade-In on Scroll
  // ----------------------------------------
  function initSectionFadeIn() {
    if (prefersReducedMotion) return;

    const sections = $$('.section');
    if (!sections.length) return;

    if ('IntersectionObserver' in window) {
      const observer = new IntersectionObserver(
        function (entries) {
          entries.forEach(function (entry) {
            if (entry.isIntersecting) {
              entry.target.classList.add('is-visible');
              observer.unobserve(entry.target);
            }
          });
        },
        {
          rootMargin: '0px 0px -10% 0px',
          threshold: 0.1
        }
      );

      sections.forEach(function (section) {
        section.classList.add('section--animate');
        observer.observe(section);
      });
    }
  }

  // ----------------------------------------
  // Initialize
  // ----------------------------------------
  function init() {
    initInstagramLazyLoad();
    initScrollySection();
    initHeroScrollCue();
    initSmoothScroll();
    initSectionFadeIn();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();