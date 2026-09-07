"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import DarkroomApp from "@/components/darkroom/DarkroomApp";
import { getFullTitle, getTrending, type TitleView } from "@/lib/mobile/db";
import { getUserScore, getHistory } from "@/lib/mobile/userdata";
import type { DrTitle } from "@/lib/darkroom";

function toDrTitle(t: TitleView, myScore: number | null = null, when: string | null = null): DrTitle {
  return { ...t, myScore, when };
}

function DarkroomInner() {
  const sp = useSearchParams();
  const [candidates, setCandidates] = useState<DrTitle[] | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      // the user's world: rated ∪ watched ∪ favorites — most recent activity first
      const [hist, favs] = await Promise.all([getHistory(), (await import("@/lib/mobile/userdata")).getFavoriteRows()]);
      const acc = new Map<number, { title: TitleView; when: string | null; score: number | null }>();
      const put = (title: TitleView, when: string | null, score?: number | null) => {
        const prev = acc.get(title.id);
        const newer = !prev?.when || (when !== null && when > prev.when);
        acc.set(title.id, { title, when: newer ? when : (prev?.when ?? when), score: score ?? prev?.score ?? null });
      };
      for (const h of hist.slice(0, 60)) put(h.title, h.updatedAt);
      for (const f of favs.slice(0, 40)) put(f.title, f.addedAt);
      for (const h of hist.slice(0, 60)) {
        const s = await getUserScore(h.title.id);
        if (s) put(h.title, h.updatedAt, s);
      }

      let out: DrTitle[];
      if (acc.size > 0) {
        out = [...acc.values()]
          .sort((a, b) => (b.when ?? "").localeCompare(a.when ?? ""))
          .slice(0, 40)
          .map(({ title, when, score }) => toDrTitle(title, score, when));
      } else {
        // fresh account — suggest from trending so the room is never empty
        const rows = await getTrending(12);
        out = [];
        for (const r of rows) {
          const full = await getFullTitle(r.id);
          if (full) out.push(toDrTitle(full));
        }
      }
      if (alive) setCandidates(out);
    })();
    return () => {
      alive = false;
    };
  }, []);

  if (!candidates) {
    return (
      <main className="pb-16">
        <div className="mx-auto max-w-6xl px-4 pt-32">
          <div className="h-10 w-56 animate-pulse rounded-xl bg-white/10" />
        </div>
      </main>
    );
  }

  return <DarkroomApp candidates={candidates} initialSlug={sp.get("title") ?? undefined} />;
}

export default function DarkroomPage() {
  return (
    <Suspense fallback={null}>
      <DarkroomInner />
    </Suspense>
  );
}
