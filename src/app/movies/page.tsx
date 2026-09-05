import CatalogPage, { type CatalogSearchParams } from "@/components/CatalogPage";

export const dynamic = "force-dynamic";
export const metadata = { title: "فیلم‌ها | نما" };

export default function MoviesPage({ searchParams }: { searchParams: Promise<CatalogSearchParams> }) {
  return (
    <CatalogPage
      type="movie"
      heading="فیلم‌ها"
      blurb="جدیدترین و محبوب‌ترین فیلم‌های سینمایی با کیفیت 4K، دوبله و زیرنویس اختصاصی؛ بدون تبلیغ و بدون وقفه."
      searchParams={searchParams}
    />
  );
}
