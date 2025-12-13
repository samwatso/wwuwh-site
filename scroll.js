// ============================================
// WWUWH Scroll Interactions
// ============================================

(function() {
‘use strict’;

```
// ============================================
// Floating Nav: Scroll State
// ============================================
const header = document.getElementById('main-header');
let lastScrollY = window.scrollY;

function updateHeaderState() {
    const currentScrollY = window.scrollY;
    
    if (currentScrollY > 50) {
        header.classList.add('scrolled');
    } else {
        header.classList.remove('scrolled');
    }
    
    lastScrollY = currentScrollY;
}

// Throttle scroll events for performance
let scrollTicking = false;
window.addEventListener('scroll', () => {
    if (!scrollTicking) {
        window.requestAnimationFrame(() => {
            updateHeaderState();
            scrollTicking = false;
        });
        scrollTicking = true;
    }
});

// Initialize
updateHeaderState();

// ============================================
// Mobile Nav Toggle
// ============================================
const navToggle = document.querySelector('.nav-toggle');
const navMenu = document.querySelector('.nav-menu');

if (navToggle && navMenu) {
    navToggle.addEventListener('click', () => {
        const isExpanded = navToggle.getAttribute('aria-expanded') === 'true';
        navToggle.setAttribute('aria-expanded', !isExpanded);
        navMenu.classList.toggle('active');
    });

    // Close menu when clicking a link
    const navLinks = navMenu.querySelectorAll('a');
    navLinks.forEach(link => {
        link.addEventListener('click', () => {
            navMenu.classList.remove('active');
            navToggle.setAttribute('aria-expanded', 'false');
        });
    });

    // Close menu on escape key
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && navMenu.classList.contains('active')) {
            navMenu.classList.remove('active');
            navToggle.setAttribute('aria-expanded', 'false');
        }
    });
}

// ============================================
// Desktop Nav Bug Fix
// ============================================
function handleNavResize() {
    if (window.innerWidth >= 768) {
        if (navMenu) {
            navMenu.classList.remove('active');
        }
        if (navToggle) {
            navToggle.setAttribute('aria-expanded', 'false');
        }
    }
}

window.addEventListener('resize', handleNavResize);
handleNavResize(); // Run on load

// ============================================
// Intersection Observer: Reveal Animations
// ============================================

// Check if user prefers reduced motion
const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

if (!prefersReducedMotion) {
    const observerOptions = {
        root: null,
        rootMargin: '0px 0px -100px 0px', // Trigger slightly before element enters viewport
        threshold: 0.15 // Trigger when 15% of element is visible
    };

    const revealObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('is-visible');
                // Optional: unobserve after reveal for performance
                // revealObserver.unobserve(entry.target);
            }
        });
    }, observerOptions);

    // Observe all reveal elements
    const revealElements = document.querySelectorAll('.reveal-fade, .reveal-slide, .reveal-scale');
    revealElements.forEach(el => {
        revealObserver.observe(el);
    });
} else {
    // If user prefers reduced motion, immediately show all elements
    const revealElements = document.querySelectorAll('.reveal-fade, .reveal-slide, .reveal-scale');
    revealElements.forEach(el => {
        el.classList.add('is-visible');
    });
}

// ============================================
// Video: Pause when not in viewport (optional optimization)
// ============================================
const heroVideo = document.querySelector('.hero-video');

if (heroVideo && !prefersReducedMotion) {
    const videoObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                heroVideo.play().catch(() => {
                    // Handle autoplay restrictions
                });
            } else {
                heroVideo.pause();
            }
        });
    }, {
        threshold: 0.25
    });

    videoObserver.observe(heroVideo);
}

// ============================================
// Smooth Scroll Polyfill for older browsers
// ============================================
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function(e) {
        const targetId = this.getAttribute('href');
        
        // Skip if it's just "#"
        if (targetId === '#') return;
        
        const targetElement = document.querySelector(targetId);
        
        if (targetElement) {
            e.preventDefault();
            
            // Close mobile menu if open
            if (navMenu && navMenu.classList.contains('active')) {
                navMenu.classList.remove('active');
                if (navToggle) {
                    navToggle.setAttribute('aria-expanded', 'false');
                }
            }
            
            // Smooth scroll to target
            targetElement.scrollIntoView({
                behavior: 'smooth',
                block: 'start'
            });
        }
    });
});

// ============================================
// Performance: Log viewport info (dev only)
// ============================================
if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
    console.log('WWUWH Scroll Interactions Initialized');
    console.log('Viewport:', window.innerWidth, 'x', window.innerHeight);
    console.log('Reduced Motion:', prefersReducedMotion);
}
```

})();
