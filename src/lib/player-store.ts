"use client";

/* Global player store (v0.10.19) — the <video> element lives in the root
   layout (GlobalPlayer), OUTSIDE the routed page tree, so playback survives
   navigation. /watch/[slug] is a thin server page that pushes its data into
   this store (play()); the video then renders as the in-app THEATER overlay.

   "Float" opens a real always-on-top OS window (electron/pip.cjs → /pip
   route). v0.10.19 MULTI-FLOAT: the desktop can own SEVERAL floating windows
   at once — each one keeps playing whatever it was handed, and a new play()
   always opens the in-app theater instead of hijacking a floating window.
   The store mirrors every floating window (id + payload + position) so
   "expand back into the app" and "re-open the same video" stay seamless. */
import { create } from "zustand";
import { normalizeSources } from "@/lib/source-fix";

export type PlayerEpisode = { id: number; season: number; number: number; name: string; videoUrl: string; thumbnail: string };
export type PlayerSource = { q: string; v: string; url: string; mb?: number };

export type PlayerPayload = {
  titleId: number;
  slug: string;
  title: string;
  subtitle?: string;
  src: string;
  sources?: PlayerSource[];
  poster: string;
  startAt: number;
  episode: PlayerEpisode | null;
  nextEpisode: PlayerEpisode | null;
  episodes: PlayerEpisode[];
};

/** One live floating (desktop pip) window. */
export type FloatingPip = {
  id: number;
  payload: PlayerPayload;
  /** which source index that window is playing (-1 = auto) */
  srcIdx: number;
  /** last reported playback position inside that window */
  time: number;
};

type PlayerState = PlayerPayload & {
  open: boolean;
  /** true while at least one floating window is alive */
  pipOpen: boolean;
  /** every live floating window and what it is playing */
  pips: FloatingPip[];
  /** last reported playback position inside a floating window (newest one) */
  pipTime: number;
  /** index of the source the theater should start with (-1 = auto) */
  srcHint: number;
  /** bump whenever play() receives NEW content so the player re-keys the video */
  contentKey: number;
};

type PlayerActions = {
  play: (p: PlayerPayload) => void;
  close: () => void;
  setPipOpen: (v: boolean) => void;
  /** a floating window came alive (floatToPip / handed from main) */
  pipOpened: (id: number, p: PlayerPayload & { srcIdx?: number }) => void;
  /** content inside a floating window advanced (next episode) */
  pipSynced: (id: number, p: PlayerPayload & { srcIdx?: number }) => void;
  /** a floating window was closed */
  pipClosed: (id: number) => void;
  setPipTime: (id: number, t: number) => void;
};

function sameVideo(a: { slug: string; src: string; episode?: { id: number } | null }, b: { slug: string; src: string; episode?: { id: number } | null }) {
  return a.slug === b.slug && a.src === b.src && (a.episode?.id ?? -1) === (b.episode?.id ?? -1);
}

/* ---- history-traversal guard (v0.10.19) ----------------------------------
 * The mouse back button must NEVER auto-play a movie: a /watch/[slug] entry
 * sitting in the history stack is the LEFTOVER of a past playback, not a
 * request to play again. popstate fires on every back/forward traversal
 * (mouse buttons included) before the router re-renders, so we stamp the
 * moment here — WatchClient then refuses to start playback right after a
 * traversal and redirects to the title page instead. */
let lastTraversalAt = 0;
export function wasRecentTraversal(): boolean {
  return Date.now() - lastTraversalAt < 1500;
}
if (typeof window !== "undefined" && !(window as { __namaPopGuard?: boolean }).__namaPopGuard) {
  (window as { __namaPopGuard?: boolean }).__namaPopGuard = true;
  window.addEventListener("popstate", () => {
    lastTraversalAt = Date.now();
  });
}

export const usePlayerStore = create<PlayerState & PlayerActions>((set, get) => ({
  open: false,
  pipOpen: false,
  pips: [],
  pipTime: 0,
  srcHint: -1,
  contentKey: 0,
  titleId: 0,
  slug: "",
  title: "",
  subtitle: undefined,
  src: "",
  sources: [],
  poster: "",
  startAt: 0,
  episode: null,
  nextEpisode: null,
  episodes: [],

  play: (incoming) => {
    const cur = get();
    // v0.10.17: the source labels are normalized HERE — the single choke
    // point every playback path goes through (theater, float handoff,
    // expand-back). The quality menu then always tells the truth about the
    // file it plays, whatever the catalog shipped.
    const p = { ...incoming, sources: normalizeSources(incoming.sources) };

    // some floating window already plays THIS video → expand it back into
    // the in-app theater at the floating window's exact position (and never
    // start a second copy of the same file)
    const fp = cur.pips.find((f) => sameVideo(f.payload, p));
    if (fp) {
      window.nama?.pip?.close(fp.id);
      const rest = cur.pips.filter((f) => f.id !== fp.id);
      set({
        ...p,
        startAt: fp.time > 0.5 ? fp.time : p.startAt,
        srcHint: fp.srcIdx,
        open: true,
        pips: rest,
        pipOpen: rest.length > 0,
        pipTime: rest.length ? rest[rest.length - 1].time : 0,
        contentKey: cur.open && !sameVideo(cur, p) ? cur.contentKey + 1 : cur.contentKey,
      });
      return;
    }

    const same = cur.open && sameVideo(cur, p);
    if (same) {
      // re-opening the exact same video (e.g. expand-from-float → /watch remount):
      // refresh metadata but never touch the running video element
      set({ ...p, open: true });
      return;
    }
    // v0.10.19: floating windows KEEP playing whatever they own — new
    // content always opens the in-app theater. (The old code handed the new
    // movie to the single floating window and closed the theater, which left
    // the /watch page as a bare black screen while the old window's movie
    // was silently replaced.) This is what makes simultaneous playback work.
    set({
      ...p,
      open: true,
      srcHint: -1,
      contentKey: cur.contentKey + 1,
      pips: cur.pips,
      pipOpen: cur.pips.length > 0,
    });
  },

  close: () => set({ open: false }),

  setPipOpen: (v) => set({ pipOpen: v }),

  pipOpened: (id, p) => {
    const cur = get();
    const fp: FloatingPip = { id, payload: p, srcIdx: p.srcIdx ?? -1, time: p.startAt ?? 0 };
    const pips = [...cur.pips.filter((f) => f.id !== id), fp];
    set({ ...p, open: false, srcHint: fp.srcIdx, pips, pipOpen: true, pipTime: fp.time, contentKey: cur.contentKey + 1 });
  },

  pipSynced: (id, p) => {
    const cur = get();
    const pips = cur.pips.map((f) => (f.id === id ? { ...f, payload: p, srcIdx: p.srcIdx ?? f.srcIdx, time: 0 } : f));
    set({ pips });
  },

  pipClosed: (id) => {
    const cur = get();
    const pips = cur.pips.filter((f) => f.id !== id);
    set({ pips, pipOpen: pips.length > 0, pipTime: pips.length ? pips[pips.length - 1].time : 0 });
  },

  setPipTime: (id, t) => {
    const cur = get();
    if (!Number.isFinite(t)) return;
    const pips = cur.pips.map((f) => (f.id === id ? { ...f, time: t } : f));
    set({ pips, pipTime: t });
  },
}));
