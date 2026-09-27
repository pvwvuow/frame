/* Frame landing v6 — Netflix-grade product landing.
 * 1) release links + version from the public GitHub API (baked by update_site.py anyway);
 * 2) glass nav state;
 * 3) reveal-on-scroll;
 * 4) Top-10 row arrows (native snap scroll, RTL-aware).
 * No carousels, no autoplay, no heavy catalog — this page is intro + download.
 */
(function () {
  "use strict";
  document.documentElement.classList.add("js");

  /* ═══════════ 1) release links (unchanged contract) ═══════════ */
  var API = "https://api.github.com/repos/pvwvuow/frame/releases/latest";
  var FALLBACK = "https://github.com/pvwvuow/frame/releases/latest";

  function assetUrl(tag, name) {
    return "https://github.com/pvwvuow/frame/releases/download/" + tag + "/" + name;
  }
  function pick(assets, suffix) {
    for (var i = 0; i < assets.length; i++) {
      if (assets[i].name && assets[i].name.indexOf(suffix) !== -1) return assets[i].name;
    }
    return null;
  }
  function applyRelease(rel) {
    var tag = rel.tag_name || "";
    var verEl = document.getElementById("ver");
    if (verEl && tag) verEl.textContent = tag;

    var map = {
      "dl-win": "win-x64-setup.exe",
      "dl-mac": "mac-arm64.dmg",
      "dl-linux": "linux-x86_64.AppImage",
      "dl-android": "android.apk"
    };
    Object.keys(map).forEach(function (id) {
      var el = document.getElementById(id);
      if (!el) return;
      var name = pick(rel.assets || [], map[id]);
      if (name && tag) {
        el.href = assetUrl(tag, name);
        el.setAttribute("download", name);
      } else {
        el.href = FALLBACK;
      }
      /* live size fallback — update_site.py bakes sizes statically, so only
         fill in when the baked span has no size yet */
      var meta = el.querySelector("b + span");
      if (meta && name && tag && meta.textContent.indexOf("~") === -1) {
        (rel.assets || []).forEach(function (a) {
          if (a.name === name && meta.textContent.indexOf("~") === -1) {
            meta.textContent += " · ~" + (a.size / 1048576).toFixed(0) + "MB";
          }
        });
      }
    });
  }
  if ("fetch" in window) {
    fetch(API, { headers: { Accept: "application/vnd.github+json" } })
      .then(function (r) { return r.ok ? r.json() : Promise.reject(r.status); })
      .then(applyRelease)
      .catch(function () {});
  }

  /* ═══════════ 2) glass nav state ═══════════ */
  var nav = document.getElementById("nav");
  function navState() { if (nav) nav.classList.toggle("scrolled", (window.scrollY || 0) > 24); }
  navState();
  window.addEventListener("scroll", navState, { passive: true });

  /* ═══════════ 3) reveal on scroll ═══════════ */
  (function () {
    var els = [].slice.call(document.querySelectorAll(".reveal"));
    if (!("IntersectionObserver" in window)) { els.forEach(function (e) { e.classList.add("in"); }); return; }
    els.forEach(function (e) {
      var parent = e.parentElement;
      if (parent) {
        var sibs = parent.querySelectorAll(":scope > .reveal");
        var idx = [].indexOf.call(sibs, e);
        if (idx > 0) e.style.transitionDelay = Math.min(idx * 80, 320) + "ms";
      }
    });
    var io = new IntersectionObserver(function (ents) {
      ents.forEach(function (en) {
        if (en.isIntersecting) { en.target.classList.add("in"); io.unobserve(en.target); }
      });
    }, { rootMargin: "0px 0px -8% 0px", threshold: .08 });
    els.forEach(function (e) { io.observe(e); });
  })();

  /* ═══════════ 4) Top-10 row arrows (RTL: forward = negative scrollLeft) ═══════════ */
  var row = document.getElementById("tp-row");
  var nextBtn = document.getElementById("tp-next");
  var prevBtn = document.getElementById("tp-prev");
  function step(dir) {
    if (!row) return;
    var w = Math.max(row.clientWidth * .8, 320);
    row.parentElement.scrollBy({ left: dir * w, behavior: "smooth" });
  }
  if (row && nextBtn && prevBtn) {
    nextBtn.addEventListener("click", function () { step(-1); });
    prevBtn.addEventListener("click", function () { step(1); });
  }
})();
