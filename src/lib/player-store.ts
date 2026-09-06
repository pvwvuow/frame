"use client";

/* Global player store (v0.10.4) — the <video> element lives in the root
   layout (GlobalPlayer), OUTSIDE the routed page tree, so playback keeps
   running while the user browses anywhere in the app.
   /watch/[slug] no longer renders a player of its own; it just pushes its
   server-fetched data into this store (play()). The same video element then
   renders as the full theater overlay, or as the floating draggable
   mini-player (mini=true) with a pin toggle. */
import { create } from "zustand";

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

type PlayerState = PlayerPayload & {
  open: boolean;
  mini: boolean;
  /** pinned mini-player stays fixed on screen; unpinned collapses to a bubble */
  pinned: boolean;
  /** bump whenever play() receives NEW content so the player re-keys the video */
  contentKey: number;
};

type PlayerActions = {
  play: (p: PlayerPayload) => void;
  setMini: (mini: boolean) => void;
  togglePin: () => void;
  close: () => void;
};

export const usePlayerStore = create<PlayerState & PlayerActions>((set, get) => ({
  open: false,
  mini: false,
  pinned: true,
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

  play: (p) => {
    const cur = get();
    const sameContent = cur.open && cur.slug === p.slug && cur.episode?.id === p.episode?.id && cur.src === p.src;
    if (sameContent) {
      // re-opening the exact same video (e.g. expand-from-mini → /watch remount):
      // refresh metadata but never touch the running video element
      set({ ...p, open: true });
      return;
    }
    set({ ...p, open: true, contentKey: cur.contentKey + 1 });
  },
  setMini: (mini) => set({ mini }),
  togglePin: () => set((s) => ({ pinned: !s.pinned })),
  close: () => set({ open: false }),
}));
