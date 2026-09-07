import CatalogPage from "@/components/CatalogPage";

export const metadata = { title: "فیلم‌ها | نما" };

export default function MoviesPage() {
  return (
    <CatalogPage
      type="movie"
      heading="فیلم‌ها"
      blurb="جدیدترین و محبوب‌ترین فیلم‌های سینمایی با کیفیت 4K، دوبله و زیرنویس اختصاصی؛ بدون تبلیغ و بدون وقفه."
    />
  );
}
