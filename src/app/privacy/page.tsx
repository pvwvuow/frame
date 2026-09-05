import Link from "next/link";
import InfoPage, { Section } from "@/components/pages/InfoPage";
import { ShieldIcon } from "@/components/Icons";

export const metadata = { title: "حریم خصوصی" };

export default function PrivacyPage() {
  return (
    <InfoPage current="/privacy" icon={ShieldIcon} eyebrow="شفافیت" title="حریم خصوصی" lead="ما فقط چیزی را ذخیره می‌کنیم که برای تجربه‌ی بهتر شما لازم است؛ نه بیشتر.">
      <Section title="چه داده‌ای ذخیره می‌شود؟">
        <p>یک شناسه‌ی ناشناس (کوکی <code dir="ltr" className="rounded bg-white/10 px-1 text-xs">nama_uid</code>) برای تشخیص دستگاه شما، لیست تماشا، علاقه‌مندی‌ها، امتیازهای شخصی، پیشرفت تماشا و تنظیمات پروفایل.</p>
        <p>هیچ اطلاعات هویتی مانند نام واقعی، شماره تلفن یا موقعیت مکانی جمع‌آوری نمی‌شود.</p>
      </Section>
      <Section title="کنترل شما">
        <p>در <Link href="/settings" className="text-brand hover:underline">صفحه تنظیمات</Link> می‌توانید هر بخش از داده‌ها (تاریخچه، لیست، علاقه‌مندی، امتیازها) را جداگانه یا یک‌جا پاک کنید. با پاک کردن کوکی مرورگر نیز ارتباط داده‌ها با دستگاه شما قطع می‌شود.</p>
      </Section>
      <Section title="اشتراک‌گذاری با اشخاص ثالث">
        <p>داده‌های شما فروخته یا با شرکت‌های تبلیغاتی به اشتراک گذاشته نمی‌شود. نما بدون تبلیغ است.</p>
      </Section>
      <Section title="تغییرات این سیاست">
        <p>در صورت تغییر، نسخه‌ی جدید در همین صفحه منتشر می‌شود. آخرین به‌روزرسانی: {new Date().toLocaleDateString("fa-IR", { year: "numeric", month: "long" })}.</p>
      </Section>
    </InfoPage>
  );
}
