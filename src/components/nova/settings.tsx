"use client";

import { useState } from "react";
import {
  Globe, MonitorPlay, FolderOpen, Gauge, Languages, Bot, Info,
  Shield, Bell,
} from "lucide-react";
import { faNum } from "@/lib/nova-data";
import type { NovaState } from "@/app/page";

function Switch({ on, onToggle, label }: { on: boolean; onToggle: () => void; label: string }) {
  return (
    <button
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={onToggle}
      className={`relative h-6.5 w-12 shrink-0 rounded-full border transition-all duration-300 ${
        on
          ? "border-amber-300/50 bg-gradient-to-l from-amber-300 to-orange-500 shadow-[0_0_14px_rgba(245,158,11,0.4)]"
          : "border-white/15 bg-white/10"
      }`}
      style={{ height: 26 }}
    >
      <span
        className={`absolute top-1/2 h-4.5 w-4.5 -translate-y-1/2 rounded-full bg-white shadow transition-all duration-300 ${
          on ? "start-1" : "start-[26px]"
        }`}
        style={{ height: 18, width: 18 }}
      />
    </button>
  );
}

export function SettingsView({ nova }: { nova: NovaState }) {
  const [toggles, setToggles] = useState<Record<string, boolean>>({
    dark: true,
    autostart: false,
    subtitle: true,
    notify: true,
    subtitleDownload: true,
  });
  const [quality, setQuality] = useState("خودکار");
  const [speed, setSpeed] = useState(80);
  const t = (k: string) => setToggles((s) => ({ ...s, [k]: !s[k] }));

  const qualities = ["خودکار", "4K", "1080p", "720p"];

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      {/* playback */}
      <section className="lg lg-pill rounded-3xl p-5" aria-label="پخش">
        <h3 className="mb-4 flex items-center gap-2 text-[15px] font-black">
          <MonitorPlay size={17} className="text-amber-400" />
          پخش
        </h3>
        <div className="space-y-3.5">
          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="text-[13px] font-bold">کیفیت پخش پیش‌فرض</div>
              <div className="text-[11px] text-muted-foreground">بر اساس سرعت اینترنت شما تنظیم می‌شود</div>
            </div>
            <div className="flex gap-1.5">
              {qualities.map((q) => (
                <button
                  key={q}
                  onClick={() => setQuality(q)}
                  className={`lg-pill rounded-xl px-3 py-1.5 text-[11.5px] font-bold transition-all ${
                    quality === q ? "lg-active text-amber-100" : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
          {[
            { k: "subtitle", title: "زیرنویس فارسی خودکار", desc: "در صورت وجود، زیرنویس به‌صورت خودکار بارگذاری می‌شود", icon: Languages },
            { k: "subtitleDownload", title: "دانلود خودکار زیرنویس", desc: "همراه با فیلم، زیرنویس فارسی هم دانلود شود", icon: Languages },
          ].map((row) => (
            <div key={row.k} className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="grid h-9 w-9 place-items-center rounded-xl bg-white/8 text-white/70">
                  <row.icon size={15} />
                </div>
                <div>
                  <div className="text-[13px] font-bold">{row.title}</div>
                  <div className="text-[11px] text-muted-foreground">{row.desc}</div>
                </div>
              </div>
              <Switch on={toggles[row.k]} onToggle={() => t(row.k)} label={row.title} />
            </div>
          ))}
        </div>
      </section>

      {/* downloads */}
      <section className="lg lg-pill rounded-3xl p-5" aria-label="دانلود">
        <h3 className="mb-4 flex items-center gap-2 text-[15px] font-black">
          <Gauge size={17} className="text-amber-400" />
          دانلود
        </h3>
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="grid h-9 w-9 place-items-center rounded-xl bg-white/8 text-white/70">
                <FolderOpen size={15} />
              </div>
              <div>
                <div className="text-[13px] font-bold">مسیر ذخیره‌سازی</div>
                <div className="text-[11px] text-muted-foreground" dir="ltr" style={{ textAlign: "right" }}>
                  D:\NovaPlay\Downloads
                </div>
              </div>
            </div>
            <button
              onClick={() => nova.toast("در نسخه دمو تغییر مسیر غیرفعال است")}
              className="lg-btn rounded-xl px-4 py-2 text-[11.5px] font-bold"
            >
              تغییر مسیر
            </button>
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between text-[13px]">
              <span className="font-bold">محدودیت سرعت دانلود</span>
              <span className="tabular text-[11.5px] text-muted-foreground">
                حداکثر {faNum(speed)} مگابیت/ثانیه
              </span>
            </div>
            <input
              type="range"
              min={10}
              max={100}
              value={speed}
              onChange={(e) => setSpeed(Number(e.target.value))}
              className="h-2 w-full cursor-pointer appearance-none rounded-full bg-white/10 accent-amber-400"
              style={{
                background: `linear-gradient(to left, #f59e0b ${speed}%, rgba(255,255,255,0.1) ${speed}%)`,
              }}
              aria-label="محدودیت سرعت دانلود"
            />
          </div>

          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="grid h-9 w-9 place-items-center rounded-xl bg-white/8 text-white/70">
                <Bot size={15} />
              </div>
              <div>
                <div className="text-[13px] font-bold">اجرای خودکار در بوت ویندوز</div>
                <div className="text-[11px] text-muted-foreground">نواپلی همراه با ویندوز اجرا شود</div>
              </div>
            </div>
            <Switch on={toggles.autostart} onToggle={() => t("autostart")} label="اجرای خودکار" />
          </div>
        </div>
      </section>

      {/* general */}
      <section className="lg lg-pill rounded-3xl p-5" aria-label="عمومی">
        <h3 className="mb-4 flex items-center gap-2 text-[15px] font-black">
          <Globe size={17} className="text-amber-400" />
          عمومی و اعلان‌ها
        </h3>
        <div className="space-y-3.5">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="grid h-9 w-9 place-items-center rounded-xl bg-white/8 text-white/70">
                <Globe size={15} />
              </div>
              <div>
                <div className="text-[13px] font-bold">زبان رابط کاربری</div>
                <div className="text-[11px] text-muted-foreground">Persian (Iran) — فارسی</div>
              </div>
            </div>
            <button
              onClick={() => nova.toast("نسخه انگلیسی در نسخه‌های بعدی اضافه می‌شود")}
              className="lg-btn rounded-xl px-4 py-2 text-[11.5px] font-bold"
            >
              تغییر
            </button>
          </div>
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="grid h-9 w-9 place-items-center rounded-xl bg-white/8 text-white/70">
                <Bell size={15} />
              </div>
              <div>
                <div className="text-[13px] font-bold">اعلان پایان دانلود</div>
                <div className="text-[11px] text-muted-foreground">پس از اتمام هر دانلود اطلاع بده</div>
              </div>
            </div>
            <Switch on={toggles.notify} onToggle={() => t("notify")} label="اعلان‌ها" />
          </div>
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="grid h-9 w-9 place-items-center rounded-xl bg-white/8 text-white/70">
                <Shield size={15} />
              </div>
              <div>
                <div className="text-[13px] font-bold">حالت ناشناس</div>
                <div className="text-[11px] text-muted-foreground">تاریخچه تماشا ذخیره نشود</div>
              </div>
            </div>
            <Switch on={false} onToggle={() => nova.toast("در نسخه نهایی فعال می‌شود")} label="حالت ناشناس" />
          </div>
        </div>
      </section>

      {/* about */}
      <section className="lg lg-pill flex items-center gap-4 rounded-3xl p-5">
        <div className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-amber-300 to-orange-600 text-xl font-black text-black">
          ن
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-2 text-[14px] font-black">
            نواپلی NovaPlay
            <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-medium tabular">v0.1.0-preview</span>
          </div>
          <p className="mt-1 flex items-center gap-1.5 text-[11.5px] leading-6 text-muted-foreground">
            <Info size={12} />
            نرم‌افزار ویندوزی دانلود و تماشای فیلم و سریال — ساخته‌شده با Electron، Next.js و طراحی Liquid Glass
          </p>
        </div>
      </section>
    </div>
  );
}
