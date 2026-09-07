import PersonPageClient from "@/components/mobile/pages/PersonPageClient";

/* Static export shell — person data is resolved client-side from the
 * bundled catalog (see PersonPageClient). */
export function generateStaticParams() {
  return [{ name: "_" }];
}

export const metadata = { title: "هنرمند | فریم" };

export default function Page() {
  return <PersonPageClient />;
}
