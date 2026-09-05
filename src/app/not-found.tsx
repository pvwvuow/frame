import Link from "next/link";
import { HomeIcon, SearchIcon, FilmIcon } from "@/components/Icons";

export default function NotFound() {
  return (
    <main className="relative grid min-h-screen place-items-center overflow-hidden px-4 pt-20 text-center">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(229,9,20,0.15),transparent_55%)]" />
      <div className="pointer-events-none absolute inset-0 opacity-[0.06] [background-image:repeating-linear-gradient(0deg,#fff_0_2px,transparent_2px_6px)]" />
      <div className="relative animate-fade-up">
        <p className="outline-num text-[120px] font-black leading-none text-transparent sm:text-[180px]">
          ۴۰۴
        </p>
        <span className="mx-auto -mt-6 block w-fit rounded-md bg-brand px-3 py-1 text-xs font-black text-white shadow-[0_0_30px_var(--color-brand-glow)]">CUT!</span>
        <h1 className="mt-6 text-3xl font-black text-white">این صحنه در فیلم‌نامه نبود!</h1>
        <p className="mx-auto mt-3 max-w-md text-sm leading-7 text-zinc-400">
          صفحه‌ای که دنبالش هستید حذف شده، جابه‌جا شده یا هیچ‌وقت وجود نداشته است.
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Link href="/" className="flex h-11 items-center gap-2 rounded-full bg-brand px-6 text-sm font-bold text-white hover:bg-brand-600">
            <HomeIcon width={16} height={16} /> بازگشت به خانه
          </Link>
          <Link href="/search" className="flex h-11 items-center gap-2 rounded-full border border-white/15 bg-white/5 px-6 text-sm font-bold text-white hover:bg-white/10">
            <SearchIcon width={16} height={16} /> جستجو
          </Link>
          <Link href="/movies" className="flex h-11 items-center gap-2 rounded-full border border-white/15 bg-white/5 px-6 text-sm font-bold text-white hover:bg-white/10">
            <FilmIcon width={16} height={16} /> فیلم‌ها
          </Link>
        </div>
      </div>
    </main>
  );
}
