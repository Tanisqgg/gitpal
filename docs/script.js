/**
 * GitPal static site
 * - Mobile navigation toggle
 * - FAQ accordion
 * - Footer year
 * - Sticky-header offset for hash navigation
 */

(function () {
  "use strict";

  var headerEl = document.querySelector(".site-header");
  var navToggle = document.getElementById("nav-toggle");
  var primaryNav = document.getElementById("primary-nav");
  var yearEl = document.getElementById("year");

  if (yearEl) {
    yearEl.textContent = String(new Date().getFullYear());
  }

  function closeNav() {
    if (!primaryNav || !navToggle) return;
    primaryNav.classList.remove("is-open");
    navToggle.setAttribute("aria-expanded", "false");
  }

  function toggleNav() {
    if (!primaryNav || !navToggle) return;
    var open = primaryNav.classList.toggle("is-open");
    navToggle.setAttribute("aria-expanded", open ? "true" : "false");
  }

  if (navToggle && primaryNav) {
    navToggle.addEventListener("click", toggleNav);

    primaryNav.querySelectorAll('a[href^="#"]').forEach(function (link) {
      link.addEventListener("click", function () {
        if (window.matchMedia("(max-width: 880px)").matches) {
          closeNav();
        }
      });
    });

    document.addEventListener("keydown", function (event) {
      if (event.key === "Escape") closeNav();
    });
  }

  function headerOffset() {
    return headerEl ? headerEl.offsetHeight : 0;
  }

  function scrollToHash(hash, instant) {
    if (!hash || hash === "#") return;

    var target = document.querySelector(hash);
    if (!target) return;

    var top = target.getBoundingClientRect().top + window.scrollY - headerOffset() - 10;

    window.scrollTo({
      top: Math.max(0, top),
      behavior: instant ? "auto" : "smooth",
    });
  }

  document.querySelectorAll('a[href^="#"]').forEach(function (anchor) {
    anchor.addEventListener("click", function (event) {
      var href = anchor.getAttribute("href");

      if (!href || href === "#" || href.length < 2) return;
      if (!document.querySelector(href)) return;

      event.preventDefault();
      scrollToHash(href, false);

      if (history.replaceState) {
        history.replaceState(null, "", href);
      }
    });
  });

  if (window.location.hash) {
    window.requestAnimationFrame(function () {
      scrollToHash(window.location.hash, true);
    });
  }

  var accordionRoot = document.querySelector("[data-accordion]");

  if (accordionRoot) {
    var singleOpen = accordionRoot.getAttribute("data-single") !== "false";

    accordionRoot.querySelectorAll(".accordion-trigger").forEach(function (button) {
      button.addEventListener("click", function () {
        var expanded = button.getAttribute("aria-expanded") === "true";
        var panel = button.nextElementSibling;

        if (!panel || !panel.classList.contains("accordion-panel")) return;

        if (singleOpen && !expanded) {
          accordionRoot.querySelectorAll(".accordion-trigger").forEach(function (otherButton) {
            var otherPanel = otherButton.nextElementSibling;

            if (otherButton === button) return;

            otherButton.setAttribute("aria-expanded", "false");

            if (otherPanel && otherPanel.classList.contains("accordion-panel")) {
              otherPanel.setAttribute("hidden", "");
            }
          });
        }

        button.setAttribute("aria-expanded", expanded ? "false" : "true");

        if (expanded) {
          panel.setAttribute("hidden", "");
        } else {
          panel.removeAttribute("hidden");
        }
      });
    });
  }
})();
