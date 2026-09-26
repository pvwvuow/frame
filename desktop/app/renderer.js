"use strict";

/* رابط کاربری دسکتاپ فریم — بدون وابستگی خارجی، آفلاین‌پذیر */

const COVER_BASES = [
  "https://tvframe.vip/covers-web",
  "https://raw.githubusercontent.com/pvwvuow/frame/main/docs/covers-web",
];

const PAGE = 60;

const state = {
  all: [],
  filtered: [],
  shown: PAGE,
  view: "browse",
  type: "all",
  genre: null,
  sort: "rating",
  query: "",
  myList: {},
  source: "bundled",
};

const el = {
  q: document.getElementById("q"),
  grid: document.getElementById("grid"),
  empty: document.getElementById("empty"),
  more: document.getElementById("more"),
  summary: document.getElementById("summary"),
  genres: document.getElementById("genres"),
  types: document.getElementById("types"),
  sort: document.getElementById("sort"),
  mycount: document.getElementById("mycount"),
  refresh: document.getElementById("refresh"),
  update: document.getElementById("update"),
  updateState: document.getElementById("updateState"),
  ver: document.getElementById("ver"),
  src: document.getElementById("src"),
  modal: document.getElementById("modal"),
  modalCard: document.getElementById("modalCard"),
};

const fa = (n) => String(n).replace(/[0-9]/g, (d) => "۰۱۲۳۴۵۶۷۸۹"[Number(d)]);
const coverUrl = (id, base = 0) => `${COVER_BASES[base]}/${id.slice(0, 3)}/${id}.webp`;

function escapeHtml(value) {
  return String(value == null ? "" : value).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[c]);
}

function typeLabel(kind) {
  return kind === "series" ? "سریال" : "فیلم";
}

/* ---------- داده ---------- */

async function boot() {
  const meta = await window.frame.meta();
  el.ver.textContent = `نسخه ${fa(meta.version)} • ${meta.platform}/${meta.arch}`;

  state.myList = (await window.frame.store.get("myList", {})) || {};
  paintMyCount();

  el.updateState.textContent = "…";
  const res = await window.frame.catalog.load();
  if (res.data && Array.isArray(res.data.titles)) {
    applyCatalog(res.data, res.source);
  } else {
    el.summary.textContent = "کاتالوگ در دسترس نیست.";
  }

  window.frame.updates.onStatus((payload) => renderUpdate(payload));
  renderUpdate({ state: "idle" });
}

function applyCatalog(data, source) {
  state.all = (data.titles || []).filter((t) => t && t.i && t.t);
  state.source = source || "bundled";
  el.src.textContent =
    state.source === "network" || state.source === "cache"
      ? `کاتالوگ: کش به‌روز (${fa(state.all.length)} عنوان)`
      : `کاتالوگ: داخلی (${fa(state.all.length)} عنوان)`;
  buildGenres();
  run();
}

function buildGenres() {
  const counts = new Map();
  for (const t of state.all) {
    for (const g of t.g || []) counts.set(g, (counts.get(g) || 0) + 1);
  }
  const top = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 14);
  el.genres.innerHTML = top
    .map(
      ([g, n]) =>
        `<button class="chip" data-genre="${escapeHtml(g)}">${escapeHtml(g)} <em>${fa(n)}</em></button>`
    )
    .join("");
}

/* ---------- فیلتر و مرتب‌سازی ---------- */

function run() {
  const q = state.query.trim().toLowerCase();
  let list;

  if (state.view === "mylist") {
    const ids = new Set(Object.keys(state.myList));
    list = state.all.filter((t) => ids.has(t.i));
  } else {
    list = state.all;
  }

  if (state.type !== "all") list = list.filter((t) => t.p === state.type);
  if (state.genre) list = list.filter((t) => (t.g || []).includes(state.genre));
  if (q) {
    list = list.filter(
      (t) =>
        (t.t && t.t.toLowerCase().includes(q)) ||
        (t.e && t.e.toLowerCase().includes(q)) ||
        (t.i && t.i.toLowerCase().includes(q))
    );
  }

  const sorters = {
    rating: (a, b) => (b.r || 0) - (a.r || 0),
    year: (a, b) => (b.y || 0) - (a.y || 0),
    title: (a, b) => String(a.t).localeCompare(String(b.t), "fa"),
  };
  list = [...list].sort(sorters[state.sort] || sorters.rating);

  state.filtered = list;
  state.shown = PAGE;
  paint();
}

function paint() {
  const list = state.filtered;
  const slice = list.slice(0, state.shown);
  el.grid.innerHTML = slice.map(cardHtml).join("");
  el.empty.classList.toggle("hidden", list.length > 0);
  el.more.classList.toggle("hidden", state.shown >= list.length);
  el.summary.innerHTML = list.length
    ? `<b>${fa(list.length)}</b> عنوان${
        state.genre ? ` در ژانر «${escapeHtml(state.genre)}»` : ""
      }${state.type !== "all" ? ` • ${typeLabel(state.type)}` : ""}${
        state.view === "mylist" ? " • لیست من" : ""
      }`
    : "";
}

function cardHtml(t) {
  const saved = Boolean(state.myList[t.i]);
  return `
    <button class="card" data-id="${t.i}">
      <span class="poster">
        <img loading="lazy" src="${coverUrl(t.i)}" data-id="${t.i}" alt="${escapeHtml(t.t)}" />
        <span class="fallback">${escapeHtml(t.t)}</span>
        <span class="badges">
          <span class="badge">${typeLabel(t.p)}</span>
          <span class="badge alt">${escapeHtml(t.q || "HD")}</span>
        </span>
        ${saved ? '<span class="saved">در لیست</span>' : ""}
      </span>
      <span class="meta">
        <span class="name">${escapeHtml(t.t)}</span>
        <span class="sub">
          <span class="rate">★ ${fa((t.r || 0).toFixed(1))}</span>
          <span>${fa(t.y || "")}</span>
        </span>
      </span>
    </button>`;
}

/* ---------- مودال ---------- */

function openModal(id) {
  const t = state.all.find((x) => x.i === id);
  if (!t) return;
  const saved = Boolean(state.myList[t.i]);
  el.modalCard.innerHTML = `
    <div class="modal-poster">
      <img src="${coverUrl(t.i)}" data-id="${t.i}" alt="${escapeHtml(t.t)}" />
      <span class="fallback">${escapeHtml(t.t)}</span>
    </div>
    <div class="modal-body">
      <h2>${escapeHtml(t.t)}</h2>
      <p class="en">${escapeHtml(t.e || "")}</p>
      <ul class="facts">
        <li><span>نوع</span><b>${typeLabel(t.p)}</b></li>
        <li><span>سال</span><b>${fa(t.y || "—")}</b></li>
        <li><span>امتیاز</span><b>★ ${fa((t.r || 0).toFixed(1))}</b></li>
        <li><span>کیفیت</span><b>${escapeHtml(t.q || "—")}</b></li>
        <li><span>شناسه</span><b dir="ltr">${escapeHtml(t.i)}</b></li>
      </ul>
      <div class="tags">${(t.g || []).map((g) => `<span>${escapeHtml(g)}</span>`).join("")}</div>
      <div class="actions">
        <button class="primary" data-act="toggle" data-id="${t.i}">${
          saved ? "حذف از لیست من" : "افزودن به لیست من"
        }</button>
        <button class="ghost" data-act="imdb" data-id="${t.i}">صفحه IMDb</button>
        <button class="ghost" data-close>بستن</button>
      </div>
    </div>`;
  el.modal.classList.remove("hidden");
}

function closeModal() {
  el.modal.classList.add("hidden");
}

/* ---------- لیست من ---------- */

function paintMyCount() {
  el.mycount.textContent = fa(Object.keys(state.myList).length);
}

async function toggleMyList(id) {
  if (state.myList[id]) delete state.myList[id];
  else state.myList[id] = Date.now();
  await window.frame.store.set("myList", state.myList);
  paintMyCount();
  run();
  const t = state.all.find((x) => x.i === id);
  if (t && !el.modal.classList.contains("hidden")) openModal(id);
}

/* ---------- آپدیت ---------- */

function renderUpdate(payload) {
  const map = {
    idle: "به‌روزرسانی خودکار فعال است",
    dev: "حالت توسعه — آپدیت غیرفعال",
    checking: "در حال بررسی نسخه‌ی جدید…",
    available: `نسخه ${fa(payload.version || "")} موجود است — در حال آماده‌سازی`,
    uptodate: "برنامه به‌روز است",
    downloading: `در حال دانلود: ${fa(payload.percent || 0)}٪`,
    downloaded: "دانلود شد — برای نصب دوباره اجرا کن",
    error: `خطای آپدیت: ${payload.message || "نامشخص"}`,
  };
  el.updateState.textContent = map[payload.state] || payload.state || "";

  if (payload.state === "downloaded") {
    el.update.textContent = "نصب و اجرای مجدد";
    el.update.classList.add("accent");
    el.update.onclick = () => window.frame.updates.install();
  } else if (payload.state === "available") {
    el.update.textContent = "دریافت نسخه جدید";
    el.update.classList.add("accent");
    el.update.onclick = () => window.frame.updates.download();
  } else {
    el.update.textContent = "بررسی آپدیت";
    el.update.classList.remove("accent");
    el.update.onclick = () => window.frame.updates.check();
  }
}

/* ---------- رویدادها ---------- */

let debounce = null;
el.q.addEventListener("input", (e) => {
  clearTimeout(debounce);
  debounce = setTimeout(() => {
    state.query = e.target.value;
    run();
  }, 140);
});

el.types.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-type]");
  if (!btn) return;
  state.type = btn.dataset.type;
  [...el.types.querySelectorAll(".chip")].forEach((c) => c.classList.toggle("active", c === btn));
  run();
});

el.genres.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-genre]");
  if (!btn) return;
  const g = btn.dataset.genre;
  state.genre = state.genre === g ? null : g;
  [...el.genres.querySelectorAll(".chip")].forEach((c) =>
    c.classList.toggle("active", c.dataset.genre === state.genre)
  );
  run();
});

el.sort.addEventListener("change", (e) => {
  state.sort = e.target.value;
  run();
});

el.more.addEventListener("click", () => {
  state.shown += PAGE * 2;
  paint();
});

el.grid.addEventListener("click", (e) => {
  const card = e.target.closest("[data-id]");
  if (card) openModal(card.dataset.id);
});

document.querySelectorAll(".views .pill").forEach((btn) =>
  btn.addEventListener("click", () => {
    state.view = btn.dataset.view;
    document.querySelectorAll(".views .pill").forEach((b) => b.classList.toggle("active", b === btn));
    run();
  })
);

el.refresh.addEventListener("click", async () => {
  el.refresh.disabled = true;
  el.refresh.textContent = "در حال دریافت…";
  const res = await window.frame.catalog.refresh();
  if (res.ok) applyCatalog(res.data, "network");
  el.refresh.disabled = false;
  el.refresh.textContent = res.ok ? "به‌روز شد" : "خطا در دریافت";
  setTimeout(() => (el.refresh.textContent = "به‌روزرسانی داده"), 2200);
});

el.modal.addEventListener("click", (e) => {
  if (e.target.closest("[data-close]")) return closeModal();
  const act = e.target.closest("[data-act]");
  if (!act) return;
  if (act.dataset.act === "toggle") toggleMyList(act.dataset.id);
  if (act.dataset.act === "imdb") window.frame.openExternal(`https://www.imdb.com/title/${act.dataset.id}/`);
});

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") closeModal();
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "f") {
    e.preventDefault();
    el.q.focus();
  }
});

/* جایگزین کاورهای شکست‌خورده با زنجیره‌ی منابع و در نهایت کارت متنی */
document.addEventListener(
  "error",
  (e) => {
    const img = e.target;
    if (!(img instanceof HTMLImageElement) || !img.dataset.id) return;
    const step = Number(img.dataset.step || 0);
    if (step < COVER_BASES.length - 1) {
      img.dataset.step = String(step + 1);
      img.src = coverUrl(img.dataset.id, step + 1);
    } else {
      img.style.display = "none";
      img.closest(".poster, .modal-poster")?.classList.add("no-img");
    }
  },
  true
);

boot();
