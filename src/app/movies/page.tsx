import CatalogPage from "@/components/CatalogPage";

export const dynamic = "force-dynamic";
export const metadata = { title: "فیلم‌ها | نما" };

export default function MoviesPage({ searchParams }: { searchParams: Promise<{ genre?: string; sort?: string }> }) {
  return (
    <CatalogPage
      type="movie"
      heading="فیلم‌ها"
      blurb="جدیدترین و محبوب‌ترین فیلم‌های سینمایی با کیفیت 4K"
      searchParams={searchParams}
    />
  );
}
