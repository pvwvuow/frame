/* Frame landing v7 — minimal product page (intro + download).
 * 1) release links + version (unchanged contract, also feeds .js-ver pills);
 * 2) glass nav state;
 * 3) reveal-on-scroll (staggered in hero);
 * 4) platform-aware hero CTA.
 * No catalog, no carousels — this page only introduces the app.
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
    if (tag) {
      var verEl = document.getElementById("ver");
      if (verEl) verEl.textContent = tag;
      [].slice.call(document.querySelectorAll(".js-ver")).forEach(function (el) {
        el.textContent = tag;
      });
    }

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

  /* ═══════════ 3) reveal on scroll (staggered in hero) ═══════════ */
  (function () {
    var els = [].slice.call(document.querySelectorAll(".reveal"));
    if (!("IntersectionObserver" in window)) { els.forEach(function (e) { e.classList.add("in"); }); return; }
    els.forEach(function (e) {
      var parent = e.parentElement;
      if (parent) {
        var sibs = parent.querySelectorAll(":scope > .reveal");
        var idx = [].indexOf.call(sibs, e);
        if (idx > 0) e.style.setProperty("--i", Math.min(idx, 6));
      }
    });
    var io = new IntersectionObserver(function (ents) {
      ents.forEach(function (en) {
        if (en.isIntersecting) { en.target.classList.add("in"); io.unobserve(en.target); }
      });
    }, { rootMargin: "0px 0px -8% 0px", threshold: .08 });
    els.forEach(function (e) { io.observe(e); });
  })();

  /* ═══════════ 4) platform-aware hero CTA ═══════════ */
  (function () {
    var cta = document.getElementById("cta-main");
    if (!cta) return;
    var ua = navigator.userAgent || "";
    var target = null, label = null;
    if (/Android/i.test(ua)) { target = "dl-android"; label = "دانلود برای اندروید"; }
    else if (/Windows/i.test(ua)) { target = "dl-win"; label = "دانلود برای ویندوز"; }
    else if (/Mac OS X|Macintosh/i.test(ua) && !/iPhone|iPad/i.test(ua)) { target = "dl-mac"; label = "دانلود برای مک"; }
    else if (/Linux/i.test(ua) && !/Android/i.test(ua)) { target = "dl-linux"; label = "دانلود برای لینوکس"; }
    if (target && label) {
      cta.href = "#" + target;
      cta.setAttribute("data-plain", label);
      /* keep the arrow svg */
      var svg = cta.querySelector("svg");
      cta.textContent = label;
      if (svg) cta.appendChild(svg);
    }
  })();
})();
