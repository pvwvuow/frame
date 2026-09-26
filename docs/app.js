/* Frame landing v2 — two jobs:
 * 1) auto-populate latest release version + direct download links from the
 *    public GitHub API (graceful fallback to the Releases page);
 * 2) live browse: search + filter + poster grid over docs/browse.json
 *    (a 1.6k top-rated slice of the catalog) with a quick-preview modal.
 */
(function () {
  "use strict";

  /* ═══════════════ 1) release links ═══════════════ */
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

  /* ═══════════════ 2) live browse ═══════════════ */
  if (!("fetch" in window)) return;

  var PAGE = 30;
  var TOTAL_LIBRARY = 19271;

  var grid = document.getElementById("grid");
  var moreBtn = document.getElementById("more");
  var emptyBox = document.getElementById("empty");
  var countEl = document.getElementById("browse-count");
  var titleEl = document.getElementById("browse-title");
  var qInput = document.getElementById("q");
  var searchForm = document.getElementById("search-form");
  var typeWrap = document.getElementById("type-chips");
  var sortWrap = document.getElementById("sort-chips");
  var genreWrap = document.getElementById("genre-chips");
  var quickWrap = document.getElementById("quick-genres");
  var yearSel = document.getElementById("year-sel");
  var ratingSel = document.getElementById("rating-sel");
  var navSearch = document.getElementById("nav-search");

  if (!grid) return;

  var DATA = [];
  var state = { q: "", type: "all", genre: "همه", sort: "rating", y0: 0, y1: 9999, minR: 0, shown: PAGE };

  /* helpers */
  function faNum(n) { return String(n).replace(/\d/g, function (d) { return "۰۱۲۳۴۵۶۷۸۹"[+d]; }); }
  function faGroup(n) { return Number(n).toLocaleString("fa-IR"); }
  function typeFa(p) { return p === "series" ? "سریال" : "فیلم"; }
  function coverUrl(tt) { return "covers-web/" + tt.slice(0, 3) + "/" + tt + ".webp"; }
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function norm(s) { return String(s || "").toLowerCase().trim(); }

  var PLAY_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><polygon points="10 8 16 12 10 16 10 8" fill="currentColor" stroke="none"/></svg>';
  var STAR_SVG = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2l2.9 6.1 6.6.8-4.9 4.6 1.3 6.5L12 16.8 6.1 20l1.3-6.5L2.5 8.9l6.6-.8z"/></svg>';

  /* ── build filter controls ── */
  function chip(label, val, active, extra) {
    return '<button type="button" class="chip' + (active ? " on" : "") + '" data-v="' + esc(val) + '"' + (extra || "") + ">" + label + "</button>";
  }

  function topGenres(list, n) {
    var freq = {};
    list.forEach(function (t) {
      (t.g || []).forEach(function (g) { freq[g] = (freq[g] || 0) + 1; });
    });
    return Object.keys(freq).sort(function (a, b) { return freq[b] - freq[a] || (a < b ? -1 : 1); }).slice(0, n);
  }

  function buildControls() {
    // type chips (with live counts under current non-type filters)
    var visible = filtered({ ignoreType: true });
    var cMovie = 0, cSeries = 0;
    visible.forEach(function (t) { if (t.p === "series") cSeries++; else cMovie++; });
    typeWrap.innerHTML =
      chip("همه <span class=" + '"n"' + ">" + faGroup(cMovie + cSeries) + "</span>", "all", state.type === "all") +
      chip("فیلم <span class=" + '"n"' + ">" + faGroup(cMovie) + "</span>", "movie", state.type === "movie") +
      chip("سریال <span class=" + '"n"' + ">" + faGroup(cSeries) + "</span>", "series", state.type === "series");

    // sort chips
    sortWrap.innerHTML =
      chip("برترین امتیاز", "rating", state.sort === "rating") +
      chip("جدیدترین", "newest", state.sort === "newest") +
      chip("قدیمی‌ترین", "oldest", state.sort === "oldest");

    // genre chips
    var gs = topGenres(DATA, 16);
    var gh = chip("همه", "همه", state.genre === "همه");
    genreWrap.innerHTML = gh + gs.map(function (g) { return chip(esc(g), g, state.genre === g); }).join("");

    // selects
    if (!yearSel.options.length) {
      [["0-9999", "همه‌ی سال‌ها"], ["2025-9999", "۲۰۲۵ به بعد"], ["2020-2024", "۲۰۲۰ تا ۲۰۲۴"],
       ["2010-2019", "۲۰۱۰ تا ۲۰۱۹"], ["2000-2009", "۲۰۰۰ تا ۲۰۰۹"], ["0-1999", "قبل از ۲۰۰۰"]]
        .forEach(function (o) {
          var op = document.createElement("option");
          op.value = o[0]; op.textContent = o[1];
          yearSel.appendChild(op);
        });
      [["0", "هر امتیازی"], ["7", "امتیاز +۷"], ["8", "امتیاز +۸"], ["9", "امتیاز +۹"]]
        .forEach(function (o) {
          var op = document.createElement("option");
          op.value = o[0]; op.textContent = o[1];
          ratingSel.appendChild(op);
        });
    }

    // hero quick genres (top 8)
    if (!quickWrap.childNodes.length) {
      quickWrap.innerHTML = gs.slice(0, 8).map(function (g) {
        return chip(esc(g), g, false, ' data-quick="1"');
      }).join("");
    }
  }

  /* ── filtering ── */
  function filtered(opts) {
    opts = opts || {};
    var q = norm(state.q);
    var out = [];
    for (var i = 0; i < DATA.length; i++) {
      var t = DATA[i];
      if (!opts.ignoreType && state.type !== "all" && t.p !== state.type) continue;
      if (state.genre !== "همه" && (t.g || []).indexOf(state.genre) === -1) continue;
      if (t.y < state.y0 || t.y > state.y1) continue;
      if (t.r < state.minR) continue;
      if (q) {
        var hit = norm(t.t).indexOf(q) !== -1 || norm(t.e).indexOf(q) !== -1;
        if (!hit) continue;
      }
      out.push(t);
    }
    if (opts.ignoreType) return out;
    if (state.sort === "rating") out.sort(function (a, b) { return b.r - a.r || b.y - a.y; });
    else if (state.sort === "newest") out.sort(function (a, b) { return b.y - a.y || b.r - a.r; });
    else out.sort(function (a, b) { return a.y - b.y || b.r - a.r; });
    return out;
  }

  /* ── card rendering ── */
  function cardHtml(t) {
    var g = (t.g || []).slice(0, 1).join("");
    var meta = typeFa(t.p) + " · " + faNum(t.y || "") + (g ? " · " + esc(g) : "");
    return '<article class="card">' +
      '<button type="button" class="poster" data-i="' + t.i + '" aria-label="پیش‌نمایش ' + esc(t.t || t.e) + '">' +
        (t.q ? '<span class="badge badge-q">' + esc(t.q) + "</span>" : "") +
        (t.r ? '<span class="badge badge-r">' + STAR_SVG + t.r + "</span>" : "") +
        '<img loading="lazy" decoding="async" src="' + coverUrl(t.i) + '" alt="پوستر ' + esc(t.t || t.e) + '" width="300" height="450">' +
        '<span class="ph" hidden>' + PLAY_SVG + "</span>" +
      "</button>" +
      "<h3>" + esc(t.t || t.e) + "</h3>" +
      '<p class="meta">' + meta + "</p>" +
      "</article>";
  }

  function hookImgFallback(scope) {
    var imgs = scope.querySelectorAll(".poster img");
    Array.prototype.forEach.call(imgs, function (img) {
      img.addEventListener("error", function () {
        img.remove();
        var ph = img.parentNode.querySelector(".ph");
        if (ph) ph.hidden = false;
      });
    });
  }

  function render() {
    var list = filtered();
    var slice = list.slice(0, state.shown);

    if (state.q) {
      titleEl.innerHTML = "نتایج برای «" + esc(state.q) + "»";
      countEl.textContent = faGroup(list.length) + " عنوان پیدا شد · از میان ۱٬۶۰۰ عنوان منتخب این صفحه";
    } else {
      titleEl.textContent = "برترین‌های فریم";
      countEl.textContent = faGroup(list.length) + " عنوان منتخب از " + faGroup(TOTAL_LIBRARY) + " عنوان کتابخانه";
    }

    var frag = document.createElement("div");
    frag.innerHTML = slice.map(cardHtml).join("");
    hookImgFallback(frag);

    grid.innerHTML = "";
    while (frag.firstChild) grid.appendChild(frag.firstChild);

    emptyBox.hidden = list.length !== 0;
    grid.style.display = list.length ? "" : "none";
    moreBtn.hidden = list.length <= state.shown;
    moreBtn.textContent = "نمایش " + faGroup(Math.min(PAGE, list.length - state.shown)) + " عنوان بیشتر (از " + faGroup(list.length) + ")";
    buildControls();
  }

  /* ── preview modal ── */
  var modal = document.getElementById("modal");
  var modalImg = document.getElementById("modal-img");
  var modalTitle = document.getElementById("modal-title");
  var modalEn = document.getElementById("modal-en");
  var modalMeta = document.getElementById("modal-meta");
  var modalBadges = document.getElementById("modal-badges");
  var lastFocus = null;

  function openModal(t) {
    lastFocus = document.activeElement;
    modalImg.src = coverUrl(t.i);
    modalImg.alt = "پوستر " + (t.t || t.e);
    modalTitle.textContent = t.t || t.e;
    modalEn.textContent = (t.e && t.e !== t.t) ? t.e : "";
    var g = (t.g || []).join(" · ");
    modalMeta.textContent = typeFa(t.p) + " · " + faNum(t.y || "") + (g ? " · " + g : "");
    var b = "";
    if (t.r) b += '<span class="b-rate">★ ' + t.r + " IMDb</span>";
    if (t.q) b += "<span>" + esc(t.q) + "</span>";
    modalBadges.innerHTML = b;
    modal.hidden = false;
    document.body.style.overflow = "hidden";
    modal.querySelector(".modal-close").focus();
  }
  function closeModal() {
    modal.hidden = true;
    document.body.style.overflow = "";
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }
  modal.addEventListener("click", function (e) {
    if (e.target.closest("[data-close]")) closeModal();
  });
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && !modal.hidden) closeModal();
  });

  /* ── events (delegated) ── */
  document.addEventListener("click", function (e) {
    var el;

    // poster -> modal
    el = e.target.closest(".poster");
    if (el) {
      var tt = el.getAttribute("data-i");
      for (var i = 0; i < DATA.length; i++) {
        if (DATA[i].i === tt) { openModal(DATA[i]); break; }
      }
      return;
    }

    // type / sort / genre chips
    el = e.target.closest("#type-chips .chip");
    if (el) { state.type = el.getAttribute("data-v"); state.shown = PAGE; render(); return; }
    el = e.target.closest("#sort-chips .chip");
    if (el) { state.sort = el.getAttribute("data-v"); state.shown = PAGE; render(); return; }
    el = e.target.closest("#genre-chips .chip");
    if (el) { state.genre = el.getAttribute("data-v"); state.shown = PAGE; render(); scrollBrowse(false); return; }

    // hero quick genre -> jump to browse with filter
    el = e.target.closest("#quick-genres .chip");
    if (el) {
      state.genre = el.getAttribute("data-v");
      state.shown = PAGE;
      scrollBrowse(true);
      render();
      return;
    }

    // navbar search -> focus hero input
    if (e.target.closest("#nav-search")) {
      window.scrollTo({ top: 0, behavior: "smooth" });
      setTimeout(function () { qInput.focus(); }, 250);
      return;
    }

    if (e.target.closest("#more")) { state.shown += PAGE; render(); }
  });

  function scrollBrowse(toSection) {
    var target = document.getElementById("browse");
    if (!target) return;
    if (toSection) {
      window.scrollTo({ top: target.offsetTop - 70, behavior: "smooth" });
    }
  }

  var deb = null;
  qInput.addEventListener("input", function () {
    clearTimeout(deb);
    deb = setTimeout(function () {
      state.q = qInput.value;
      state.shown = PAGE;
      render();
    }, 220);
  });
  searchForm.addEventListener("submit", function (e) {
    e.preventDefault();
    clearTimeout(deb);
    state.q = qInput.value;
    state.shown = PAGE;
    render();
  });
  yearSel.addEventListener("change", function () {
    var p = yearSel.value.split("-");
    state.y0 = +p[0]; state.y1 = +p[1];
    state.shown = PAGE;
    render();
  });
  ratingSel.addEventListener("change", function () {
    state.minR = +ratingSel.value;
    state.shown = PAGE;
    render();
  });

  /* ── boot ── */
  fetch("browse.json")
    .then(function (r) { if (!r.ok) throw 0; return r.json(); })
    .then(function (d) {
      DATA = (d && d.titles) || [];
      if (d && d.counts && d.counts.total) TOTAL_LIBRARY = Math.max(TOTAL_LIBRARY, 19271);
      buildControls();
      render();
    })
    .catch(function () {
      countEl.textContent = "بارگذاری کتابخانه ناموفق بود — صفحه را دوباره باز کن.";
    });
})();
