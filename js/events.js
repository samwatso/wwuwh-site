/**
 * events.js — Calendar UI for WWUWH Events page
 * Fetches events from /api/calendar.json and renders a month-view calendar.
 * Week starts Monday. Respects prefers-reduced-motion.
 */

(function () {
  'use strict';

  // ========================================
  // CONFIG
  // ========================================
  const CONFIG = {
    apiEndpoint: 'https://wwuwh-calendar.sammartinwatson.workers.dev/api/calendar.json',
    icalUrl: 'https://calendar.google.com/calendar/ical/wwickhamuwh%40gmail.com/public/basic.ics',
    maxChipsPerDay: 3,
    weekdays: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
    monthNames: [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'
    ]
  };

  // ========================================
  // STATE
  // ========================================
  let state = {
    events: [],
    currentDate: new Date(),
    viewYear: new Date().getFullYear(),
    viewMonth: new Date().getMonth(),
    isLoading: true,
    hasError: false,
    reducedMotion: window.matchMedia('(prefers-reduced-motion: reduce)').matches
  };

  // ========================================
  // DOM REFERENCES
  // ========================================
  const dom = {};

  function cacheDom() {
    dom.grid = document.querySelector('.calendar-grid');
    dom.monthLabel = document.querySelector('.calendar-month-label');
    dom.loading = document.querySelector('.calendar-loading');
    dom.error = document.querySelector('.calendar-error');
    dom.prevBtn = document.querySelector('[data-calendar-nav="prev"]');
    dom.nextBtn = document.querySelector('[data-calendar-nav="next"]');
    dom.todayBtn = document.querySelector('[data-calendar-nav="today"]');
    dom.modal = document.getElementById('event-modal');
    dom.modalTitle = document.getElementById('event-modal-title');
    dom.modalLocation = dom.modal?.querySelector('.event-modal-location');
    dom.modalTime = dom.modal?.querySelector('.event-modal-time');
  }

  // ========================================
  // UTILITIES
  // ========================================

  /**
   * Parse ISO date string to Date object
   */
  function parseDate(str) {
    return new Date(str);
  }

  /**
   * Format date for display
   */
  function formatDate(date, includeTime = false) {
    const options = {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    };
    if (includeTime) {
      options.hour = '2-digit';
      options.minute = '2-digit';
    }
    return date.toLocaleDateString('en-GB', options);
  }

  /**
   * Format time range
   */
  function formatTimeRange(start, end, allDay) {
    if (allDay) return 'All day';

    const startDate = parseDate(start);
    const endDate = parseDate(end);

    const timeOpts = { hour: '2-digit', minute: '2-digit' };
    const startTime = startDate.toLocaleTimeString('en-GB', timeOpts);
    const endTime = endDate.toLocaleTimeString('en-GB', timeOpts);

    // Check if same day
    if (startDate.toDateString() === endDate.toDateString()) {
      return `${startTime} – ${endTime}`;
    }

    // Multi-day
    const dateOpts = { day: 'numeric', month: 'short' };
    return `${startDate.toLocaleDateString('en-GB', dateOpts)} ${startTime} – ${endDate.toLocaleDateString('en-GB', dateOpts)} ${endTime}`;
  }

  /**
   * Check if two dates are the same calendar day
   */
  function isSameDay(d1, d2) {
    return d1.getFullYear() === d2.getFullYear() &&
      d1.getMonth() === d2.getMonth() &&
      d1.getDate() === d2.getDate();
  }

  /**
   * Check if a date falls within a range (inclusive)
   */
  function isDateInRange(date, start, end) {
    const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const s = new Date(start.getFullYear(), start.getMonth(), start.getDate());
    const e = new Date(end.getFullYear(), end.getMonth(), end.getDate());
    return d >= s && d <= e;
  }

  /**
   * Get first day of month (adjusted for Monday start)
   * Returns 0 for Monday, 6 for Sunday
   */
  function getFirstDayOfMonth(year, month) {
    const day = new Date(year, month, 1).getDay();
    // Convert Sunday=0 to Sunday=6 (Monday=0)
    return day === 0 ? 6 : day - 1;
  }

  /**
   * Get number of days in a month
   */
  function getDaysInMonth(year, month) {
    return new Date(year, month + 1, 0).getDate();
  }

  /**
   * Get events for a specific date
   */
  function getEventsForDate(date) {
    return state.events.filter(event => {
      const start = parseDate(event.start);
      const end = parseDate(event.end);
      return isDateInRange(date, start, end);
    });
  }

  // ========================================
  // DATA FETCHING
  // ========================================

  async function fetchEvents() {
    setState({ isLoading: true, hasError: false });

    try {
      const response = await fetch(CONFIG.apiEndpoint);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();

      if (!data.events || !Array.isArray(data.events)) {
        throw new Error('Invalid data format');
      }

      setState({
        events: data.events,
        isLoading: false,
        hasError: false
      });

    } catch (err) {
      console.error('Failed to fetch calendar events:', err);
      setState({
        events: [],
        isLoading: false,
        hasError: true
      });
    }
  }

  // ========================================
  // STATE MANAGEMENT
  // ========================================

  function setState(updates) {
    Object.assign(state, updates);
    render();
  }

  // ========================================
  // RENDERING
  // ========================================

  function render() {
    renderLoading();
    renderError();
    renderMonthLabel();
    renderGrid();
  }

  function renderLoading() {
    if (dom.loading) {
      dom.loading.setAttribute('aria-hidden', !state.isLoading);
    }
  }

  function renderError() {
    if (dom.error) {
      dom.error.setAttribute('aria-hidden', !state.hasError);
    }
    if (dom.grid) {
      dom.grid.style.display = state.hasError ? 'none' : '';
    }
  }

  function renderMonthLabel() {
    if (dom.monthLabel) {
      dom.monthLabel.textContent = `${CONFIG.monthNames[state.viewMonth]} ${state.viewYear}`;
    }
  }

  function renderGrid() {
    if (!dom.grid || state.isLoading || state.hasError) return;

    const year = state.viewYear;
    const month = state.viewMonth;
    const today = new Date();

    const firstDay = getFirstDayOfMonth(year, month);
    const daysInMonth = getDaysInMonth(year, month);
    const daysInPrevMonth = getDaysInMonth(year, month - 1);

    // Clear grid
    dom.grid.innerHTML = '';

    // Calculate total cells needed (always 6 rows = 42 cells for consistent height)
    const totalCells = 42;

    for (let i = 0; i < totalCells; i++) {
      const cell = document.createElement('div');
      cell.className = 'calendar-cell';
      cell.setAttribute('role', 'gridcell');

      let dayNum;
      let cellDate;
      let isCurrentMonth = true;

      if (i < firstDay) {
        // Previous month
        dayNum = daysInPrevMonth - firstDay + i + 1;
        cellDate = new Date(year, month - 1, dayNum);
        isCurrentMonth = false;
        cell.classList.add('calendar-cell--other-month');
      } else if (i >= firstDay + daysInMonth) {
        // Next month
        dayNum = i - firstDay - daysInMonth + 1;
        cellDate = new Date(year, month + 1, dayNum);
        isCurrentMonth = false;
        cell.classList.add('calendar-cell--other-month');
      } else {
        // Current month
        dayNum = i - firstDay + 1;
        cellDate = new Date(year, month, dayNum);
      }

      // Check if today
      if (isSameDay(cellDate, today)) {
        cell.classList.add('calendar-cell--today');
      }

      // Day number
      const dayLabel = document.createElement('span');
      dayLabel.className = 'calendar-day-num';
      dayLabel.textContent = dayNum;
      cell.appendChild(dayLabel);

      // Events for this day
      if (isCurrentMonth || true) { // Show events for all visible days
        const dayEvents = getEventsForDate(cellDate);

        if (dayEvents.length > 0) {
          const eventsContainer = document.createElement('div');
          eventsContainer.className = 'calendar-events';

          const visibleEvents = dayEvents.slice(0, CONFIG.maxChipsPerDay);
          const overflowCount = dayEvents.length - CONFIG.maxChipsPerDay;

          visibleEvents.forEach(event => {
            const chip = createEventChip(event, cellDate);
            eventsContainer.appendChild(chip);
          });

          if (overflowCount > 0) {
            const moreChip = document.createElement('button');
            moreChip.type = 'button';
            moreChip.className = 'calendar-event-chip calendar-event-chip--more';
            moreChip.textContent = `+${overflowCount} more`;
            moreChip.setAttribute('aria-label', `${overflowCount} more events`);
            moreChip.addEventListener('click', () => showDayOverview(cellDate, dayEvents));
            eventsContainer.appendChild(moreChip);
          }

          cell.appendChild(eventsContainer);
        }
      }

      dom.grid.appendChild(cell);
    }
  }

  function createEventChip(event, date) {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'calendar-event-chip';

    // Determine if multi-day
    const start = parseDate(event.start);
    const end = parseDate(event.end);
    const isMultiDay = !isSameDay(start, end);

    if (isMultiDay) {
      chip.classList.add('calendar-event-chip--multiday');
    }

    // Truncate title if needed
    const maxLen = 20;
    const title = event.title.length > maxLen
      ? event.title.substring(0, maxLen - 1) + '…'
      : event.title;

    chip.textContent = title;
    chip.setAttribute('aria-label', `${event.title}${event.location ? ' at ' + event.location : ''}`);

    chip.addEventListener('click', () => openEventModal(event));

    return chip;
  }

  function showDayOverview(date, events) {
    // For simplicity, show the first overflow event
    // Could expand to a list modal in future
    if (events.length > 0) {
      openEventModal(events[0]);
    }
  }

  // ========================================
  // MODAL
  // ========================================

  function openEventModal(event) {
    if (!dom.modal) return;

    // Populate modal
    if (dom.modalTitle) {
      dom.modalTitle.textContent = event.title;
    }

    if (dom.modalLocation) {
      if (event.location) {
        dom.modalLocation.textContent = event.location;
        dom.modalLocation.style.display = '';
      } else {
        dom.modalLocation.style.display = 'none';
      }
    }

    if (dom.modalTime) {
      const start = parseDate(event.start);
      const timeStr = formatTimeRange(event.start, event.end, event.allDay);
      const dateStr = formatDate(start);
      dom.modalTime.textContent = `${dateStr}${timeStr !== 'All day' ? ', ' + timeStr : ' (All day)'}`;
    }

    // Show modal
    dom.modal.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';

    // Focus trap - focus close button
    const closeBtn = dom.modal.querySelector('[data-modal-close]:not(.event-modal-backdrop)');
    if (closeBtn) {
      closeBtn.focus();
    }
  }

  function closeEventModal() {
    if (!dom.modal) return;

    dom.modal.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
  }

  // ========================================
  // NAVIGATION
  // ========================================

  function navigateMonth(direction) {
    let newMonth = state.viewMonth + direction;
    let newYear = state.viewYear;

    if (newMonth < 0) {
      newMonth = 11;
      newYear--;
    } else if (newMonth > 11) {
      newMonth = 0;
      newYear++;
    }

    setState({
      viewMonth: newMonth,
      viewYear: newYear
    });
  }

  function goToToday() {
    const today = new Date();
    setState({
      viewMonth: today.getMonth(),
      viewYear: today.getFullYear()
    });
  }

  // ========================================
  // EVENT HANDLERS
  // ========================================

  function bindEvents() {
    // Navigation buttons
    if (dom.prevBtn) {
      dom.prevBtn.addEventListener('click', () => navigateMonth(-1));
    }

    if (dom.nextBtn) {
      dom.nextBtn.addEventListener('click', () => navigateMonth(1));
    }

    if (dom.todayBtn) {
      dom.todayBtn.addEventListener('click', goToToday);
    }

    // Modal close handlers
    if (dom.modal) {
      const closeElements = dom.modal.querySelectorAll('[data-modal-close]');
      closeElements.forEach(el => {
        el.addEventListener('click', closeEventModal);
      });

      // Escape key
      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && dom.modal.getAttribute('aria-hidden') === 'false') {
          closeEventModal();
        }
      });
    }

    // Keyboard navigation for calendar
    if (dom.grid) {
      dom.grid.addEventListener('keydown', handleGridKeydown);
    }

    // Reduced motion preference changes
    const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    motionQuery.addEventListener('change', (e) => {
      state.reducedMotion = e.matches;
    });
  }

  function handleGridKeydown(e) {
    // Basic keyboard support for event chips
    if (e.key === 'Enter' || e.key === ' ') {
      if (e.target.classList.contains('calendar-event-chip')) {
        e.preventDefault();
        e.target.click();
      }
    }
  }

  // ========================================
  // INITIALIZATION
  // ========================================

  function init() {
    // Check if we're on the events page
    if (!document.body.classList.contains('page-events')) return;

    cacheDom();

    if (!dom.grid) {
      console.warn('Calendar grid not found');
      return;
    }

    bindEvents();
    render(); // Initial render with loading state
    fetchEvents();
  }

  // Run on DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();