// ============================================
// WWUWH Scrollytelling Interactions
// ============================================

(function() {
    'use strict';

    // Add .js class to enable JS-dependent styling
    document.documentElement.classList.add('js');

    // Check if user prefers reduced motion
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    // ============================================
    // Floating Nav: Scroll State
    // ============================================
    const header = document.getElementById('main-header');
    let lastScrollY = window.scrollY;

    function updateHeaderState() {
        const currentScrollY = window.scrollY;
        
        if (currentScrollY > 100) {
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
    // Scrollytelling: Chapter Progress
    // ============================================
    
    const chapters = document.querySelectorAll('.chapter');
    
    if (chapters.length > 0 && !prefersReducedMotion) {
        const observerOptions = {
            root: null,
            rootMargin: '-20% 0px -20% 0px', // Trigger when chapter is in middle 60% of viewport
            threshold: [0, 0.25, 0.5, 0.75, 1]
        };

        const chapterObserver = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting && entry.intersectionRatio > 0.4) {
                    // Remove active class from all chapters
                    chapters.forEach(ch => ch.classList.remove('is-active'));
                    
                    // Add active class to current chapter
                    entry.target.classList.add('is-active');
                    
                    // Log active chapter (dev only)
                    const chapterName = entry.target.getAttribute('data-chapter');
                    if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
                        console.log('Active chapter:', chapterName);
                    }
                }
            });
        }, observerOptions);

        // Observe all chapters
        chapters.forEach(chapter => {
            chapterObserver.observe(chapter);
        });

        // Set first chapter as active initially
        if (chapters[0]) {
            chapters[0].classList.add('is-active');
        }
    } else if (prefersReducedMotion) {
        // If reduced motion, show all chapters
        chapters.forEach(chapter => {
            chapter.classList.add('is-active');
        });
    }

    // ============================================
    // Hero Overlay Fade on Scroll
    // ============================================
    
    const heroOverlay = document.querySelector('.hero-overlay');
    const scrollyContainer = document.querySelector('.scrolly-container');
    
    if (heroOverlay && scrollyContainer && !prefersReducedMotion) {
        function updateHeroOverlay() {
            const scrollProgress = window.scrollY / (scrollyContainer.offsetHeight - window.innerHeight);
            const clampedProgress = Math.min(Math.max(scrollProgress, 0), 1);
            
            // Fade overlay slightly as user scrolls through chapters
            const overlayOpacity = 1 - (clampedProgress * 0.3); // Fade to 70%
            heroOverlay.style.opacity = overlayOpacity;
        }

        let overlayTicking = false;
        window.addEventListener('scroll', () => {
            if (!overlayTicking) {
                window.requestAnimationFrame(() => {
                    updateHeroOverlay();
                    overlayTicking = false;
                });
                overlayTicking = true;
            }
        });
    }

    // ============================================
    // Video: Pause when not in viewport (performance)
    // ============================================
    
    const heroVideo = document.querySelector('.hero-video');
    
    if (heroVideo && !prefersReducedMotion) {
        const videoObserver = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    heroVideo.play().catch(() => {
                        // Handle autoplay restrictions silently
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
    // Smooth Scroll for Anchor Links
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
    // Enhanced Text Visibility on Active Chapters
    // ============================================
    
    // This is handled by CSS transitions, but we can add
    // .is-visible class for additional control if needed
    chapters.forEach(chapter => {
        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    // Add visible class for additional animations if needed
                    const textElements = entry.target.querySelectorAll('.hero-text, .hero-cta, .session-layout');
                    textElements.forEach((el, index) => {
                        setTimeout(() => {
                            el.classList.add('is-visible');
                        }, index * 100);
                    });
                }
            });
        }, {
            threshold: 0.3
        });

        observer.observe(chapter);
    });

    // ============================================
    // Performance: Log viewport info (dev only)
    // ============================================
    
    if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
        console.log('WWUWH Scrollytelling Initialized');
        console.log('Viewport:', window.innerWidth, 'x', window.innerHeight);
        console.log('Reduced Motion:', prefersReducedMotion);
        console.log('Chapters found:', chapters.length);
    }

    // ============================================
    // Handle Window Resize (recalculate positions)
    // ============================================
    
    let resizeTimeout;
    window.addEventListener('resize', () => {
        clearTimeout(resizeTimeout);
        resizeTimeout = setTimeout(() => {
            handleNavResize();
            // Trigger observers to recalculate if needed
            if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
                console.log('Viewport resized:', window.innerWidth, 'x', window.innerHeight);
            }
        }, 250);
    });

})();
