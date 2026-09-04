"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

export default function CatalogFilters({ genres, genre, sort }: { genres: string[]; genre?: string; sort: string }) {
  const pathname = usePathname();
  const router = useRouter();
  const params = useSearchParams();

  const build = (patch: Record<string, string | undefined>) => {
    const p = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (!v) p.delete(k);
      else p.set(k, v);
    }
    const s = p.toString();
    return s ? `${pathname}?${s}` : pathname;
  };

  return (
    <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
      <div className="no-scrollbar flex gap-2 overflow-x-auto pb-1">
        <Link
          href={build({ genre: undefined })}
          className={`shrink-0 rounded-full border px-4 py-1.5 text-sm transition ${
            !genre ? "border-brand bg-brand text-white" : "border-white/10 bg-white/5 text-zinc-300 hover:bg-white/10"
          }`}
        >
          همه
        </Link>
        {genres.map((g) => (
          <Link
            key={g}
            href={build({ genre: g })}
            className={`shrink-0 rounded-full border px-4 py-1.5 text-sm transition ${
              genre === g ? "border-brand bg-brand text-white" : "border-white/10 bg-white/5 text-zinc-300 hover:bg-white/10"
            }`}
          >
            {g}
          </Link>
        ))}
      </div>
      <div className="flex items-center gap-2 text-sm">
        <span className="text-zinc-500">مرتب‌سازی:</span>
        <select
          value={sort}
          onChange={(e) => router.push(build({ sort: e.target.value }))}
          className="h-9 rounded-full border border-white/10 bg-ink-700 px-3 text-sm text-white focus:outline-none"
        >
          <option value="trending">پرطرفدار</option>
          <option value="newest">جدیدترین</option>
          <option value="rating">بالاترین امتیاز</option>
          <option value="views">پربازدیدترین</option>
        </select>
      </div>
    </div>
  );
}
