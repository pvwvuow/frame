"use client";

/* v0.12.0 — in-app self-update for the Android app.
 *
 * «کاربر اندروید نباید هر بار کل برنامه را دانلود کند» — the new release's
 * WEB BUNDLE (the static export as a zip) is attached to the GitHub release
 * next to the APK. When the native surface did NOT change, the update is an
 * OTA: download the bundle (only the new bytes in practice — GitHub serves
 * gzip; typically a few MB), unzip to private storage and hot-swap the
 * WebView via setServerBasePath — NO reinstall, app restarts in place.
 * When the native surface DID change (release nativeRev > installed), the
 * APK is downloaded and handed to the system installer.
 */

import { nativeBridge, getInstallInfo, type NamaDownloadEvent } from "./native-bridge";

const REPO = "pvwvuow/frame";
const LATEST = `https://api.github.com/repos/${REPO}/releases/latest`;
const LAST_CHECK_KEY = "frame.update.lastCheck";

/** CI asset names: Frame-webbundle-v0.12.0-n2.zip / Frame-v0.12.0-android.apk */
const BUNDLE_RE = /^Frame-webbundle-v\d+\.\d+\.\d+-n(\d+)\.zip$/i;
const APK_RE = /^Frame-v\d+\.\d+\.\d+-android\.apk$/i;

export type UpdateCheck = {
  available: boolean;
  version: string;
  current: string;
  ota: boolean;
  bundleUrl?: string;
  bundleSize?: number;
  apkUrl?: string;
  apkSize?: number;
  releaseNativeRev: number;
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
    for (const a of assets) {
      const bm = BUNDLE_RE.exec(a.name);
      if (bm && !bundle) bundle = { url: a.browser_download_url, size: a.size, nativeRev: Number(bm[1]) };
      if (APK_RE.test(a.name) && !apk) apk = { url: a.browser_download_url, size: a.size };
    }
    if (!isNewer(tag, info.versionName)) {
      try {
        localStorage.setItem(LAST_CHECK_KEY, new Date().toISOString());
      } catch {
        /* ignore */
      }
      return { available: false, version: tag, current: info.versionName, ota: false, releaseNativeRev: info.nativeRev };
    }
    const otaPossible = !!bundle && bundle.nativeRev <= info.nativeRev;
    try {
      localStorage.setItem(LAST_CHECK_KEY, new Date().toISOString());
    } catch {
      /* ignore */
    }
    return {
      available: true,
      version: tag,
      current: info.versionName,
      ota: otaPossible,
      bundleUrl: bundle?.url,
      bundleSize: bundle?.size,
      apkUrl: apk?.url,
      apkSize: apk?.size,
      releaseNativeRev: bundle?.nativeRev ?? info.nativeRev + 1,
    };
  } catch {
    return null;
  }
}

/* ---------------- progress fan-out ---------------- */
type ProgressListener = (p: { phase: "download" | "apply" | "install" | "done" | "error"; received?: number; total?: number; message?: string }) => void;
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

/** Run the update. Returns when finished (throws on hard failure). */
export async function performUpdate(check: UpdateCheck): Promise<"ota" | "apk"> {
  const b = nativeBridge();
  if (!b) throw new Error("unsupported");
  wireEvents();
  if (check.ota && check.bundleUrl) {
    const zipName = `ota/${check.version}-bundle.zip`;
    emit({ phase: "download", received: 0, total: check.bundleSize });
    await b.downloadFile({ id: "frame-update", url: check.bundleUrl, dest: zipName });
    // the "done" download event flips to apply; give the engine a beat
    await new Promise((r) => setTimeout(r, 600));
    emit({ phase: "apply" });
    const r = await b.applyBundle({ zipPath: zipName, version: check.version });
    if (!r.ok) throw new Error("apply failed");
    emit({ phase: "done" });
    return "ota";
  }
  if (!check.apkUrl) throw new Error("no assets");
  const apkName = `updates/frame-${check.version}.apk`;
  emit({ phase: "download", received: 0, total: check.apkSize });
  await b.downloadFile({ id: "frame-update", url: check.apkUrl, dest: apkName });
  await new Promise((r) => setTimeout(r, 600));
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
