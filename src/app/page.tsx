"use client";

import { AuroraBackground } from "@/components/nova/aurora";
import { Sidebar } from "@/components/nova/sidebar";
import { Hero } from "@/components/nova/hero";
import { MediaRow, RankedRow } from "@/components/nova/rows";
import { MediaGrid } from "@/components/nova/grid";
import { DetailModal } from "@/components/nova/detail-modal";
import { PlayerOverlay } from "@/components/nova/player";
import { DownloadsBar, DownloadsView } from "@/components/nova/downloads";
import { SettingsView } from "@/components/nova/settings";
import { TitleBar } from "@/components/nova/titlebar";
import { ToastStack } from "@/components/nova/toasts";
import {
  ALL_ITEMS,
  CONTINUE_WATCHING,
  INITIAL_DOWNLOADS,
  MOVIES,
  SERIES,
  getById,
  type DownloadTask,
  type MediaItem,
} from "@/lib/nova-data";
import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Search, Sparkles, Clapperboard, Tv, Bookmark, Download, Home as HomeIcon, Settings2 } from "lucide-react";
import { GenreChips } from "@/components/nova/grid";

export type ViewId =
  | "home"
  | "movies"
  | "series"
  | "search"
  | "mylist"
  | "downloads"
  | "settings";

export interface NovaState {
  view: ViewId;
  setView: (v: ViewId) => void;
  openItem: (item: MediaItem) => void;
  addItem: (item: MediaItem) => void;
  playItem: (item: MediaItem) => void;
  myList: string[];
  toggleList: (id: string) => void;
  addDownload: (item: MediaItem, quality: string, label?: string) => void;
  toast: (msg: string) => void;
}

const NAV_ITEMS: { id: ViewId; label: string; icon: typeof HomeIcon }[] = [
  { id: "home", label: "خانه", icon: HomeIcon },
  { id: "movies", label: "فیلم‌ها", icon: Clapperboard },
  { id: "series", label: "سریال‌ها", icon: Tv },
  { id: "search", label: "جستجو", icon: Search },
  { id: "mylist", label: "لیست من", icon: Bookmark },
  { id: "downloads", label: "دانلودها", icon: Download },
  { id: "settings", label: "تنظیمات", icon: Settings2 },
];

const VIEW_META: Record<ViewId, { title: string; icon: typeof HomeIcon }> = {
  home: { title: "خانه", icon: HomeIcon },
  movies: { title: "فیلم‌ها", icon: Clapperboard },
  series: { title: "سریال‌ها", icon: Tv },
  search: { title: "جستجو", icon: Search },
  mylist: { title: "لیست من", icon: Bookmark },
  downloads: { title: "دانلودها", icon: Download },
  settings: { title: "تنظیمات", icon: Settings2 },
};

export default function NovaApp() {
  const [view, setViewRaw] = useState<ViewId>("home");
  const [selected, setSelected] = useState<MediaItem | null>(null);
  const [playing, setPlaying] = useState<MediaItem | null>(null);
  const [myList, setMyList] = useState<string[]>(["beyond", "tehran-nights", "last-guardian"]);
  const [downloads, setDownloads] = useState<DownloadTask[]>(INITIAL_DOWNLOADS);
  const [toasts, setToasts] = useState<{ id: number; msg: string }[]>([]);
  const toastId = useRef(0);
  const [query, setQuery] = useState("");

  const toast = (msg: string) => {
    const id = ++toastId.current;
    setToasts((t) => [...t.slice(-2), { id, msg }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3200);
  };

  const setView = (v: ViewId) => {
    setViewRaw(v);
  };

  const toggleList = (id: string) => {
    setMyList((list) => {
      const exists = list.includes(id);
      toast(exists ? "از لیست شما حذف شد" : "به لیست شما اضافه شد");
      return exists ? list.filter((x) => x !== id) : [...list, id];
    });
  };

  const addDownload = (item: MediaItem, quality: string, label?: string) => {
    const id = `d${Date.now()}`;
    setDownloads((d) => [
      { id, itemId: item.id, quality: quality as DownloadTask["quality"], label: label ?? item.title, percent: 0, speed: 10.2, status: "active" },
      ...d,
    ]);
    toast(`دانلود شروع شد: ${label ?? item.title} (${quality})`);
    setView("downloads");
  };

  // simulate download progress
  useEffect(() => {
    const t = setInterval(() => {
      setDownloads((ds) =>
        ds.map((d) => {
          if (d.status !== "active" || d.percent >= 100) return d;
          const next = Math.min(100, d.percent + Math.random() * 1.6);
          return { ...d, percent: next, speed: next >= 100 ? 0 : 6 + Math.random() * 9, status: next >= 100 ? "done" : d.status };
        })
      );
    }, 900);
    return () => clearInterval(t);
  }, []);

  const nova: NovaState = {
    view,
    setView,
    openItem: (i) => setSelected(i),
    addItem: (i) => toggleList(i.id),
    playItem: (i) => setPlaying(i),
    myList,
    toggleList,
    addDownload,
    toast,
  };

  const searchResults = useMemo(() => {
    if (!query.trim()) return ALL_ITEMS;
    const q = query.trim().toLowerCase();
    return ALL_ITEMS.filter(
      (i) =>
        i.title.includes(q) ||
        i.titleEn.toLowerCase().includes(q) ||
        i.genres.some((g) => g.includes(q))
    );
  }, [query]);

  const myListItems = myList.map(getById).filter(Boolean) as MediaItem[];

  const activeDownloads = downloads.filter((d) => d.status === "active").length;
  const viewMeta = VIEW_META;

  const onSelectMobile = (v: ViewId) => {
    if (v === "search") setQuery("");
    if (v === "downloads") onOpenDownloads();
    setViewRaw(v);
  };

  const onOpenDownloads = () => setView("downloads");

  return (
    <div className="relative h-screen w-screen overflow-hidden text-foreground" role="application" aria-label="نواپلی">
      <AuroraBackground />

      {/* ============ Window frame ============ */}
      <div className="relative z-10 flex h-full flex-col">
        <TitleBar activeDownloads={activeDownloads} onOpenDownloads={onOpenDownloads} />

        <div className="flex min-h-0 flex-1 flex-row-reverse">
          {/* sidebar — visually on the right in RTL (desktop only) */}
          <div className="hidden md:flex">
            <Sidebar
              items={NAV_ITEMS}
              active={view}
              onSelect={(v) => {
                if (v === "search") setQuery("");
                setView(v);
              }}
              myListCount={myList.length}
              activeDownloads={activeDownloads}
              onOpenDownloads={onOpenDownloads}
            />
          </div>

          {/* ============ Main content ============ */}
          <main className="scroll-glass relative min-w-0 flex-1 overflow-y-auto overflow-x-hidden">
            <AnimatePresence mode="wait">
              <motion.div
                key={view}
                initial={{ opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
                className="min-h-full"
              >
                {view === "home" && (
                  <HomeView nova={nova} downloads={downloads} />
                )}

                {view === "movies" && (
                  <MoviesView nova={nova} />
                )}

                {view === "series" && (
                  <SeriesView nova={nova} />
                )}

                {view === "search" && (
                  <SectionView meta={viewMeta.search}>
                    <SearchView
                      query={query}
                      setQuery={setQuery}
                      results={searchResults}
                      nova={nova}
                    />
                  </SectionView>
                )}

                {view === "mylist" && (
                  <SectionView meta={viewMeta.mylist}>
                    {myListItems.length === 0 ? (
                      <EmptyState
                        icon={Bookmark}
                        title="لیست شما خالی است"
                        desc="با زدن آیکون نشانک روی هر فیلم یا سریال، آن را برای بعد ذخیره کنید."
                      />
                    ) : (
                      <MediaGrid items={myListItems} nova={nova} />
                    )}
                  </SectionView>
                )}

                {view === "downloads" && (
                  <SectionView meta={viewMeta.downloads}>
                    <DownloadsView downloads={downloads} nova={nova} setDownloads={setDownloads} />
                  </SectionView>
                )}

                {view === "settings" && (
                  <SectionView meta={viewMeta.settings}>
                    <SettingsView nova={nova} />
                  </SectionView>
                )}
              </motion.div>
            </AnimatePresence>
          </main>
        </div>

        {/* floating downloads mini-bar */}
        {activeDownloads > 0 && view !== "downloads" && (
          <DownloadsBar downloads={downloads} onOpen={() => setView("downloads")} />
        )}

        {/* mobile bottom nav */}
        <nav
          className="lg fixed inset-x-3 bottom-3 z-40 flex items-center justify-around rounded-3xl px-2 py-2 md:hidden"
          aria-label="منوی موبایل"
        >
          {NAV_ITEMS.slice(0, 5).map((item) => {
            const Icon = item.icon;
            const isActive = view === item.id;
            return (
              <button
                key={item.id}
                onClick={() => onSelectMobile(item.id)}
                className={`flex flex-col items-center gap-1 rounded-xl px-3 py-1.5 text-[10px] font-medium transition-colors ${
                  isActive ? "text-amber-300" : "text-muted-foreground"
                }`}
                aria-current={isActive ? "page" : undefined}
              >
                <Icon size={19} strokeWidth={1.9} />
                {item.label}
              </button>
            );
          })}
        </nav>
      </div>

      {/* overlays */}
      <DetailModal
        key={selected?.id ?? "modal"}
        item={selected}
        onClose={() => setSelected(null)}
        nova={nova}
        inList={selected ? myList.includes(selected.id) : false}
      />
      <PlayerOverlay key={playing?.id ?? "player"} item={playing} onClose={() => setPlaying(null)} />
      <ToastStack toasts={toasts} />
    </div>
  );
}

/* ================= Movies / Series views with genre filter ================= */
function MoviesView({ nova }: { nova: NovaState }) {
  const [genre, setGenre] = useState("همه");
  const filtered = genre === "همه" ? MOVIES : MOVIES.filter((m) => m.genres.includes(genre));
  return (
    <SectionView meta={VIEW_META.movies}>
      <GenreChips active={genre} onPick={setGenre} />
      <MediaGrid items={filtered} nova={nova} />
    </SectionView>
  );
}

function SeriesView({ nova }: { nova: NovaState }) {
  const [genre, setGenre] = useState("همه");
  const filtered = genre === "همه" ? SERIES : SERIES.filter((s) => s.genres.includes(genre));
  return (
    <SectionView meta={VIEW_META.series}>
      <GenreChips active={genre} onPick={setGenre} />
      <MediaGrid items={filtered} nova={nova} />
    </SectionView>
  );
}

/* ================= Home view ================= */
function HomeView({ nova, downloads }: { nova: NovaState; downloads: DownloadTask[] }) {
  const featured = ALL_ITEMS.filter((i) => i.featured);
  const top = ["galaxy-empire", "tehran-nights", "last-guardian", "double-agent", "big-heist"]
    .map(getById)
    .filter(Boolean) as MediaItem[];
  const fresh = ["beyond", "echo", "old-scar", "frozen-heart", "purgatory", "dark-alley", "final-race", "silent-forest"]
    .map(getById)
    .filter(Boolean) as MediaItem[];

  return (
    <div className="pb-10">
      <Hero items={featured} nova={nova} />

      <div className="space-y-9 px-7 pt-9">
        <MediaRow title="ادامه تماشا" icon={Sparkles} items={CONTINUE_WATCHING.map((c) => getById(c.id)!)} nova={nova} progress={CONTINUE_WATCHING} />
        <RankedRow title="برترین‌های این هفته" items={top} nova={nova} />
        <MediaRow title="فیلم‌های محبوب" icon={Clapperboard} items={MOVIES.slice(0, 10)} nova={nova} />
        <MediaRow title="سریال‌های ویژه" icon={Tv} items={SERIES} nova={nova} />
        <MediaRow title="تازه‌ها در نواپلی" icon={Sparkles} items={fresh} nova={nova} />

        <footer className="lg lg-pill mt-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl px-6 py-4 text-xs text-muted-foreground">
          <div className="flex items-center gap-2">
            <span className="font-bold text-foreground/80">نواپلی NovaPlay</span>
            <span className="rounded-full bg-white/10 px-2 py-0.5 tabular">v0.1.0-preview</span>
            <span className="hidden md:inline">• ساخته‌شده بر پایه Electron</span>
          </div>
          <div className="flex items-center gap-4">
            <button className="hover:text-foreground transition-colors">درباره ما</button>
            <button className="hover:text-foreground transition-colors">پشتیبانی</button>
            <button className="hover:text-foreground transition-colors">حریم خصوصی</button>
          </div>
        </footer>
      </div>
    </div>
  );
}

/* ================= Section shell ================= */
function SectionView({
  meta,
  children,
}: {
  meta: { title: string; icon: typeof HomeIcon };
  children: React.ReactNode;
}) {
  const Icon = meta.icon;
  return (
    <div className="px-7 pb-10 pt-8">
      <div className="mb-7 flex items-center gap-3">
        <div className="lg lg-pill grid h-12 w-12 place-items-center rounded-2xl text-amber-400">
          <Icon size={22} strokeWidth={1.8} />
        </div>
        <h1 className="text-2xl font-black tracking-tight">{meta.title}</h1>
      </div>
      {children}
    </div>
  );
}

/* ================= Search ================= */
function SearchView({
  query,
  setQuery,
  results,
  nova,
}: {
  query: string;
  setQuery: (q: string) => void;
  results: MediaItem[];
  nova: NovaState;
}) {
  return (
    <div>
      <div className="lg lg-pill mb-8 flex items-center gap-3 rounded-2xl px-5 py-4">
        <Search size={20} className="shrink-0 text-amber-400" />
        <input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="نام فیلم، سریال یا ژانر را جستجو کنید…"
          className="w-full bg-transparent text-base outline-none placeholder:text-muted-foreground"
          aria-label="جستجو"
        />
        {query && (
          <button
            onClick={() => setQuery("")}
            className="rounded-full bg-white/10 px-3 py-1 text-xs text-muted-foreground hover:bg-white/20 hover:text-foreground transition-colors"
          >
            پاک کردن
          </button>
        )}
      </div>

      {results.length === 0 ? (
        <EmptyState
          icon={Search}
          title="نتیجه‌ای پیدا نشد"
          desc="عبارت دیگری را امتحان کنید؛ مثلاً «اکشن» یا «شهر خاکستر»."
        />
      ) : (
        <>
          <p className="mb-5 text-sm text-muted-foreground">
            {results.length === ALL_ITEMS.length
              ? "همه عناوین"
              : `${results.length} نتیجه برای «${query}»`}
          </p>
          <MediaGrid items={results} nova={nova} />
        </>
      )}
    </div>
  );
}

/* ================= Empty state ================= */
export function EmptyState({
  icon: Icon,
  title,
  desc,
}: {
  icon: typeof HomeIcon;
  title: string;
  desc: string;
}) {
  return (
    <div className="lg lg-pill mx-auto mt-16 flex max-w-md flex-col items-center gap-4 rounded-3xl px-10 py-14 text-center">
      <div className="grid h-16 w-16 place-items-center rounded-2xl bg-amber-400/15 text-amber-400">
        <Icon size={30} strokeWidth={1.6} />
      </div>
      <h3 className="text-lg font-bold">{title}</h3>
      <p className="text-sm leading-7 text-muted-foreground">{desc}</p>
    </div>
  );
}
