/**
 * WWUWH Navigation
 * - Hamburger toggle (mobile menu)
 * - Mobile accordion (About submenu)
 * - Desktop dropdown (hover + keyboard focus)
 * - ARIA updates
 */

(function () {
  'use strict';

  // ----------------------------------------
  // Element references
  // ----------------------------------------
  const mobileToggle = document.querySelector('.nav-mobile-toggle');
  const mobileMenu = document.getElementById('mobile-menu');
  const desktopDropdownTrigger = document.querySelector('.nav-dropdown-trigger');
  const desktopDropdown = document.getElementById('about-dropdown');
  const desktopDropdownContainer = document.querySelector('.nav-item-dropdown');
  const mobileAccordionTrigger = document.querySelector('.nav-accordion-trigger');
  const mobileAccordionPanel = document.getElementById('about-accordion');

  // Check reduced motion preference
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ----------------------------------------
  // Utility: Update ARIA expanded state
  // ----------------------------------------
  function setExpanded(trigger, panel, expanded) {
    if (!trigger || !panel) return;
    
    trigger.setAttribute('aria-expanded', String(expanded));
    panel.setAttribute('aria-hidden', String(!expanded));
  }

  // ----------------------------------------
  // Mobile Menu (Hamburger)
  // ----------------------------------------
  function initMobileMenu() {
    if (!mobileToggle || !mobileMenu) return;

    mobileToggle.addEventListener('click', function () {
      const isExpanded = mobileToggle.getAttribute('aria-expanded') === 'true';
      const newState = !isExpanded;

      setExpanded(mobileToggle, mobileMenu, newState);

      // Close mobile accordion when closing menu
      if (!newState && mobileAccordionTrigger && mobileAccordionPanel) {
        setExpanded(mobileAccordionTrigger, mobileAccordionPanel, false);
      }
    });

    // Close mobile menu on Escape
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') {
        const isOpen = mobileToggle.getAttribute('aria-expanded') === 'true';
        if (isOpen) {
          setExpanded(mobileToggle, mobileMenu, false);
          mobileToggle.focus();
        }
      }
    });
  }

  // ----------------------------------------
  // Mobile Accordion (About submenu)
  // ----------------------------------------
  function initMobileAccordion() {
    if (!mobileAccordionTrigger || !mobileAccordionPanel) return;

    mobileAccordionTrigger.addEventListener('click', function (e) {
      e.preventDefault();
      const isExpanded = mobileAccordionTrigger.getAttribute('aria-expanded') === 'true';
      setExpanded(mobileAccordionTrigger, mobileAccordionPanel, !isExpanded);
    });
  }

  // ----------------------------------------
  // Desktop Dropdown (About submenu)
  // ----------------------------------------
  function initDesktopDropdown() {
    if (!desktopDropdownTrigger || !desktopDropdown || !desktopDropdownContainer) return;

    let closeTimeout = null;
    const CLOSE_DELAY = prefersReducedMotion ? 0 : 150;

    function openDropdown() {
      if (closeTimeout) {
        clearTimeout(closeTimeout);
        closeTimeout = null;
      }
      setExpanded(desktopDropdownTrigger, desktopDropdown, true);
    }

    function closeDropdown() {
      setExpanded(desktopDropdownTrigger, desktopDropdown, false);
    }

    function closeDropdownDelayed() {
      closeTimeout = setTimeout(closeDropdown, CLOSE_DELAY);
    }

    // Hover events on container
    desktopDropdownContainer.addEventListener('mouseenter', openDropdown);
    desktopDropdownContainer.addEventListener('mouseleave', closeDropdownDelayed);

    // Click toggle on trigger
    desktopDropdownTrigger.addEventListener('click', function (e) {
      e.preventDefault();
      const isExpanded = desktopDropdownTrigger.getAttribute('aria-expanded') === 'true';
      if (isExpanded) {
        closeDropdown();
      } else {
        openDropdown();
      }
    });

    // Keyboard: open on focus, close on blur (with delay for tab navigation)
    desktopDropdownTrigger.addEventListener('focus', openDropdown);

    // Handle focus within dropdown
    desktopDropdown.addEventListener('focusin', function () {
      if (closeTimeout) {
        clearTimeout(closeTimeout);
        closeTimeout = null;
      }
    });

    desktopDropdownContainer.addEventListener('focusout', function (e) {
      // Check if focus moved outside the dropdown container
      if (!desktopDropdownContainer.contains(e.relatedTarget)) {
        closeDropdownDelayed();
      }
    });

    // Close on Escape
    desktopDropdownContainer.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') {
        const isExpanded = desktopDropdownTrigger.getAttribute('aria-expanded') === 'true';
        if (isExpanded) {
          closeDropdown();
          desktopDropdownTrigger.focus();
        }
      }
    });

    // Arrow key navigation within dropdown
    desktopDropdown.addEventListener('keydown', function (e) {
      const links = desktopDropdown.querySelectorAll('.nav-dropdown-link');
      if (!links.length) return;

      const currentIndex = Array.from(links).indexOf(document.activeElement);

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        const nextIndex = currentIndex < links.length - 1 ? currentIndex + 1 : 0;
        links[nextIndex].focus();
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        const prevIndex = currentIndex > 0 ? currentIndex - 1 : links.length - 1;
        links[prevIndex].focus();
      }
    });
  }

  // ----------------------------------------
  // Click outside to close dropdowns
  // ----------------------------------------
  function initClickOutside() {
    document.addEventListener('click', function (e) {
      // Close desktop dropdown if clicking outside
      if (desktopDropdownContainer && desktopDropdownTrigger && desktopDropdown) {
        const isExpanded = desktopDropdownTrigger.getAttribute('aria-expanded') === 'true';
        if (isExpanded && !desktopDropdownContainer.contains(e.target)) {
          setExpanded(desktopDropdownTrigger, desktopDropdown, false);
        }
      }

      // Close mobile menu if clicking outside
      if (mobileToggle && mobileMenu) {
        const isOpen = mobileToggle.getAttribute('aria-expanded') === 'true';
        const header = document.querySelector('.site-header');
        if (isOpen && header && !header.contains(e.target)) {
          setExpanded(mobileToggle, mobileMenu, false);
          
          // Also close accordion
          if (mobileAccordionTrigger && mobileAccordionPanel) {
            setExpanded(mobileAccordionTrigger, mobileAccordionPanel, false);
          }
        }
      }
    });
  }

  // ----------------------------------------
  // Close mobile menu on resize to desktop
  // ----------------------------------------
  function initResizeHandler() {
    if (!mobileToggle || !mobileMenu) return;

    let resizeTimeout = null;
    const DESKTOP_BREAKPOINT = 1024;

    window.addEventListener('resize', function () {
      if (resizeTimeout) {
        clearTimeout(resizeTimeout);
      }

      resizeTimeout = setTimeout(function () {
        if (window.innerWidth >= DESKTOP_BREAKPOINT) {
          const isOpen = mobileToggle.getAttribute('aria-expanded') === 'true';
          if (isOpen) {
            setExpanded(mobileToggle, mobileMenu, false);
            
            if (mobileAccordionTrigger && mobileAccordionPanel) {
              setExpanded(mobileAccordionTrigger, mobileAccordionPanel, false);
            }
          }
        }
      }, 100);
    });
  }

  // ----------------------------------------
  // Initialize
  // ----------------------------------------
  function init() {
    initMobileMenu();
    initMobileAccordion();
    initDesktopDropdown();
    initClickOutside();
    initResizeHandler();
  }

  // Run on DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();

// Toggle "is-stuck" on the Kit TOC so the extended background only appears when sticky
(() => {
  const toc = document.querySelector(".kit-toc");
  if (!toc) return;

  const header = document.querySelector(".site-header");
  if (!header) return;

  const update = () => {
    const headerBottom = header.getBoundingClientRect().bottom;
    const tocTop = toc.getBoundingClientRect().top;
    const stuck = tocTop <= headerBottom + 1;
    toc.classList.toggle("is-stuck", stuck);
  };

  update();
  window.addEventListener("scroll", update, { passive: true });
  window.addEventListener("resize", update);
})();

// Update copyright year dynamically
(() => {
  const copyright = document.querySelector(".footer-copyright");
  if (!copyright) return;

  const currentYear = new Date().getFullYear();
  copyright.textContent = copyright.textContent.replace(/© \d{4}/, `© ${currentYear}`);
})();
