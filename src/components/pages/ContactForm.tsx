"use client";

import { useState } from "react";
import { toast } from "sonner";
import { CheckCircleIcon } from "../Icons";
import { sendContactMessage } from "@/lib/cloud";

export default function ContactForm() {
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [f, setF] = useState({ name: "", email: "", topic: "پیشنهاد", message: "" });
  const valid = f.name.trim() && /\S+@\S+\.\S+/.test(f.email) && f.message.trim().length >= 10;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!valid) return toast.error("لطفاً همه فیلدها را درست پر کنید");
    setBusy(true);
    try {
      // v0.29.0 (NEW-DATA-13) — the form used to PRETEND to send: the message
      // landed in a localStorage outbox nothing ever read. Now it really goes
      // to the cloud (user_events → support), and when offline / signed-out
      // it queues and is flushed automatically on the next sync — the UI
      // says WHICH of the two happened.
      const outcome = await sendContactMessage(f);
      setSent(true);
      if (outcome === "sent") toast.success("پیام شما ارسال شد");
      else toast.message("پیام ذخیره شد و به‌محض اتصال به سرور ارسال می‌شود");
    } catch {
      toast.error("ارسال ممکن نشد — دوباره تلاش کنید");
    } finally {
      setBusy(false);
    }
  };

  if (sent)
    return (
      <div className="rounded-3xl border border-emerald-500/20 bg-emerald-500/5 p-10 text-center">
        <CheckCircleIcon width={40} height={40} className="mx-auto text-emerald-400" />
        <p className="mt-4 text-xl font-black text-white">پیام شما دریافت شد</p>
        <p className="mt-2 text-sm text-zinc-400">معمولاً ظرف ۲۴ ساعت کاری پاسخ می‌دهیم.</p>
        <button type="button" onClick={() => { setSent(false); setF({ name: "", email: "", topic: "پیشنهاد", message: "" }); }} className="mt-6 rounded-full border border-white/15 px-5 py-2 text-sm font-bold text-white hover:bg-white/10">پیام جدید</button>
      </div>
    );

  const inp = "mt-1.5 h-11 w-full rounded-xl border border-white/10 bg-black/40 px-4 text-sm text-white placeholder:text-zinc-600 focus:border-white/30 focus:outline-none";
  return (
    <form onSubmit={submit} className="space-y-4 rounded-3xl border border-white/5 bg-ink-800/60 p-6 sm:p-8">
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block text-xs font-bold text-zinc-400">نام<input className={inp} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="نام شما" /></label>
        <label className="block text-xs font-bold text-zinc-400">ایمیل<input className={inp} dir="ltr" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} placeholder="you@example.com" /></label>
      </div>
      <label className="block text-xs font-bold text-zinc-400">
        موضوع
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {["پیشنهاد", "گزارش مشکل", "درخواست فیلم", "همکاری", "سایر"].map((t) => (
            <button key={t} type="button" onClick={() => setF({ ...f, topic: t })} className={`rounded-full px-3 py-1.5 text-xs font-bold transition ${f.topic === t ? "bg-white text-black" : "bg-white/5 text-zinc-300 hover:bg-white/10"}`}>{t}</button>
          ))}
        </div>
      </label>
      <label className="block text-xs font-bold text-zinc-400">
        پیام
        <textarea rows={5} className={`${inp} h-auto resize-none py-3 leading-7`} value={f.message} onChange={(e) => setF({ ...f, message: e.target.value.slice(0, 1000) })} placeholder="حداقل ۱۰ کاراکتر…" />
      </label>
      <div className="flex items-center justify-between">
        <span className="text-[11px] text-zinc-500">با ارسال پیام، قوانین استفاده را می‌پذیرید.</span>
        <button type="submit" disabled={!valid || busy} className="h-11 rounded-full bg-brand px-7 text-sm font-bold text-white hover:bg-brand-600 disabled:opacity-40">{busy ? "در حال ارسال…" : "ارسال پیام"}</button>
      </div>
    </form>
  );
}
