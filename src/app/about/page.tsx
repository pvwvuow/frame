import Link from "next/link";
import InfoPage, { Section } from "@/components/pages/InfoPage";
import { SparkIcon, FilmIcon, TvIcon, GlobeIcon, ShieldIcon, SubtitleIcon, ClapperIcon, DownloadIcon } from "@/components/Icons";
import { getCatalogStats } from "@/lib/queries";
import { fa, formatViews } from "@/lib/format";

export const dynamic = "force-dynamic";
export const metadata = { title: "درباره فریم" };

export default async function AboutPage() {
  const [m, s] = await Promise.all([getCatalogStats("movie"), getCatalogStats("series")]);
  const feats = [
    { icon: ClapperIcon, t: "کیفیت 4K HDR", d: "پخش با بالاترین کیفیت و صدای فراگیر، متناسب با سرعت اینترنت شما." },
    { icon: SubtitleIcon, t: "زیرنویس و دوبله", d: "زیرنویس فارسی و انگلیسی برای همه آثار؛ دوبله برای منتخب‌ها." },
    { icon: GlobeIcon, t: "روی همه دستگاه‌ها", d: "وب، موبایل، تبلت و تلویزیون؛ ادامه تماشا از همان‌جا که رها کردید." },
    { icon: ShieldIcon, t: "بدون تبلیغ", d: "هیچ تبلیغی وسط فیلم نمی‌بینید. تجربه‌ی سینمایی خالص." },
    { icon: DownloadIcon, t: "لیست و علاقه‌مندی", d: "لیست تماشا، علاقه‌مندی‌ها، یادداشت و امتیاز شخصی برای هر اثر." },
    { icon: SparkIcon, t: "پیشنهاد هوشمند", d: "بر اساس سلیقه‌ی شما و ژانرهای محبوب‌تان پیشنهاد می‌دهیم." },
  ];
  return (
    <InfoPage current="/about" icon={SparkIcon} eyebrow="داستان ما" title="درباره فریم" lead="فریم یک سینمای آنلاین فارسی است؛ جایی که هر شب می‌توانید یک تجربه‌ی سینمایی تازه داشته باشید. ما با عشق به سینما و وسواس در جزئیات، تلاش می‌کنیم بهترین تجربه‌ی تماشا را با زبان و حس‌وحال ایرانی بسازیم.">
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { icon: FilmIcon, v: fa(m.count), k: "فیلم" },
          { icon: TvIcon, v: fa(s.count), k: "سریال" },
          { icon: SparkIcon, v: formatViews(m.totalViews + s.totalViews), k: "بازدید" },
          { icon: ClapperIcon, v: fa(((m.avgRating + s.avgRating) / 2).toFixed(1)), k: "میانگین امتیاز" },
        ].map((x) => (
          <div key={x.k} className="glass rounded-2xl px-4 py-3">
            <x.icon width={16} height={16} className="text-zinc-400" />
            <p className="mt-2 text-lg font-black text-white num">{x.v}</p>
            <p className="text-[11px] text-zinc-400">{x.k}</p>
          </div>
        ))}
      </div>
      <Section title="چرا نما؟">
        <div className="grid gap-3 sm:grid-cols-2">
          {feats.map((f) => (
            <div key={f.t} className="flex gap-3 rounded-2xl border border-white/5 bg-white/[0.03] p-4">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-brand/15 text-brand"><f.icon width={18} height={18} /></span>
              <div>
                <p className="font-bold text-white">{f.t}</p>
                <p className="mt-1 text-xs leading-6 text-zinc-400">{f.d}</p>
              </div>
            </div>
          ))}
        </div>
      </Section>
      <Section title="ماموریت ما">
        <p>باور داریم سینما فقط سرگرمی نیست؛ زبان مشترک آدم‌هاست. هدف ما ساختن پلتفرمی است که در آن پیدا کردن فیلمِ درست برای امشب، به اندازه‌ی تماشای آن لذت‌بخش باشد.</p>
        <p>فریم به‌صورت مداوم به‌روزرسانی می‌شود؛ اگر ایده یا پیشنهادی دارید، <Link href="/contact" className="text-brand hover:underline">با ما در میان بگذارید</Link>.</p>
      </Section>
    </InfoPage>
  );
}
