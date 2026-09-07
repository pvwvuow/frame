import CollectionPageClient from "@/components/mobile/pages/CollectionPageClient";

/* Static export shell — collection data is resolved client-side
 * (see CollectionPageClient). */
export function generateStaticParams() {
  return [{ slug: "_" }];
}

export const metadata = { title: "مجموعه | فریم" };

export default function Page() {
  return <CollectionPageClient />;
}
