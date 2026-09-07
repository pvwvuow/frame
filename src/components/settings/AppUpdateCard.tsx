"use client";

import { useEffect, useState } from "react";
import { IS_MOBILE } from "@/lib/mobile-links";
import { fa } from "@/lib/format";

/* Android in-app update check: compares the built version against the latest
 * GitHub release and offers the APK asset for download (opened in the system
 * browser, which Android then treats as a normal APK install/update). */
const API = "https://api.github.com/repos/pvwvuow/frame/releases/latest";
const CUR = process.env.NEXT_PUBLIC_APP_VERSION || "";

type Rel = {
  tag_name: string;
  html_url: string;
  assets: { name: string; browser_download_url: string; size: number }[];
};

function cmpVersions(a: string, b: string): number {
  const pa = a.replace(/^v/, "").split(".").map((n) => parseInt(n, 10) || 0);
  const pb = b.replace(/^v/, "").split(".").map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < 3; i++) {
    const d = (pb[i] || 0) - (pa[i] || 0);
    if (d) return d;
  }
  return 0;
}

export default function AppUpdateCard() {
  const [rel, setRel] = useState<Rel | null>(null);
  const [state, setState] = useState<"checking" | "latest" | "update" | "error">("checking");

  useEffect(() => {
    if (!IS_MOBILE) return;
    let alive = true;
    fetch(API, { headers: { Accept: "application/vnd.github+json" } })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((j: Rel) => {
        if (!alive) return;
        setRel(j);
        const newer = cmpVersions(CUR, j.tag_name) > 0;
        setState(newer ? "update" : "latest");
      })
      .catch(() => alive && setState("error"));
    return () => {
      alive = false;
    };
  }, []);

  if (!IS_MOBILE) return null;

  const apk = rel?.assets.find((a) => a.name.endsWith(".apk"));
  const mb = apk ? (apk.size / 1024 / 1024).toFixed(0) : null;

  return (
    <section id="app-update" className="mt-8 scroll-mt-28 rounded-3xl border border-white/5 bg-ink-700/40 p-5 sm:p-6">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-sm font-extrabold text-white">به‌روزرسانی برنامه (اندروید)</h2>
          <p className="mt-1 text-xs text-zinc-500">نسخهٔ نصب‌شده: {CUR ? fa(CUR) : "—"}</p>
        </div>
        {state === "checking" && <span className="shrink-0 text-xs text-zinc-500">بررسی…</span>}
        {state === "latest" && (
          <span className="shrink-0 rounded-full bg-emerald-500/15 px-3 py-1.5 text-xs font-bold text-emerald-400">به‌روز است</span>
        )}
        {state === "error" && <span className="shrink-0 text-xs text-zinc-600">بررسی ناموفق — بعداً دوباره</span>}
      </div>

      {state === "update" && rel && (
        <div className="mt-4 rounded-2xl border border-brand/30 bg-brand/10 p-4">
          <p className="text-sm font-bold text-white">
            نسخهٔ جدید {fa(rel.tag_name.replace(/^v/, ""))} منتشر شده است
          </p>
          <p className="mt-1 text-xs leading-6 text-zinc-400">
            فایل نصبی جدید را دانلود و روی نسخهٔ فعلی نصب کنید — علاقه‌مندی‌ها و تاریخچهٔ شما حفظ می‌شود.
            {mb && <> حجم فایل: حدود {fa(mb)} مگابایت.</>}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {apk && (
              <a
                href={apk.browser_download_url}
                target="_blank"
                rel="noreferrer"
                className="rounded-full bg-brand px-5 py-2.5 text-xs font-extrabold text-white transition hover:brightness-110"
              >
                دانلود نسخهٔ جدید (APK)
              </a>
            )}
            <a
              href={rel.html_url}
              target="_blank"
              rel="noreferrer"
              className="rounded-full border border-white/15 px-5 py-2.5 text-xs font-bold text-zinc-200 transition hover:bg-white/5"
            >
              مشاهدهٔ تغییرات
            </a>
          </div>
        </div>
      )}
    </section>
  );
}
