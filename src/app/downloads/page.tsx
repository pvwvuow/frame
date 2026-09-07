import type { Metadata } from "next";
import DownloadsClient from "@/components/download/DownloadsClient";
import { getT } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getT();
  return { title: `${t("dl.page")} | ${t("app.name")}` };
}

export default function DownloadsPage() {
  return <DownloadsClient />;
}
