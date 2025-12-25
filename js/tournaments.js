/**
 * Tournaments Page
 * - Lightbox/modal for map pin photos
 * - Keyboard navigation (Escape to close, arrow keys for images)
 * - Focus trap within modal
 * - Respects prefers-reduced-motion
 */

(function () {
  'use strict';

  // Check reduced motion preference
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ----------------------------------------
  // Element references
  // ----------------------------------------
  const lightbox = document.getElementById('lightbox');
  const lightboxBackdrop = lightbox?.querySelector('.lightbox-backdrop');
  const lightboxContent = lightbox?.querySelector('.lightbox-content');
  const lightboxClose = lightbox?.querySelector('.lightbox-close');
  const lightboxImages = lightbox?.querySelector('.lightbox-images');
  const lightboxCaption = document.getElementById('lightbox-caption');
  const lightboxPrev = lightbox?.querySelector('.lightbox-prev');
  const lightboxNext = lightbox?.querySelector('.lightbox-next');
  const lightboxCounter = lightbox?.querySelector('.lightbox-counter');
  const mapPins = document.querySelectorAll('.map-pin');

  // State
  let currentImages = [];
  let currentIndex = 0;
  let previouslyFocusedElement = null;

  // ----------------------------------------
  // Lightbox Functions
  // ----------------------------------------

  function openLightbox(images, caption) {
    if (!lightbox || !lightboxImages) return;

    // Store previously focused element for restoration
    previouslyFocusedElement = document.activeElement;

    // Parse images
    currentImages = images.split(',').map(src => src.trim());
    currentIndex = 0;

    // Build images
    lightboxImages.innerHTML = currentImages.map((src, index) => 
      `<img src="${src}" alt="Tournament photo ${index + 1}" class="lightbox-img ${index === 0 ? 'is-active' : ''}" loading="lazy">`
    ).join('');

    // Set caption
    if (lightboxCaption) {
      lightboxCaption.textContent = caption || '';
    }

    // Update nav visibility
    updateNavigation();

    // Show lightbox
    lightbox.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';

    // Focus close button
    setTimeout(() => {
      lightboxClose?.focus();
    }, prefersReducedMotion ? 0 : 100);
  }

  function closeLightbox() {
    if (!lightbox) return;

    lightbox.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';

    // Restore focus
    if (previouslyFocusedElement) {
      previouslyFocusedElement.focus();
      previouslyFocusedElement = null;
    }

    // Clear images
    if (lightboxImages) {
      lightboxImages.innerHTML = '';
    }
    currentImages = [];
    currentIndex = 0;
  }

  function showImage(index) {
    if (!lightboxImages) return;

    const images = lightboxImages.querySelectorAll('.lightbox-img');
    if (!images.length) return;

    // Clamp index
    if (index < 0) index = 0;
    if (index >= images.length) index = images.length - 1;

    currentIndex = index;

    // Update active state
    images.forEach((img, i) => {
      img.classList.toggle('is-active', i === currentIndex);
    });

    updateNavigation();
  }

  function nextImage() {
    if (currentIndex < currentImages.length - 1) {
      showImage(currentIndex + 1);
    }
  }

  function prevImage() {
    if (currentIndex > 0) {
      showImage(currentIndex - 1);
    }
  }

  function updateNavigation() {
    if (!lightboxPrev || !lightboxNext || !lightboxCounter) return;

    const total = currentImages.length;

    // Hide nav if single image
    const navContainer = lightbox?.querySelector('.lightbox-nav');
    if (navContainer) {
      navContainer.style.display = total <= 1 ? 'none' : 'flex';
    }

    // Update counter
    lightboxCounter.textContent = `${currentIndex + 1} / ${total}`;

    // Enable/disable buttons
    lightboxPrev.disabled = currentIndex === 0;
    lightboxNext.disabled = currentIndex === total - 1;
  }

  // ----------------------------------------
  // Focus Trap
  // ----------------------------------------

  function getFocusableElements() {
    if (!lightboxContent) return [];
    return Array.from(lightboxContent.querySelectorAll(
      'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
    ));
  }

  function handleTabKey(e) {
    const isOpen = lightbox?.getAttribute('aria-hidden') === 'false';
    if (!isOpen) return;

    const focusable = getFocusableElements();
    if (!focusable.length) return;

    const first = focusable[0];
    const last = focusable[focusable.length - 1];

    if (e.shiftKey) {
      // Shift + Tab
      if (document.activeElement === first) {
        e.preventDefault();
        last.focus();
      }
    } else {
      // Tab
      if (document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  }

  // ----------------------------------------
  // Event Listeners
  // ----------------------------------------

  function initMapPins() {
    mapPins.forEach(pin => {
      pin.addEventListener('click', function () {
        const images = this.dataset.images;
        const caption = this.dataset.caption;
        if (images) {
          openLightbox(images, caption);
        }
      });

      // Open on Enter key
      pin.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          const images = this.dataset.images;
          const caption = this.dataset.caption;
          if (images) {
            openLightbox(images, caption);
          }
        }
      });
    });
  }

  function initLightboxControls() {
    if (!lightbox) return;

    // Close button
    lightboxClose?.addEventListener('click', closeLightbox);

    // Backdrop click
    lightboxBackdrop?.addEventListener('click', closeLightbox);

    // Prev/Next buttons
    lightboxPrev?.addEventListener('click', prevImage);
    lightboxNext?.addEventListener('click', nextImage);

    // Keyboard navigation
    document.addEventListener('keydown', function (e) {
      const isOpen = lightbox.getAttribute('aria-hidden') === 'false';
      if (!isOpen) return;

      switch (e.key) {
        case 'Escape':
          e.preventDefault();
          closeLightbox();
          break;
        case 'ArrowLeft':
          e.preventDefault();
          prevImage();
          break;
        case 'ArrowRight':
          e.preventDefault();
          nextImage();
          break;
        case 'Tab':
          handleTabKey(e);
          break;
      }
    });

    // Prevent scrolling when lightbox is open
    lightboxContent?.addEventListener('wheel', function (e) {
      e.stopPropagation();
    });
  }

  // ----------------------------------------
  // Initialize
  // ----------------------------------------

  function init() {
    initMapPins();
    initLightboxControls();
  }

  // Run on DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();