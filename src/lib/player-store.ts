"use client";

/* Global player store (v0.10.5) — the <video> element lives in the root
   layout (GlobalPlayer), OUTSIDE the routed page tree, so playback survives
   navigation. /watch/[slug] is a thin server page that pushes its data into
   this store (play()); the video then renders as the in-app THEATER overlay.

   v0.10.5: the old in-app mini card is GONE. "Float" now opens a real
   always-on-top OS window (electron/pip.cjs → /pip route). While the pip
   window owns playback, this store keeps mirroring WHAT is playing
   (pipOpen + last payload) so "expand back into the app" is seamless. */
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
  /** the desktop pip window owns playback right now */
  pipOpen: boolean;
  /** last reported playback position inside the pip window */
  pipTime: number;
  /** index of the source the pip window is playing (-1 = auto) */
  srcHint: number;
  /** bump whenever play() receives NEW content so the player re-keys the video */
  contentKey: number;
};

type PlayerActions = {
  play: (p: PlayerPayload) => void;
  close: () => void;
  setPipOpen: (v: boolean) => void;
  setPipTime: (t: number) => void;
};

function sameVideo(a: { slug: string; src: string; episode?: { id: number } | null }, b: { slug: string; src: string; episode?: { id: number } | null }) {
  return a.slug === b.slug && a.src === b.src && (a.episode?.id ?? -1) === (b.episode?.id ?? -1);
}

export const usePlayerStore = create<PlayerState & PlayerActions>((set, get) => ({
  open: false,
  pipOpen: false,
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

  play: (p) => {
    const cur = get();
    // pip window owns playback right now?
    if (cur.pipOpen) {
      if (sameVideo(cur, p)) {
        // the user asked for the video that is already floating → expand it
        // back into the in-app theater at the pip's current position
        window.nama?.pip?.close();
        set({ ...p, startAt: cur.pipTime, srcHint: cur.srcHint, open: true, pipOpen: false });
        return;
      }
      // different content → hand it to the pip window (keeps the float flow)
      void window.nama?.pip?.open({
        ...p,
        startAt: 0,
        currentTime: 0,
        srcIdx: -1,
      });
      set({ ...p, startAt: 0, open: false, srcHint: -1, contentKey: cur.contentKey + 1 });
      return;
    }
    const same = cur.open && sameVideo(cur, p);
    if (same) {
      // re-opening the exact same video (e.g. expand-from-mini → /watch remount):
      // refresh metadata but never touch the running video element
      set({ ...p, open: true });
      return;
    }
    set({ ...p, open: true, srcHint: -1, contentKey: cur.contentKey + 1 });
  },
  close: () => set({ open: false }),
  setPipOpen: (v) => set({ pipOpen: v }),
  setPipTime: (t) => set({ pipTime: t }),
}));
