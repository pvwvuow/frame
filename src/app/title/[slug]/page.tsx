import TitlePageClient from "@/components/mobile/pages/TitlePageClient";

/* Static export shell: the real page is rendered client-side from the
 * bundled catalog (see TitlePageClient). generateStaticParams just gives the
 * exporter a path to emit; cold loads of other slugs fall back to the SPA
 * root document served by the Capacitor WebView. */
export function generateStaticParams() {
  return [{ slug: "_" }];
}

export const metadata = { title: "فریم" };

export default function Page() {
  return <TitlePageClient />;
}
