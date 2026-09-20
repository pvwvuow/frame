/* Frame landing — auto-populate latest release version + direct download links
 * from the public GitHub API (no auth needed; graceful fallback to Releases page). */
(function () {
  "use strict";
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

  function apply(rel) {
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
        el.href = FALLBACK; // asset name changed → send to Releases page
      }
    });

    // show file size on each card when known
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

  if (!("fetch" in window)) return;
  fetch(API, { headers: { Accept: "application/vnd.github+json" } })
    .then(function (r) { return r.ok ? r.json() : Promise.reject(r.status); })
    .then(apply)
    .catch(function () { /* fallback links already point to Releases latest */ });
})();
