import CatalogPage from "@/components/CatalogPage";

export const metadata = { title: "سریال‌ها | نما" };

export default function SeriesPage() {
  return (
    <CatalogPage
      type="series"
      heading="سریال‌ها"
      blurb="سریال‌های اختصاصی و پرمخاطب، قسمت‌به‌قسمت با پخش پیوسته، ذخیره خودکار پیشرفت و پیشنهاد قسمت بعدی."
    />
  );
}
