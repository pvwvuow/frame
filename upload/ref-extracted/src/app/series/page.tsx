import CatalogPage from "@/components/CatalogPage";

export const dynamic = "force-dynamic";
export const metadata = { title: "سریال‌ها | نما" };

export default function SeriesPage({ searchParams }: { searchParams: Promise<{ genre?: string; sort?: string }> }) {
  return (
    <CatalogPage
      type="series"
      heading="سریال‌ها"
      blurb="سریال‌های اختصاصی و پرمخاطب، قسمت‌به‌قسمت و بدون تبلیغ"
      searchParams={searchParams}
    />
  );
}
