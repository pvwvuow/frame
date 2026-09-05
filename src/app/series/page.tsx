import CatalogPage, { type CatalogSearchParams } from "@/components/CatalogPage";

export const dynamic = "force-dynamic";
export const metadata = { title: "سریال‌ها | نما" };

export default function SeriesPage({ searchParams }: { searchParams: Promise<CatalogSearchParams> }) {
  return (
    <CatalogPage
      type="series"
      heading="سریال‌ها"
      blurb="سریال‌های اختصاصی و پرمخاطب، قسمت‌به‌قسمت با پخش پیوسته، ذخیره خودکار پیشرفت و پیشنهاد قسمت بعدی."
      searchParams={searchParams}
    />
  );
}
