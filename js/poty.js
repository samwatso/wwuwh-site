/**
 * POTY Page - Gallery Carousel
 * Horizontal scroll carousel with arrow navigation
 */

(function () {
  'use strict';

  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function initGalleryCarousel() {
    const wrapper = document.querySelector('.poty-gallery-wrapper');
    if (!wrapper) return;

    const carousel = wrapper.querySelector('.poty-gallery-carousel');
    const track = wrapper.querySelector('.poty-gallery-track');
    const prevBtn = wrapper.querySelector('.poty-gallery-nav--prev');
    const nextBtn = wrapper.querySelector('.poty-gallery-nav--next');

    if (!carousel || !track || !prevBtn || !nextBtn) return;

    const items = track.querySelectorAll('.poty-gallery-item');
    if (!items.length) return;

    // Get item width including gap
    function getScrollAmount() {
      const item = items[0];
      const style = getComputedStyle(track);
      const gap = parseInt(style.gap) || 16;
      return item.offsetWidth + gap;
    }

    // Update button states based on scroll position
    function updateButtons() {
      const scrollLeft = carousel.scrollLeft;
      const maxScroll = carousel.scrollWidth - carousel.clientWidth;

      prevBtn.disabled = scrollLeft <= 0;
      nextBtn.disabled = scrollLeft >= maxScroll - 1;
    }

    // Scroll by one item
    function scrollBy(direction) {
      const amount = getScrollAmount() * direction;
      
      if (prefersReducedMotion) {
        carousel.scrollLeft += amount;
      } else {
        carousel.scrollBy({
          left: amount,
          behavior: 'smooth'
        });
      }
    }

    // Event listeners
    prevBtn.addEventListener('click', function () {
      scrollBy(-1);
    });

    nextBtn.addEventListener('click', function () {
      scrollBy(1);
    });

    // Update buttons on scroll
    let scrollTimeout;
    carousel.addEventListener('scroll', function () {
      if (scrollTimeout) {
        cancelAnimationFrame(scrollTimeout);
      }
      scrollTimeout = requestAnimationFrame(updateButtons);
    }, { passive: true });

    // Update buttons on resize
    let resizeTimeout;
    window.addEventListener('resize', function () {
      if (resizeTimeout) {
        clearTimeout(resizeTimeout);
      }
      resizeTimeout = setTimeout(updateButtons, 100);
    });

    // Keyboard navigation when carousel is focused
    carousel.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        scrollBy(-1);
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        scrollBy(1);
      }
    });

    // Initial state
    updateButtons();
  }

  // Initialize on DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initGalleryCarousel);
  } else {
    initGalleryCarousel();
  }
})();