import WatchPageClient from "@/components/mobile/pages/WatchPageClient";

/* Static export shell — playback state is assembled client-side
 * (see WatchPageClient). Cold loads fall back to the SPA root document. */
export function generateStaticParams() {
  return [{ slug: "_" }];
}

export const metadata = { title: "پخش | فریم" };

export default function Page() {
  return <WatchPageClient />;
}
