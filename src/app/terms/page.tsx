import InfoPage, { Section } from "@/components/pages/InfoPage";
import { ShieldIcon } from "@/components/Icons";

export const metadata = { title: "قوانین استفاده" };

export default function TermsPage() {
  return (
    <InfoPage current="/terms" icon={ShieldIcon} eyebrow="توافق‌نامه" title="قوانین استفاده" lead="با استفاده از نما، شرایط زیر را می‌پذیرید. سعی کرده‌ایم ساده و بدون پیچیدگی بنویسیم.">
      <Section title="۱. استفاده شخصی">
        <p>محتوای نما برای تماشای شخصی و غیرتجاری ارائه می‌شود. بازپخش عمومی، دانلود غیرمجاز یا بازنشر محتوا مجاز نیست.</p>
      </Section>
      <Section title="۲. حساب و دستگاه‌ها">
        <p>پروفایل شما به دستگاه فعلی متصل است. مسئولیت حفظ دسترسی به دستگاه با شماست.</p>
      </Section>
      <Section title="۳. محتوای کاربران">
        <p>نقد و نظرهایی که ثبت می‌کنید باید محترمانه و بدون توهین باشد. نما می‌تواند محتوای نامناسب را حذف کند.</p>
      </Section>
      <Section title="۴. رده‌بندی سنی">
        <p>آثار با برچسب سنی نمایش داده می‌شوند. والدین می‌توانند از تنظیمات، نمایش محتوای بزرگسال را غیرفعال کنند.</p>
      </Section>
      <Section title="۵. تغییر سرویس">
        <p>ممکن است امکانات نما بدون اطلاع قبلی تغییر کند یا گسترش یابد. تلاش می‌کنیم تغییرات مهم را اطلاع‌رسانی کنیم.</p>
      </Section>
    </InfoPage>
  );
}
