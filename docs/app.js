/* Frame landing v5 — clean professional edition.
 * 1) release links from the public GitHub API (unchanged behaviour);
 * 2) hero: static poster wall + live search dropdown over docs/browse.json;
 * 3) feed rows: horizontal snap carousels with "view all" → library browser;
 * 4) library browser: type/genre/sort filters + infinite grid;
 * 5) quick-preview modal, reveal-on-scroll, glass nav state.
 */
(function () {
  "use strict";
  document.documentElement.classList.add("js");

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
  function norm(s) {
    return String(s == null ? "" : s).toLowerCase()
      .replace(/[يى]/g, "ی").replace(/ك/g, "ک")
      .replace(/[أإآ]/g, "ا")
      .replace(/[\u200c\u064b-\u0652]/g, "")
      .replace(/\s+/g, " ").trim();
  }
  var STAR_SVG = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2l2.9 6.1 6.6.8-4.9 4.6 1.3 6.5L12 16.8 6.1 20l1.3-6.5L2.5 8.9l6.6-.8z"/></svg>';
  var PLAY_SVG = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><polygon points="8 5 19 12 8 19 8 5"/></svg>';
  var CHEV_R = '<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M9 5l7 7-7 7"/></svg>';
  var CHEV_L = '<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg>';
  var CHEV_S = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M9 5l7 7-7 7"/></svg>';

  /* ═══════════════ glass nav state ═══════════════ */
  var nav = document.getElementById("nav");
  function navState() { if (nav) nav.classList.toggle("scrolled", (window.scrollY || 0) > 24); }
  navState();
  window.addEventListener("scroll", navState, { passive: true });

  /* ═══════════════ reveal on scroll ═══════════════ */
  (function () {
    var els = [].slice.call(document.querySelectorAll(".reveal"));
    if (!("IntersectionObserver" in window)) { els.forEach(function (e) { e.classList.add("in"); }); return; }
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
    var mq = t.q ? String(t.q).split(",").pop().trim() : "";
    mBadges.innerHTML =
      (t.r ? '<span class="m-rate">' + STAR_SVG.replace('viewBox', 'width="11" height="11" style="vertical-align:-1px" viewBox') + " " + t.r + "</span>" : "") +
      (mq ? "<span>" + esc(mq) + "</span>" : "") +
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
  function fadeImg(img) {
    if (img.complete && img.naturalWidth > 0) { img.classList.add("ld"); return; }
    img.addEventListener("load", function () { img.classList.add("ld"); }, { once: true });
  }
  function cardHtml(t, rank) {
    var g = (t.g || []).slice(0, 1).join("");
    var meta = typeFa(t.p) + " · " + faNum(t.y || "") + (g ? " · " + esc(g) : "");
    var q = t.q ? String(t.q).split(",").pop().trim() : "";
    return '<button type="button" class="p-card" data-i="' + t.i + '" aria-label="پیش‌نمایش ' + esc(t.t || t.e) + '">' +
      '<span class="p-frame">' +
        '<span class="badges">' +
          (q ? '<span class="badge badge-q">' + esc(q) + "</span>" : "") +
          (t.r ? '<span class="badge badge-r">' + STAR_SVG + " " + t.r + "</span>" : "") +
        "</span>" +
        (rank ? '<span class="p-rank">' + faNum(rank) + "</span>" : "") +
        '<img loading="lazy" decoding="async" src="' + coverUrl(t.i) + '" alt="پوستر ' + esc(t.t || t.e) + '" width="300" height="450">' +
        '<span class="ph" hidden>' + PLAY_SVG + "</span>" +
        '<span class="p-play">' + PLAY_SVG + "</span>" +
      "</span>" +
      '<span class="p-title">' + esc(t.t || t.e) + "</span>" +
      '<span class="p-meta">' + meta + "</span>" +
    "</button>";
  }
  function bindCards(root) {
    root.querySelectorAll(".p-card").forEach(function (b) {
      var t = BY_ID[b.dataset.i];
      if (t) b.addEventListener("click", function () { openModal(t); });
      var img = b.querySelector("img");
      var ph = b.querySelector(".ph");
      img.addEventListener("error", function () { img.style.display = "none"; ph.hidden = false; }, { once: true });
      fadeImg(img);
    });
  }

  /* skeleton row */
  function skRow() {
    var s = "";
    for (var k = 0; k < 10; k++) s += '<span class="sk-card"><span class="sk-img"></span><span class="sk-line"></span><span class="sk-line w2"></span></span>';
    return s;
  }

  /* ═══════════════ data boot ═══════════════ */
  var DATA = [];
  var BY_ID = {};

  /* ═══════════════ hero poster wall (static, decorative) ═══════════════ */
  function buildWall() {
    var wall = document.getElementById("hero-wall");
    if (!wall || !DATA.length) return;
    var pool = DATA.filter(function (t) { return t.r >= 7.6; });
    pool.sort(function (a, b) { return (b.y - a.y) || (b.r - a.r); });
    var picks = pool.slice(0, 40);
    // spread picks across the pool so the wall looks varied, not a top-40 clump
    var out = [];
    var step = Math.max(1, Math.floor(picks.length / 30));
    for (var k = 0; k < picks.length && out.length < 30; k += step) out.push(picks[k]);
    wall.innerHTML = out.map(function (t) {
      return '<img loading="lazy" decoding="async" src="' + coverUrl(t.i) + '" alt="" width="300" height="450">';
    }).join("");
    wall.querySelectorAll("img").forEach(function (img) {
      img.addEventListener("error", function () { img.style.visibility = "hidden"; }, { once: true });
    });
  }

  /* ═══════════════ hero live search ═══════════════ */
  var searchForm = document.getElementById("search");
  var searchIn = document.getElementById("search-in");
  var drop = document.getElementById("search-drop");
  var sdItems = [], sdSel = -1, sdTimer = null;

  function searchMatch(q) {
    var nq = norm(q);
    if (nq.length < 2) return [];
    var starts = [], mid = [];
    for (var k = 0; k < DATA.length && (starts.length < 8 || mid.length < 8); k++) {
      var t = DATA[k];
      var nt = norm(t.t), ne = norm(t.e);
      var hitS = (nt && nt.indexOf(nq) === 0) || (ne && ne.indexOf(nq) === 0);
      var hitM = (nt && nt.indexOf(nq) > 0) || (ne && ne.indexOf(nq) > 0);
      if (hitS && starts.length < 8) starts.push(t);
      else if (hitM && mid.length < 8) mid.push(t);
    }
    return starts.concat(mid).slice(0, 8);
  }
  function sdItemHtml(t) {
    return '<button type="button" class="sd-item" data-i="' + t.i + '">' +
      '<img loading="lazy" src="' + coverUrl(t.i) + '" alt="" width="44" height="66">' +
      '<span class="sd-t"><b>' + esc(t.t || t.e) + "</b>" +
      "<small>" + esc(t.e || "") + (t.y ? " · " + t.y : "") + "</small></span>" +
      (t.r ? '<span class="sd-r">' + STAR_SVG + " " + t.r + "</span>" : "") +
    "</button>";
  }
  function renderDrop(q) {
    var hits = searchMatch(q);
    sdItems = hits;
    sdSel = -1;
    if (!hits.length) {
      drop.innerHTML = '<p class="sd-hint">' +
        (norm(q).length < 2 ? "حداقل ۲ حرف بنویس…" : "چیزی برای «" + esc(q) + "» پیدا نشد.") + "</p>";
      drop.hidden = false;
      return;
    }
    drop.innerHTML = hits.map(sdItemHtml).join("") +
      '<button type="button" class="sd-all">دیدن همه‌ی نتایج «' + esc(q) + "» " + CHEV_S + "</button>";
    drop.hidden = false;
    drop.querySelectorAll(".sd-item").forEach(function (b) {
      b.addEventListener("click", function () {
        var t = BY_ID[b.dataset.i];
        sdClose();
        if (t) openModal(t);
      });
    });
    drop.querySelector(".sd-all").addEventListener("click", function () {
      sdClose();
      goBrowse({ q: searchIn.value });
    });
  }
  function sdClose() { drop.hidden = true; sdItems = []; sdSel = -1; }
  searchIn.addEventListener("input", function () {
    clearTimeout(sdTimer);
    var q = searchIn.value;
    if (norm(q).length < 2) { sdClose(); return; }
    sdTimer = setTimeout(function () { renderDrop(q); }, 170);
  });
  searchIn.addEventListener("focus", function () {
    if (norm(searchIn.value).length >= 2 && sdItems.length) drop.hidden = false;
  });
  searchIn.addEventListener("keydown", function (e) {
    if (drop.hidden) return;
    var items = drop.querySelectorAll(".sd-item");
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      sdSel = e.key === "ArrowDown" ? Math.min(sdSel + 1, items.length - 1) : Math.max(sdSel - 1, 0);
      items.forEach(function (el, k) { el.classList.toggle("sel", k === sdSel); });
    } else if (e.key === "Enter" && sdSel > -1 && items[sdSel]) {
      e.preventDefault();
      items[sdSel].click();
    } else if (e.key === "Escape") {
      sdClose();
    }
  });
  searchForm.addEventListener("submit", function (e) {
    e.preventDefault();
    sdClose();
    searchIn.blur();
    goBrowse({ q: searchIn.value });
  });
  document.addEventListener("click", function (e) {
    if (!searchForm.contains(e.target)) sdClose();
  });

  /* ═══════════════ feed rows ═══════════════ */
  /* globally famous tt-ids (verified present in the catalog) — used to make
   * the “داغ‌ترین‌ها” row instantly recognizable, then rating fills the rest */
  var KNOWN = ["tt0903747","tt0944947","tt1375666","tt0468569","tt0816692","tt4574334","tt7286456","tt0068646",
    "tt6751668","tt2582802","tt0111161","tt0137523","tt0133093","tt0110912","tt0114369","tt0080684","tt0076759",
    "tt0167260","tt0120737","tt0109830","tt0050083","tt0073486","tt0108052","tt0102926","tt0107290","tt0068646",
    "tt7366338","tt10919420","tt3581920","tt5753856","tt7660850","tt2085059","tt0386676","tt0108778","tt1475582",
    "tt2560140","tt5491994","tt0185906","tt3032476","tt2442560","tt5180504","tt1520211","tt2707408","tt2861424",
    "tt4158110","tt11126994","tt13443470","tt6468322","tt0417299","tt4154796","tt4154756","tt0848228","tt1630029",
    "tt0499549","tt0910970","tt2380307","tt0382932","tt0317705","tt0435761","tt1853728","tt0361748","tt0407887",
    "tt1345836","tt0372784","tt0993846","tt3659388","tt2582802","tt2267998","tt1130884","tt0209144","tt0338013"];
  var ROWS = [
    { id: "trend", title: "داغ‌ترین‌های فریم", ranked: true, all: { sort: "rating" },
      fn: function (d) {
        var byId = {};
        d.forEach(function (t) { byId[t.i] = t; });
        var out = [];
        KNOWN.forEach(function (id) {
          var t = byId[id];
          if (t && out.length < 28 && out.indexOf(t) === -1) out.push(t);
        });
        if (out.length < 28) {
          d.slice().sort(function (a, b) { return b.r - a.r || b.y - a.y; }).forEach(function (t) {
            if (out.length < 28 && out.indexOf(t) === -1) out.push(t);
          });
        }
        return out;
      } },
    { id: "new", title: "تازه‌های سینما", all: { type: "movie", sort: "new" },
      fn: function (d) { return d.filter(function (t) { return t.p === "movie" && t.r >= 6.8; }).sort(function (a, b) { return b.y - a.y || b.r - a.r; }).slice(0, 28); } },
    { id: "series", title: "سریال‌های برتر", all: { type: "series", sort: "rating" },
      fn: function (d) { return d.filter(function (t) { return t.p === "series"; }).sort(function (a, b) { return b.r - a.r || b.y - a.y; }).slice(0, 28); } },
    { id: "action", title: "اکشن و ماجراجویی", all: { genre: "اکشن" },
      fn: function (d) { return d.filter(function (t) { return (t.g || []).indexOf("اکشن") !== -1 || (t.g || []).indexOf("ماجراجویی") !== -1; }).sort(function (a, b) { return b.r - a.r; }).slice(0, 28); } },
    { id: "comedy", title: "کمدی‌های خوش‌حال‌کننده", all: { genre: "کمدی" },
      fn: function (d) { return d.filter(function (t) { return (t.g || []).indexOf("کمدی") !== -1; }).sort(function (a, b) { return b.r - a.r; }).slice(0, 28); } },
    { id: "anim", title: "انیمیشن و خانوادگی", all: { genre: "انیمیشن" },
      fn: function (d) { return d.filter(function (t) { return (t.g || []).indexOf("انیمیشن") !== -1 || (t.g || []).indexOf("خانوادگی") !== -1; }).sort(function (a, b) { return b.r - a.r; }).slice(0, 28); } },
    { id: "scifi", title: "علمی‌تخیلی و فانتزی", all: { genre: "علمی‌تخیلی" },
      fn: function (d) { return d.filter(function (t) { return (t.g || []).indexOf("علمی\u200cتخیلی") !== -1 || (t.g || []).indexOf("فانتزی") !== -1; }).sort(function (a, b) { return b.r - a.r; }).slice(0, 28); } },
    { id: "thrill", title: "ترسناک و معمایی", all: { genre: "ترسناک" },
      fn: function (d) { return d.filter(function (t) { return (t.g || []).indexOf("ترسناک") !== -1 || (t.g || []).indexOf("معمایی") !== -1; }).sort(function (a, b) { return b.r - a.r; }).slice(0, 28); } }
  ];

  function buildRowSkeleton(cfg) {
    var block = document.createElement("div");
    block.className = "row-block";
    block.innerHTML =
      '<div class="row-head"><h2>' + esc(cfg.title) + '</h2><span class="row-count" hidden></span>' +
      '<a class="row-all" href="#browse" data-row="' + cfg.id + '">مشاهده همه ' + CHEV_S + "</a>" +
      '<div class="row-nav">' +
        '<button type="button" data-dir="next" aria-label="بعدی">' + CHEV_L + "</button>" +
        '<button type="button" data-dir="prev" aria-label="قبلی">' + CHEV_R + "</button>" +
      "</div></div>" +
      '<div class="row-wrap show-e"><div class="row">' + skRow() + "</div></div>";
    return block;
  }

  /* each title appears in at most one row — later rows stay fresh */
  var USED = {};
  function fillRow(block, cfg) {
    var row = block.querySelector(".row");
    var wrap = block.querySelector(".row-wrap");
    var items = cfg.fn(DATA).filter(function (t) { return !USED[t.i]; });
    if (!items.length) { block.remove(); return; }
    items.forEach(function (t) { USED[t.i] = 1; });
    row.innerHTML = items.map(function (t, k) { return cardHtml(t, cfg.ranked ? k + 1 : 0); }).join("");
    bindCards(row);
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
  }

  var rowsEl = document.getElementById("rows");
  var rowBlocks = [];
  ROWS.forEach(function (cfg) {
    var b = buildRowSkeleton(cfg);
    rowsEl.appendChild(b);
    rowBlocks.push({ cfg: cfg, el: b, done: false });
  });
  function renderVisibleRows() {
    if (!DATA.length) return;
    rowBlocks.forEach(function (rb) {
      if (rb.done) return;
      var r = rb.el.getBoundingClientRect();
      if (r.top < window.innerHeight * 1.6 && r.bottom > -200) {
        rb.done = true;
        fillRow(rb.el, rb.cfg);
      }
    });
  }
  rowsEl.addEventListener("click", function (e) {
    var a = e.target.closest(".row-all");
    if (!a) return;
    e.preventDefault();
    var cfg = ROWS.filter(function (x) { return x.id === a.dataset.row; })[0];
    if (cfg) goBrowse(cfg.all || {});
  });

  /* ═══════════════ library browser ═══════════════ */
  var grid = document.getElementById("grid");
  var gridMore = document.getElementById("grid-more");
  var gridEmpty = document.getElementById("grid-empty");
  var gridReset = document.getElementById("grid-reset");
  var gridEnd = document.getElementById("grid-end");
  var tbCount = document.getElementById("tb-count");
  var tbQ = document.getElementById("tb-q");
  var tbGenre = document.getElementById("tb-genre");
  var tbSort = document.getElementById("tb-sort");
  var tbPills = [].slice.call(document.querySelectorAll(".tb-pill"));
  var PAGE = 30, CAP = 120;
  var state = { q: "", type: "", genre: "", sort: "rating" };
  var shown = 0, current = [], busy = false;

  /* genre options: most frequent first */
  function fillGenres() {
    var counts = {};
    DATA.forEach(function (t) { (t.g || []).forEach(function (g) { counts[g] = (counts[g] || 0) + 1; }); });
    Object.keys(counts).sort(function (a, b) { return counts[b] - counts[a]; }).slice(0, 18).forEach(function (g) {
      var o = document.createElement("option");
      o.value = g; o.textContent = g + " (" + faGroup(counts[g]) + ")";
      tbGenre.appendChild(o);
    });
  }
  function filtered() {
    var nq = norm(state.q);
    var out = DATA.filter(function (t) {
      if (state.type && t.p !== state.type) return false;
      if (state.genre && (t.g || []).indexOf(state.genre) === -1) return false;
      if (nq) {
        var nt = norm(t.t), ne = norm(t.e);
        if (nt.indexOf(nq) === -1 && ne.indexOf(nq) === -1) return false;
      }
      return true;
    });
    if (state.sort === "rating") out.sort(function (a, b) { return b.r - a.r || b.y - a.y; });
    else if (state.sort === "new") out.sort(function (a, b) { return b.y - a.y || b.r - a.r; });
    else out.sort(function (a, b) { return a.y - b.y || b.r - a.r; });
    return out;
  }
  function gridPage() {
    busy = true;
    var slice = current.slice(shown, Math.min(shown + PAGE, CAP));
    var frag = document.createElement("div");
    frag.innerHTML = slice.map(function (t) { return cardHtml(t, 0); }).join("");
    while (frag.firstChild) grid.appendChild(frag.firstChild);
    bindCards(grid);
    shown += slice.length;
    busy = false;
    var cap = Math.min(current.length, CAP);
    gridMore.hidden = shown >= cap;
    gridEnd.hidden = !(shown >= cap && current.length > CAP);
    if (!gridEnd.hidden) {
      var n = gridEnd.querySelector("b");
      if (n) n.textContent = faGroup(current.length);
    }
  }
  function renderGrid() {
    current = filtered();
    shown = 0;
    grid.innerHTML = "";
    gridEmpty.hidden = current.length > 0;
    gridMore.hidden = true;
    gridEnd.hidden = true;
    tbCount.innerHTML = current.length
      ? "<b>" + faGroup(current.length) + "</b> عنوان پیدا شد" + (current.length > CAP ? " — ۱۲۰ تای برتر این‌جاست" : "")
      : "";
    if (current.length) gridPage();
  }
  function syncToolbar() {
    tbQ.value = state.q;
    tbGenre.value = state.genre;
    tbSort.value = state.sort;
    tbPills.forEach(function (p) { p.classList.toggle("on", p.dataset.type === state.type); });
  }
  function goBrowse(patch) {
    Object.keys(patch).forEach(function (k) {
      if (k in state) state[k] = patch[k] == null ? "" : patch[k];
    });
    syncToolbar();
    renderGrid();
    var top = document.getElementById("browse").getBoundingClientRect().top + (window.scrollY || 0) - 70;
    if (Math.abs((window.scrollY || 0) - top) > 40) {
      window.scrollTo({ top: top, behavior: "smooth" });
    }
  }
  tbPills.forEach(function (p) {
    p.addEventListener("click", function () { state.type = p.dataset.type; syncToolbar(); renderGrid(); });
  });
  tbGenre.addEventListener("change", function () { state.genre = tbGenre.value; renderGrid(); });
  tbSort.addEventListener("change", function () { state.sort = tbSort.value; renderGrid(); });
  var tqTimer = null;
  tbQ.addEventListener("input", function () {
    clearTimeout(tqTimer);
    tqTimer = setTimeout(function () { state.q = tbQ.value; renderGrid(); }, 200);
  });
  gridReset.addEventListener("click", function () { goBrowse({ q: "", type: "", genre: "", sort: "rating" }); });
  if ("IntersectionObserver" in window) {
    var moreIO = new IntersectionObserver(function (ents) {
      ents.forEach(function (en) {
        if (en.isIntersecting && !busy && shown < current.length) gridPage();
      });
    }, { rootMargin: "700px 0px" });
    moreIO.observe(gridMore);
  } else {
    window.addEventListener("scroll", function () {
      if (!busy && shown < current.length && gridMore.getBoundingClientRect().top < window.innerHeight * 1.5) gridPage();
    }, { passive: true });
  }

  /* hero chips → browse */
  document.querySelectorAll(".hero-chips .chip").forEach(function (c) {
    c.addEventListener("click", function () {
      var patch = {};
      if (c.dataset.genre) patch.genre = c.dataset.genre;
      if (c.dataset.type) patch.type = c.dataset.type;
      if (c.dataset.sort) patch.sort = c.dataset.sort;
      goBrowse(patch);
    });
  });

  /* ═══════════════ boot ═══════════════ */
  fetch("browse.json")
    .then(function (r) { return r.ok ? r.json() : Promise.reject(r.status); })
    .then(function (json) {
      DATA = json.titles || [];
      DATA.forEach(function (t) { BY_ID[t.i] = t; });
      buildWall();
      fillGenres();
      renderVisibleRows();
      renderGrid();
      window.addEventListener("scroll", renderVisibleRows, { passive: true });
      window.addEventListener("resize", renderVisibleRows);
    })
    .catch(function () {
      // data failed: drop skeletons, keep the marketing page intact
      rowBlocks.forEach(function (rb) { rb.el.remove(); });
      rowsEl.style.display = "none";
      tbCount.textContent = "";
    });
})();

