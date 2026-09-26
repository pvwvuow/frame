/* Frame landing v4 — soft streaming edition.
 * 1) release links from the public GitHub API (unchanged behaviour);
 * 2) hero: rotating featured titles with soft crossfades (bg blur + poster + info);
 * 3) feed rows: horizontal smooth carousels over docs/browse.json (1600 titles);
 * 4) quick-preview modal, reveal-on-scroll, glass nav state.
 */
(function () {
  "use strict";

  /* ═══════════════ 1) release links (unchanged) ═══════════════ */
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
    });
    (rel.assets || []).forEach(function (a) {
      var mb = (a.size / 1048576).toFixed(0);
      var key = null;
      if (a.name.indexOf("win-x64-setup") !== -1) key = "dl-win";
      else if (a.name.indexOf("mac-arm64.dmg") !== -1) key = "dl-mac";
      else if (a.name.indexOf("AppImage") !== -1) key = "dl-linux";
      else if (a.name.indexOf("android.apk") !== -1) key = "dl-android";
      if (!key) return;
      var el = document.getElementById(key);
      var s = el && el.querySelector("span");
      if (s && !s.dataset.size) {
        s.dataset.size = "1";
        s.textContent = s.textContent + " · ~" + mb + "MB";
      }
    });
  }
  if ("fetch" in window) {
    fetch(API, { headers: { Accept: "application/vnd.github+json" } })
      .then(function (r) { return r.ok ? r.json() : Promise.reject(r.status); })
      .then(applyRelease)
      .catch(function () {});
  }

  if (!("fetch" in window)) return;

  /* ═══════════════ shared helpers ═══════════════ */
  function faNum(n) { return String(n).replace(/\d/g, function (d) { return "۰۱۲۳۴۵۶۷۸۹"[+d]; }); }
  function faGroup(n) { return Number(n).toLocaleString("fa-IR"); }
  function typeFa(p) { return p === "series" ? "سریال" : "فیلم"; }
  function coverUrl(tt) { return "covers-web/" + tt.slice(0, 3) + "/" + tt + ".webp"; }
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  var STAR_SVG = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2l2.9 6.1 6.6.8-4.9 4.6 1.3 6.5L12 16.8 6.1 20l1.3-6.5L2.5 8.9l6.6-.8z"/></svg>';
  var PLAY_SVG = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><polygon points="8 5 19 12 8 19 8 5"/></svg>';
  var CHEV_R = '<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M9 5l7 7-7 7"/></svg>';
  var CHEV_L = '<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg>';

  /* ═══════════════ glass nav state ═══════════════ */
  var nav = document.getElementById("nav");
  function navState() { if (nav) nav.classList.toggle("scrolled", (window.scrollY || 0) > 24); }
  navState();
  window.addEventListener("scroll", navState, { passive: true });

  /* ═══════════════ reveal on scroll ═══════════════ */
  (function () {
    var els = [].slice.call(document.querySelectorAll(".reveal"));
    if (!("IntersectionObserver" in window)) { els.forEach(function (e) { e.classList.add("in"); }); return; }
    // gentle stagger inside the same parent grid
    els.forEach(function (e) {
      var parent = e.parentElement;
      if (parent) {
        var sibs = parent.querySelectorAll(":scope > .reveal");
        var idx = [].indexOf.call(sibs, e);
        if (idx > 0) e.style.transitionDelay = Math.min(idx * 70, 350) + "ms";
      }
    });
    var io = new IntersectionObserver(function (ents) {
      ents.forEach(function (en) {
        if (en.isIntersecting) { en.target.classList.add("in"); io.unobserve(en.target); }
      });
    }, { rootMargin: "0px 0px -8% 0px", threshold: .08 });
    els.forEach(function (e) { io.observe(e); });
  })();

  /* ═══════════════ modal ═══════════════ */
  var modal = document.getElementById("modal");
  var mImg = document.getElementById("modal-img");
  var mPh = modal.querySelector(".modal-ph");
  var mTitle = document.getElementById("modal-title");
  var mEn = document.getElementById("modal-en");
  var mMeta = document.getElementById("modal-meta");
  var mBadges = document.getElementById("modal-badges");
  var lastFocus = null;

  function openModal(t) {
    lastFocus = document.activeElement;
    mTitle.textContent = t.t || t.e || "";
    mEn.textContent = t.e || "";
    mMeta.textContent = typeFa(t.p) + " · " + faNum(t.y || "") + " · " + (t.g || []).join("، ");
    mBadges.innerHTML =
      (t.r ? '<span class="m-rate">' + STAR_SVG.replace('viewBox', 'width="11" height="11" style="vertical-align:-1px" viewBox') + " " + t.r + "</span>" : "") +
      (t.q ? "<span>" + esc(t.q) + "</span>" : "") +
      "<span>" + typeFa(t.p) + "</span>";
    mPh.hidden = true;
    mImg.style.display = "";
    mImg.src = coverUrl(t.i);
    mImg.alt = "پوستر " + (t.t || t.e || "");
    mImg.onerror = function () { mImg.style.display = "none"; mPh.hidden = false; };
    modal.hidden = false;
    document.body.classList.add("modal-open");
    modal.querySelector(".modal-close").focus();
  }
  function closeModal() {
    modal.hidden = true;
    document.body.classList.remove("modal-open");
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }
  modal.addEventListener("click", function (e) {
    if (e.target.closest("[data-close]")) closeModal();
  });
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && !modal.hidden) closeModal();
  });

  /* ═══════════════ card factory ═══════════════ */
  function cardHtml(t) {
    var g = (t.g || []).slice(0, 1).join("");
    var meta = typeFa(t.p) + " · " + faNum(t.y || "") + (g ? " · " + esc(g) : "");
    return '<button type="button" class="p-card" data-i="' + t.i + '" aria-label="پیش‌نمایش ' + esc(t.t || t.e) + '">' +
      '<span class="p-frame">' +
        (t.q ? '<span class="badge badge-q">' + esc(t.q) + "</span>" : "") +
        (t.r ? '<span class="badge badge-r">' + STAR_SVG + " " + t.r + "</span>" : "") +
        '<img loading="lazy" decoding="async" src="' + coverUrl(t.i) + '" alt="پوستر ' + esc(t.t || t.e) + '" width="300" height="450">' +
        '<span class="ph" hidden>' + PLAY_SVG + "</span>" +
        '<span class="p-play">' + PLAY_SVG + "</span>" +
      "</span>" +
      '<span class="p-title">' + esc(t.t || t.e) + "</span>" +
      '<span class="p-meta">' + meta + "</span>" +
    "</button>";
  }
  function bindCards(root, data) {
    root.querySelectorAll(".p-card").forEach(function (b) {
      b.addEventListener("click", function () {
        var t = data.filter(function (x) { return x.i === b.dataset.i; })[0];
        if (t) openModal(t);
      });
      var img = b.querySelector("img");
      var ph = b.querySelector(".ph");
      img.addEventListener("error", function () { img.style.display = "none"; ph.hidden = false; });
    });
  }

  /* ═══════════════ skeleton row ═══════════════ */
  function skRow() {
    var s = "";
    for (var k = 0; k < 10; k++) s += '<span class="sk-card"><span class="sk-img"></span><span class="sk-line"></span><span class="sk-line w2"></span></span>';
    return s;
  }

  /* ═══════════════ hero rotation ═══════════════ */
  var heroData = [];
  var heroIdx = 0, heroTimer = null, slideToggle = false;
  var sA = document.getElementById("slide-a"), sB = document.getElementById("slide-b");
  var hA = document.getElementById("hf-a"), hB = document.getElementById("hf-b");
  var hfTitle = document.getElementById("hf-title");
  var hfEn = document.getElementById("hf-en");
  var hfMeta = document.getElementById("hf-meta");
  var hfRank = document.getElementById("hf-rank");
  var hfThumbs = document.getElementById("hf-thumbs");
  var hfInfo = document.querySelector(".hf-info");

  function heroPaint(i, first) {
    var t = heroData[i];
    if (!t) return;
    var url = coverUrl(t.i);
    slideToggle = !slideToggle;
    var showS = slideToggle ? sB : sA, hideS = slideToggle ? sA : sB;
    showS.style.backgroundImage = 'url("' + url + '")';
    showS.classList.add("on");
    hideS.classList.remove("on");

    var showI = slideToggle ? hB : hA, hideI = slideToggle ? hA : hB;
    showI.src = url;
    showI.alt = "پوستر " + (t.t || t.e || "");
    showI.classList.add("on");
    hideI.classList.remove("on");

    if (first) {
      hfTitle.textContent = t.t || t.e || "";
      hfEn.textContent = t.e || "";
      hfMeta.innerHTML =
        (t.r ? '<span class="star">★ ' + t.r + "</span>" : "") +
        "<span>" + typeFa(t.p) + " · " + faNum(t.y || "") + "</span>" +
        (t.g || []).slice(0, 2).map(function (x) { return "<span>" + esc(x) + "</span>"; }).join("") +
        (t.q ? "<span>" + esc(t.q) + "</span>" : "");
      hfRank.innerHTML = "<b>#" + faNum(i + 1) + "</b> داغ امروز";
    } else {
      hfInfo.classList.add("fade-out");
      setTimeout(function () {
        hfTitle.textContent = t.t || t.e || "";
        hfEn.textContent = t.e || "";
        hfMeta.innerHTML =
          (t.r ? '<span class="star">★ ' + t.r + "</span>" : "") +
          "<span>" + typeFa(t.p) + " · " + faNum(t.y || "") + "</span>" +
          (t.g || []).slice(0, 2).map(function (x) { return "<span>" + esc(x) + "</span>"; }).join("") +
          (t.q ? "<span>" + esc(t.q) + "</span>" : "");
        hfRank.innerHTML = "<b>#" + faNum(i + 1) + "</b> داغ امروز";
        hfInfo.classList.remove("fade-out");
      }, 320);
    }
    [].forEach.call(hfThumbs.children, function (b, k) { b.classList.toggle("on", k === i); });
  }
  function heroGo(i) { heroIdx = (i + heroData.length) % heroData.length; heroPaint(heroIdx, false); }
  function heroStart() {
    if (heroTimer || heroData.length < 2) return;
    heroTimer = setInterval(function () { heroGo(heroIdx + 1); }, 6500);
  }
  function heroStop() { if (heroTimer) { clearInterval(heroTimer); heroTimer = null; } }

  function buildHero(data) {
    // curated, recognizable showpieces first (all verified present in the catalog)
    var CURATED = ["tt0468569", "tt0903747", "tt0816692", "tt0944947", "tt1375666", "tt7286456", "tt0068646", "tt4574334"];
    var byId = {};
    data.forEach(function (t) { byId[t.i] = t; });
    heroData = CURATED.filter(function (id) { return byId[id]; }).map(function (id) { return byId[id]; });
    if (heroData.length < 6) {
      var pool = data.filter(function (t) { return t.r >= 8.5 && (t.g || []).indexOf("مستند") === -1 && (t.t || "").length >= 4; });
      pool.sort(function (a, b) { return b.r - a.r || b.y - a.y; });
      pool.forEach(function (t) { if (heroData.length < 6 && heroData.indexOf(t) === -1) heroData.push(t); });
    }
    if (!heroData.length) return;
    // preload first
    var im = new Image();
    im.onload = function () { heroPaint(0, true); };
    im.onerror = function () {
      heroData.splice(0, 1);
      if (heroData.length) { var im2 = new Image(); im2.onload = function () { heroPaint(0, true); }; im2.src = coverUrl(heroData[0].i); }
    };
    im.src = coverUrl(heroData[0].i);

    hfThumbs.innerHTML = heroData.map(function (t) {
      return '<button type="button" aria-label="نمایش ' + esc(t.t || t.e) + '"><img src="' + coverUrl(t.i) + '" alt="" width="92" height="138" loading="lazy"></button>';
    }).join("");
    [].forEach.call(hfThumbs.children, function (b, k) {
      b.addEventListener("click", function () { heroGo(k); heroStart(); });
    });

    var hero = document.getElementById("hero");
    hero.addEventListener("mouseenter", heroStop);
    hero.addEventListener("mouseleave", heroStart);
    document.addEventListener("visibilitychange", function () { document.hidden ? heroStop() : heroStart(); });
    heroStart();
  }

  /* ═══════════════ feed rows ═══════════════ */
  var ROWS = [
    { id: "trend", title: "داغ‌ترین‌های فریم", fn: function (d) { return d.slice().sort(function (a, b) { return b.r - a.r || b.y - a.y; }).slice(0, 28); } },
    { id: "new", title: "تازه‌های سینما", fn: function (d) { return d.filter(function (t) { return t.p === "movie"; }).sort(function (a, b) { return b.y - a.y || b.r - a.r; }).slice(0, 28); } },
    { id: "series", title: "سریال‌های برتر", fn: function (d) { return d.filter(function (t) { return t.p === "series"; }).sort(function (a, b) { return b.r - a.r || b.y - a.y; }).slice(0, 28); } },
    { id: "action", title: "اکشن و ماجراجویی", fn: function (d) { return d.filter(function (t) { return (t.g || []).indexOf("اکشن") !== -1 || (t.g || []).indexOf("ماجراجویی") !== -1; }).sort(function (a, b) { return b.r - a.r; }).slice(0, 28); } },
    { id: "comedy", title: "کمدی‌های خوش‌حال‌کننده", fn: function (d) { return d.filter(function (t) { return (t.g || []).indexOf("کمدی") !== -1; }).sort(function (a, b) { return b.r - a.r; }).slice(0, 28); } },
    { id: "anim", title: "انیمیشن و خانوادگی", fn: function (d) { return d.filter(function (t) { return (t.g || []).indexOf("انیمیشن") !== -1 || (t.g || []).indexOf("خانوادگی") !== -1; }).sort(function (a, b) { return b.r - a.r; }).slice(0, 28); } },
    { id: "scifi", title: "علمی‌تخیلی و فانتزی", fn: function (d) { return d.filter(function (t) { return (t.g || []).indexOf("علمی\u200cتخیلی") !== -1 || (t.g || []).indexOf("فانتزی") !== -1; }).sort(function (a, b) { return b.r - a.r; }).slice(0, 28); } },
    { id: "thrill", title: "ترسناک و معمایی", fn: function (d) { return d.filter(function (t) { return (t.g || []).indexOf("ترسناک") !== -1 || (t.g || []).indexOf("معمایی") !== -1; }).sort(function (a, b) { return b.r - a.r; }).slice(0, 28); } }
  ];

  function buildRowSkeleton(cfg) {
    var block = document.createElement("div");
    block.className = "row-block";
    block.innerHTML =
      '<div class="row-head"><h2>' + esc(cfg.title) + '</h2><span class="row-count" hidden></span>' +
      '<div class="row-nav">' +
        '<button type="button" data-dir="next" aria-label="بعدی">' + CHEV_L + "</button>" +
        '<button type="button" data-dir="prev" aria-label="قبلی">' + CHEV_R + "</button>" +
      "</div></div>" +
      '<div class="row-wrap show-s"><div class="row">' + skRow() + "</div></div>";
    return block;
  }

  function fillRow(block, cfg, data) {
    var row = block.querySelector(".row");
    var wrap = block.querySelector(".row-wrap");
    var items = cfg.fn(data);
    if (!items.length) { block.remove(); return; }
    row.innerHTML = items.map(cardHtml).join("");
    bindCards(row, data);
    var cnt = block.querySelector(".row-count");
    cnt.hidden = false;
    cnt.textContent = faGroup(items.length) + " عنوان";

    var prev = block.querySelector('[data-dir="prev"]');
    var next = block.querySelector('[data-dir="next"]');
    function step(dir) {
      var w = row.clientWidth * .78;
      row.scrollBy({ left: dir * w, behavior: "smooth" });
    }
    next.addEventListener("click", function () { step(-1); });
    prev.addEventListener("click", function () { step(1); });
    function edge() {
      var max = row.scrollWidth - row.clientWidth;
      var pos = Math.abs(row.scrollLeft);
      wrap.classList.toggle("show-s", pos > 8);
      wrap.classList.toggle("show-e", pos < max - 8);
    }
    edge();
    row.addEventListener("scroll", edge, { passive: true });
    window.addEventListener("resize", edge);
  }

  var rowsEl = document.getElementById("rows");
  var rowBlocks = [];

  ROWS.forEach(function (cfg) {
    var b = buildRowSkeleton(cfg);
    rowsEl.appendChild(b);
    rowBlocks.push({ cfg: cfg, el: b, done: false });
  });

  var DATA_CACHE = null;
  function renderVisible() {
    if (!DATA_CACHE) return;
    rowBlocks.forEach(function (rb) {
      if (rb.done) return;
      var r = rb.el.getBoundingClientRect();
      if (r.top < window.innerHeight * 1.6 && r.bottom > -200) {
        rb.done = true;
        fillRow(rb.el, rb.cfg, DATA_CACHE);
      }
    });
  }

  fetch("browse.json")
    .then(function (r) { return r.ok ? r.json() : Promise.reject(r.status); })
    .then(function (json) {
      DATA_CACHE = json.titles || [];
      buildHero(DATA_CACHE);
      renderVisible();
      window.addEventListener("scroll", renderVisible, { passive: true });
      window.addEventListener("resize", renderVisible);
    })
    .catch(function () {
      // data failed: drop skeletons, keep the marketing page intact
      rowBlocks.forEach(function (rb) { rb.el.remove(); });
    });
})();
