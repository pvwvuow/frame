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
/* 5) cinema hero — auto-rotate slides + poster sync + dots */
(function(){
  var slidesWrap=document.getElementById('cinema-slides');
  var poster=document.getElementById('cinema-poster');
  if(!slidesWrap||!poster) return;
  var slides=[].slice.call(slidesWrap.querySelectorAll('.slide'));
  var dots=[].slice.call(document.querySelectorAll('.slide-dot'));
  if(slides.length<2) return;
  var idx=0; var timer=null; var reduced=window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  function show(n){
    idx=(n+slides.length)%slides.length;
    slides.forEach(function(s,i){ s.classList.toggle('is-active', i===idx); });
    dots.forEach(function(d,i){
      var on=i===idx;
      d.classList.toggle('is-on', on);
      d.setAttribute('aria-selected', on ? 'true' : 'false');
    });
    var p=slides[idx].getAttribute('data-poster');
    if(p) poster.src=p;
  }
  function next(){ show(idx+1); }
  function start(){ if(reduced) return; stop(); timer=setInterval(next, 5200); }
  function stop(){ if(timer){ clearInterval(timer); timer=null; } }
  dots.forEach(function(d,i){
    d.addEventListener('click', function(){ show(i); start(); });
  });
  slidesWrap.addEventListener('mouseenter', stop);
  slidesWrap.addEventListener('mouseleave', start);
  slidesWrap.addEventListener('focusin', stop);
  slidesWrap.addEventListener('focusout', start);
  document.addEventListener('visibilitychange', function(){ if(document.hidden) stop(); else start(); });
  show(0); start();
})();
/* 6) ghost ambient layer — gate + subtle parallax */
(function(){
  var layer=document.getElementById('ghost-layer');
  var gate=document.getElementById('home-ghost-gate');
  if(!layer) return;
  // one-by-one reveal: respect --dl stagger already via CSS animation-delay
  // gate: show layer after hero scrolled past a bit
  function setVisible(on){ layer.classList.toggle('is-visible', !!on); }
  if('IntersectionObserver' in window && gate){
    var io=new IntersectionObserver(function(ents){
      var e=ents[0];
      // when gate is above viewport, show ghosts
      setVisible(!e.isIntersecting || e.boundingClientRect.top < 80);
    }, {rootMargin:'-18% 0px -72% 0px', threshold:0});
    io.observe(gate);
    // initial: hidden until scroll
    setVisible(false);
  } else {
    setVisible(true);
  }
  // subtle parallax on scroll (rAF, respects reduced-motion)
  var reduced=window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if(reduced) return;
  var ticking=false;
  function parallax(){
    var y=window.scrollY||0;
    var off=Math.min(y*0.06, 120);
    layer.style.transform='translateY('+ (off*0.5) +'px)';
    // per-ghost micro offset
    var ghosts=layer.querySelectorAll('.ghost');
    for(var i=0;i<ghosts.length;i++){
      var g=ghosts[i];
      var depth=(i%3+1)*0.04;
      g.style.translate='0 '+ (off*depth) +'px';
    }
    ticking=false;
  }
  window.addEventListener('scroll', function(){
    if(!ticking){ ticking=true; requestAnimationFrame(parallax); }
  }, {passive:true});
})();
/* 7) stage dust particles + FAQ single-open nicety */
(function(){
  var dust=document.getElementById('stage-dust');
  if(dust && !window.matchMedia('(prefers-reduced-motion: reduce)').matches){
    var frag=document.createDocumentFragment();
    for(var i=0;i<18;i++){
      var s=document.createElement('i');
      s.style.left=(Math.random()*100)+'%';
      s.style.top=(Math.random()*100)+'%';
      s.style.animationDuration=(9+Math.random()*14)+'s';
      s.style.animationDelay=(-Math.random()*14)+'s';
      s.style.opacity=(0.2+Math.random()*0.45).toFixed(2);
      frag.appendChild(s);
    }
    dust.appendChild(frag);
  }
  // details: keep only one QA open at a time (optional polish)
  var qas=[].slice.call(document.querySelectorAll('.qa'));
  qas.forEach(function(d){
    d.addEventListener('toggle', function(){
      if(d.open) qas.forEach(function(o){ if(o!==d) o.open=false; });
    });
  });
})();
