(() => {
  const banner = document.getElementById("cookie-banner");
  if (!banner) return;

  const key = "wwuwh_cookie_choice";
  const existing = localStorage.getItem(key);

  // Show banner if no choice yet
  if (!existing) banner.setAttribute("aria-hidden", "false");

  banner.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-cookie-action]");
    if (!btn) return;

    localStorage.setItem(key, btn.dataset.cookieAction); // accept | decline
    banner.setAttribute("aria-hidden", "true");
  });
})();
