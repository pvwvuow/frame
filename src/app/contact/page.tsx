import InfoPage from "@/components/pages/InfoPage";
import ContactForm from "@/components/pages/ContactForm";
import { MailIcon, GlobeIcon, ClockIcon } from "@/components/Icons";

export const metadata = { title: "تماس با ما" };

export default function ContactPage() {
  return (
    <InfoPage current="/contact" icon={MailIcon} eyebrow="در خدمتیم" title="تماس با ما" lead="پیشنهاد، گزارش مشکل یا درخواست فیلم؟ فرم زیر را پر کنید؛ تیم فریم همیشه می‌خواند.">
      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        {[
          { icon: MailIcon, k: "ایمیل", v: "hello@nama.film" },
          { icon: ClockIcon, k: "پاسخ‌گویی", v: "شنبه تا پنجشنبه، ۹ تا ۱۸" },
          { icon: GlobeIcon, k: "شبکه‌ها", v: "@nama.film" },
        ].map((x) => (
          <div key={x.k} className="glass rounded-2xl px-4 py-3">
            <x.icon width={16} height={16} className="text-zinc-400" />
            <p className="mt-2 text-sm font-black text-white" dir="auto">{x.v}</p>
            <p className="text-[11px] text-zinc-400">{x.k}</p>
          </div>
        ))}
      </div>
      <ContactForm />
    </InfoPage>
  );
}
