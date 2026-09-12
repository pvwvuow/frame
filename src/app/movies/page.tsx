import CatalogPage from "@/components/CatalogPage";
import { getT } from "@/lib/i18n/server";

/* v0.30.10 — the tab title follows the UI language (the page body was always
 * locale-aware through CatalogPage; the static Persian metadata leaked). */
export async function generateMetadata() {
  const { t } = await getT();
  return { title: `${t("common.movies")} | ${t("app.name")}` };
}

export default function MoviesPage() {
  return <CatalogPage type="movie" />;
}
