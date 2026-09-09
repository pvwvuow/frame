"use client";

/* v0.16.0 — in-app self-update for the Android app, SPLIT ASSETS edition.
 *
 * v0.12..v0.15 attached ONE webbundle zip that carried the whole out/ tree —
 * 130MB of which ~107MB were covers — so «آپدیت درون‌برنامه‌ای» downloaded
 * essentially the full app every time. The release surface is now split:
 *
 *   Frame-webbundle-vX.Y.Z-nN.zip   code + catalog shards (~20MB) → hot OTA,
 *                                   setServerBasePath swap, NO reinstall
 *   Frame-coverpack-rN-pNN.zip      poster/backdrop webp chunks (~12MB each,
 *                                   views-ordered) → MERGED into the live web
 *                                   root by the native applyCoverPack
 *   Frame-vX.Y.Z-android.apk        full install, only when the native surface
 *                                   (nativeRev) changed
 *
 * The cover chunks are applied incrementally and resume across boots
 * (localStorage bookkeeping), so a flaky connection never restarts from zero:
 * «فقط بخش‌هایی که تازه تغییر کرده‌اند دانلود می‌شوند».
 */

import { nativeBridge, getInstallInfo, type NamaDownloadEvent } from "./native-bridge";

const REPO = "pvwvuow/frame";
const LATEST = `https://api.github.com/repos/${REPO}/releases/latest`;
const LAST_CHECK_KEY = "frame.update.lastCheck";
const COVERS_REV_KEY = "frame.covers.rev";
const partsKey = (rev: number) => `frame.covers.parts.r${rev}`;

/** CI asset names:
 *  Frame-webbundle-v0.16.0-n3.zip / Frame-coverpack-r1-p01.zip / Frame-v0.16.0-android.apk */
const BUNDLE_RE = /^Frame-webbundle-v\d+\.\d+\.\d+-n(\d+)\.zip$/i;
const APK_RE = /^Frame-v\d+\.\d+\.\d+-android\.apk$/i;
const PACK_RE = /^Frame-coverpack-r(\d+)-p(\d+)\.zip$/i;

export type PackPart = { part: number; url: string; size: number };

export type UpdateCheck = {
  available: boolean;
  version: string;
  current: string;
  /** new app version AND the web bundle can hot-swap (nativeRev not newer) */
  ota: boolean;
  /** new app version requires a full APK (native surface changed) */
  apk: boolean;
  bundleUrl?: string;
  bundleSize?: number;
  apkUrl?: string;
  apkSize?: number;
  releaseNativeRev: number;
  /** covers pack attached to the release (highest rev wins) */
  packRev: number;
  packParts: PackPart[];
  /** covers upgrade needed even if the app version is current */
  coversOnly: boolean;
};

function versionTuple(v: string): [number, number, number] {
  const m = /v?(\d+)\.(\d+)\.(\d+)/.exec(v || "");
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : [0, 0, 0];
}

function isNewer(a: string, b: string): boolean {
  const [a1, a2, a3] = versionTuple(a);
  const [b1, b2, b3] = versionTuple(b);
  return a1 !== b1 ? a1 > b1 : a2 !== b2 ? a2 > b2 : a3 > b3;
}

type Asset = { name: string; browser_download_url: string; size: number };

/** The covers revision this install effectively carries: native baseline
 *  (BuildConfig/prefs) vs whatever the JS bookkeeping has merged. */
export function installedCoversRev(infoCoversRev: number | undefined): number {
  let local = 0;
  try {
    local = Number(localStorage.getItem(COVERS_REV_KEY) || 0) || 0;
  } catch {
    /* ignore */
  }
  return Math.max(infoCoversRev ?? 0, local);
}

function appliedParts(rev: number): number[] {
  try {
    const raw = localStorage.getItem(partsKey(rev));
    const arr = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(arr) ? arr.filter((n) => typeof n === "number") : [];
  } catch {
    return [];
  }
}

function markPartApplied(rev: number, part: number, total: number) {
  const arr = appliedParts(rev);
  if (!arr.includes(part)) arr.push(part);
  try {
    localStorage.setItem(partsKey(rev), JSON.stringify(arr));
    if (arr.length >= total) localStorage.setItem(COVERS_REV_KEY, String(rev));
  } catch {
    /* ignore */
  }
}

/** How many parts of `rev` are already merged (Settings card progress). */
export function appliedCoverCount(rev: number): number {
  return appliedParts(rev).length;
}

export async function checkForUpdate(): Promise<UpdateCheck | null> {
  const b = nativeBridge();
  const info = await getInstallInfo();
  if (!b || !info) return null;
  try {
    const res = await fetch(LATEST, {
      headers: { Accept: "application/vnd.github+json" },
      cache: "no-store",
    });
    if (!res.ok) return null;
    const rel = (await res.json()) as { tag_name?: string; assets?: Asset[] };
    const tag = rel.tag_name ?? "";
    const assets = rel.assets ?? [];
    let bundle: { url: string; size: number; nativeRev: number } | null = null;
    let apk: { url: string; size: number } | null = null;
    const packs = new Map<number, PackPart[]>();
    for (const a of assets) {
      const bm = BUNDLE_RE.exec(a.name);
      if (bm && !bundle) bundle = { url: a.browser_download_url, size: a.size, nativeRev: Number(bm[1]) };
      if (APK_RE.test(a.name) && !apk) apk = { url: a.browser_download_url, size: a.size };
      const pm = PACK_RE.exec(a.name);
      if (pm) {
        const rev = Number(pm[1]);
        const part = Number(pm[2]);
        const list = packs.get(rev) ?? [];
        list.push({ part, url: a.browser_download_url, size: a.size });
        packs.set(rev, list);
      }
    }
    for (const list of packs.values()) list.sort((x, y) => x.part - y.part);

    const newer = isNewer(tag, info.versionName);
    const bundleRev = bundle?.nativeRev ?? info.nativeRev + 1;
    const apkNeeded = newer && bundleRev > info.nativeRev;
    const otaNeeded = newer && !!bundle && !apkNeeded;

    // covers: the newest pack rev on the release vs what we carry
    let packRev = 0;
    for (const r of packs.keys()) if (r > packRev) packRev = r;
    const packParts = packRev > 0 ? packs.get(packRev) ?? [] : [];
    const coversNeeded = packParts.length > 0 && packRev > installedCoversRev(info.coversRev);

    const done = (c: Omit<UpdateCheck, "available">): UpdateCheck => {
      try {
        localStorage.setItem(LAST_CHECK_KEY, new Date().toISOString());
      } catch {
        /* ignore */
      }
      return { ...c, available: c.ota || c.apk || c.coversOnly };
    };

    if (!newer && !coversNeeded) {
      return done({
        version: tag,
        current: info.versionName,
        ota: false,
        apk: false,
        releaseNativeRev: bundle?.nativeRev ?? info.nativeRev,
        packRev,
        packParts,
        coversOnly: false,
      });
    }

    return done({
      version: tag,
      current: info.versionName,
      ota: otaNeeded,
      apk: apkNeeded,
      bundleUrl: bundle?.url,
      bundleSize: bundle?.size,
      apkUrl: apk?.url,
      apkSize: apk?.size,
      releaseNativeRev: bundle?.nativeRev ?? info.nativeRev + 1,
      packRev,
      packParts,
      coversOnly: !newer && coversNeeded,
    });
  } catch {
    return null;
  }
}

/* ---------------- progress fan-out ---------------- */
type ProgressListener = (p: {
  phase: "download" | "apply" | "install" | "covers" | "done" | "error";
  received?: number;
  total?: number;
  message?: string;
}) => void;
let progressListeners = new Set<ProgressListener>();
let wired = false;

export function onUpdateProgress(cb: ProgressListener): () => void {
  progressListeners.add(cb);
  wireEvents();
  return () => {
    progressListeners.delete(cb);
  };
}

function emit(p: Parameters<ProgressListener>[0]) {
  for (const l of [...progressListeners]) {
    try {
      l(p);
    } catch {
      /* ignore */
    }
  }
}

function wireEvents() {
  const b = nativeBridge();
  if (!b || wired) return;
  wired = true;
  void b.addListener("namaDownload", (e: NamaDownloadEvent) => {
    if (e.id !== "frame-update") return;
    if (e.type === "progress") emit({ phase: "download", received: e.received, total: e.total });
    else if (e.type === "done") emit({ phase: "apply" });
    else if (e.type === "error") emit({ phase: "error", message: "دانلود ناموفق بود" });
  });
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Apply the CODE bundle (hot OTA). Returns true when applied. */
async function applyCodeBundle(check: UpdateCheck): Promise<boolean> {
  const b = nativeBridge();
  if (!b || !check.bundleUrl) return false;
  const zipName = `ota/${check.version}-bundle.zip`;
  emit({ phase: "download", received: 0, total: check.bundleSize });
  await b.downloadFile({ id: "frame-update", url: check.bundleUrl, dest: zipName });
  await sleep(600);
  emit({ phase: "apply" });
  const r = await b.applyBundle({ zipPath: zipName, version: check.version });
  if (!r.ok) throw new Error("apply failed");
  // setServerBasePath reloads the WebView in place — «بدون نصب مجدد»
  return true;
}

/** Download + merge the remaining cover parts of `check` (resume-aware). */
async function applyCoverPacks(check: UpdateCheck): Promise<number> {
  const b = nativeBridge();
  if (!b || !check.packParts.length) return 0;
  const doneParts = appliedParts(check.packRev);
  let applied = 0;
  for (const p of check.packParts) {
    if (doneParts.includes(p.part)) continue;
    const nn = String(p.part).padStart(2, "0");
    const zipName = `covers-pack/r${check.packRev}-p${nn}.zip`;
    emit({ phase: "covers", received: 0, total: p.size, message: `بستهٔ کاور ${p.part} از ${check.packParts.length}` });
    await b.downloadFile({ id: "frame-update", url: p.url, dest: zipName });
    await sleep(400);
    try {
      await b.applyCoverPack({ zipPath: zipName, rev: check.packRev });
    } catch (err) {
      const msg = String(err ?? "");
      if (/no-webroot/i.test(msg)) throw new Error("no-webroot");
      throw new Error("pack apply failed");
    }
    markPartApplied(check.packRev, p.part, check.packParts.length);
    applied++;
    emit({ phase: "covers", received: p.size, total: p.size, message: `بستهٔ کاور ${p.part} نصب شد` });
  }
  return applied;
}

/** Run the update. Returns which path ran (throws on hard failure).
 *  One call performs ONE phase: APK install, code OTA (the page reloads), or
 *  the covers sync — the caller re-checks afterwards. */
export async function performUpdate(check: UpdateCheck): Promise<"ota" | "apk" | "covers"> {
  const b = nativeBridge();
  if (!b) throw new Error("unsupported");
  wireEvents();
  if (check.apk && check.apkUrl) {
    const apkName = `updates/frame-${check.version}.apk`;
    emit({ phase: "download", received: 0, total: check.apkSize });
    await b.downloadFile({ id: "frame-update", url: check.apkUrl, dest: apkName });
    await sleep(600);
    emit({ phase: "install" });
    const stat = await b.fileStat({ path: apkName });
    if (!stat.exists) throw new Error("apk missing");
    const r = await b.installApk({ path: apkName });
    if (!r.ok && r.needPermission) {
      emit({ phase: "error", message: "برای نصب، اجازهٔ «نصب برنامه‌های ناشناس» را بدهید و دوباره تلاش کنید" });
      return "apk";
    }
    emit({ phase: "done" });
    return "apk";
  }
  if (check.ota) {
    await applyCodeBundle(check);
    emit({ phase: "done" });
    return "ota";
  }
  if (check.coversOnly || check.packParts.length) {
    await runCoverSync(check);
    emit({ phase: "done" });
    return "covers";
  }
  throw new Error("no assets");
}

/** Covers sync (also the first-run bootstrap). If the WebView still serves
 *  from APK assets (no web root yet), the code bundle of the CURRENT release
 *  is applied first to materialize it, the page reloads and the next boot
 *  continues with the pack parts. */
export async function runCoverSync(check: UpdateCheck): Promise<void> {
  const info = await getInstallInfo();
  const b = nativeBridge();
  if (!b || !check.packParts.length) return;
  if (!info?.otaVersion && check.bundleUrl) {
    // bootstrap: materialize the web root, then reload; parts resume on boot
    await applyCodeBundle(check);
    emit({ phase: "done" });
    return;
  }
  const applied = await applyCoverPacks(check);
  if (applied > 0) {
    try {
      localStorage.setItem(COVERS_REV_KEY, String(check.packRev));
    } catch {
      /* ignore */
    }
    // NO reload here: the sync can run mid-session (boot +15s) and a reload
    // would interrupt playback. Merged covers are picked up by the next
    // <img> mount (any navigation re-renders the grids).
  }
}

/** Boot auto-check: at most once per 24h, 8s after launch, silent-fail. */
export function scheduleAutoUpdateCheck(onAvailable: (check: UpdateCheck) => void) {
  if (!nativeBridge()) return;
  const last = (() => {
    try {
      return localStorage.getItem(LAST_CHECK_KEY);
    } catch {
      return null;
    }
  })();
  if (last && Date.now() - Date.parse(last) < 24 * 3600 * 1000) return;
  setTimeout(() => {
    void checkForUpdate().then((c) => {
      if (c?.available) onAvailable(c);
    });
  }, 8000);
}

/** Cover-pack bootstrap: every boot, 15s in, silent — runs until every part
 *  of the newest pack rev is merged. Resumes from localStorage bookkeeping. */
export function scheduleCoverSync() {
  if (!nativeBridge()) return;
  setTimeout(() => {
    void (async () => {
      try {
        const c = await checkForUpdate();
        if (!c?.packParts.length) return;
        if (c.packRev <= installedCoversRev((await getInstallInfo())?.coversRev)) return;
        const remaining = c.packParts.filter((p) => !appliedParts(c.packRev).includes(p.part));
        if (!remaining.length) return;
        await runCoverSync(c);
      } catch {
        /* silent — next boot retries */
      }
    })();
  }, 15000);
}
