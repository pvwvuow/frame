import CatalogPage from "@/components/CatalogPage";
import { getT } from "@/lib/i18n/server";

/* v0.30.10 — the tab title follows the UI language (see movies/page.tsx). */
export async function generateMetadata() {
  const { t } = await getT();
  return { title: `${t("common.seriesPlural")} | ${t("app.name")}` };
}

export default function SeriesPage() {
  return <CatalogPage type="series" />;
}
