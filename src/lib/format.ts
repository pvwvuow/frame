const FA_DIGITS = ["۰", "۱", "۲", "۳", "۴", "۵", "۶", "۷", "۸", "۹"];

export function fa(n: number | string): string {
  return String(n).replace(/\d/g, (d) => FA_DIGITS[Number(d)]);
}

export function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h && m) return `${fa(h)} ساعت و ${fa(m)} دقیقه`;
  if (h) return `${fa(h)} ساعت`;
  return `${fa(m)} دقیقه`;
}

export function formatViews(v: number): string {
  if (v >= 1_000_000) return `${fa((v / 1_000_000).toFixed(1))} میلیون`;
  if (v >= 1_000) return `${fa(Math.round(v / 1000))} هزار`;
  return fa(v);
}

export function formatClock(seconds: number): string {
  if (!Number.isFinite(seconds)) return "0:00";
  const s = Math.floor(seconds % 60);
  const m = Math.floor((seconds / 60) % 60);
  const h = Math.floor(seconds / 3600);
  const mm = h ? String(m).padStart(2, "0") : String(m);
  const ss = String(s).padStart(2, "0");
  return h ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

export function typeLabel(type: string) {
  return type === "series" ? "سریال" : "فیلم";
}
