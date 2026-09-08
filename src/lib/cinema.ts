"use client";

/* v0.14.0 — CINEMA (تماشای گروهی) — serverless watch-party engine.
 *
 * ARCHITECTURE (no video relay, no new server):
 *   Every participant streams the movie DIRECTLY from Frame's own sources
 *   with their own internet — exactly like a normal playback. The cloud
 *   (Supabase, already in the app) only relays TINY control signals:
 *
 *     cinema_rooms table   → persistent room state (join by code, late
 *                            joiners, content/position snapshot)
 *     Realtime broadcast   → instant play/pause/seek beats (<1s)
 *     Realtime presence    → who is in the room right now
 *
 *   The HOST is the remote control: play, pause, seek and even switching
 *   the movie/episode. Guests' local transport is locked while the host
 *   drives. Guests auto-follow when the host changes content.
 *
 * STATE FLOW:
 *   host  → Player.tsx beats every 5s + on every play/pause/seek
 *         → cinema.hostBeat(): broadcast immediately + throttled row update
 *   guest → broadcast applies locally: |target - local| > 2.2s → seek,
 *           play/pause mismatch → follow. Target = pos + (now - received).
 *   late joiner → reads the room row once, then rides the broadcasts.
 */
import { create } from "zustand";
import { getSupabase, fetchCinemaProfiles } from "./cloud";
import { watchHref } from "./links";

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

export type CinemaRoom = {
  id: string;
  code: string;
  hostId: string;
  hostName: string;
  slug: string;
  title: string;
  poster: string;
  kind: "movie" | "series";
  season: number;
  epnum: number;
  position: number;
  duration: number;
  isPlaying: boolean;
  isClosed: boolean;
};

export type CinemaMember = { uid: string; name: string; avatar: string };

export type CinemaFeedItem = { id: number; name: string; kind: "join" | "leave" | "close"; at: number };

export type CinemaStatus = "idle" | "connecting" | "hosting" | "joined";

export type CinemaBeat = {
  slug: string;
  title: string;
  poster: string;
  kind: "movie" | "series";
  season: number;
  epnum: number;
  position: number;
  duration: number;
  isPlaying: boolean;
};

type HostMsg = CinemaBeat;

type CinemaState = {
  status: CinemaStatus;
  room: CinemaRoom | null;
  members: CinemaMember[];
  feed: CinemaFeedItem[];
  /** receive-wall-clock of the latest host beat (Date.now()) */
  hostAt: number;
  hostPlaying: boolean;
  hostPos: number;
  /** host presence vanished (bad network) — guests see a banner */
  hostAbsent: boolean;
  error: string | null;
};

type CinemaActions = {
  hostCreate: (meta: CinemaBeat, name: string) => Promise<{ ok: boolean; reason?: "auth" | "network" }>;
  guestJoin: (code: string, name: string) => Promise<{ ok: boolean; reason?: "auth" | "code" | "closed" | "network" }>;
  /** (re)connect the realtime channel for the current room — called by the
   *  player once the video is live; also resumes after an app reload. */
  connect: (name: string) => Promise<void>;
  resume: (name: string) => Promise<void>;
  hostBeat: (p: CinemaBeat) => void;
  hostClose: () => Promise<void>;
  leave: () => void;
  /** guest-side: position the guest should be at right now (or null) */
  clearError: () => void;
};

/* ------------------------------------------------------------------ */
/* Module plumbing                                                     */
/* ------------------------------------------------------------------ */

const STORE_KEY = "frame.cinema.code";
const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

function genCode(): string {
  let s = "";
  for (let i = 0; i < 6; i++) s += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
  return s;
}

export function normalizeCode(raw: string): string {
  return (raw || "").replace(/[^A-Za-z0-9]/g, "").toUpperCase();
}

function storeCode(code: string | null) {
  try {
    if (code) sessionStorage.setItem(STORE_KEY, code);
    else sessionStorage.removeItem(STORE_KEY);
  } catch {
    /* ignore */
  }
}

function readStoredCode(): string | null {
  try {
    return sessionStorage.getItem(STORE_KEY);
  } catch {
    return null;
  }
}

async function currentUid(): Promise<string | null> {
  const sb = getSupabase();
  if (!sb) return null;
  try {
    const { data } = await sb.auth.getSession();
    return data.session?.user?.id ?? null;
  } catch {
    return null;
  }
}

type Row = {
  id: string;
  code: string;
  host_id: string;
  host_name: string;
  slug: string;
  title: string;
  poster: string;
  kind: string;
  season: number;
  epnum: number;
  position: number;
  duration: number;
  is_playing: boolean;
  is_closed: boolean;
};

function rowToRoom(r: Row): CinemaRoom {
  return {
    id: r.id,
    code: r.code,
    hostId: r.host_id,
    hostName: r.host_name,
    slug: r.slug,
    title: r.title,
    poster: r.poster,
    kind: r.kind === "series" ? "series" : "movie",
    season: r.season ?? 0,
    epnum: r.epnum ?? 0,
    position: r.position ?? 0,
    duration: r.duration ?? 0,
    isPlaying: !!r.is_playing,
    isClosed: !!r.is_closed,
  };
}

let channel: ReturnType<NonNullable<ReturnType<typeof getSupabase>>["channel"]> | null = null;
let followHandler: ((slug: string, season: number, epnum: number) => void) | null = null;
let feedId = 1;
let lastPersistAt = 0;

/* v0.14.2 — member identity enrichment.
 * Presence carries only {uid, name} (tiny payloads). Avatars — and the name
 * of users who never resolve one — come from the cinema_profiles table and
 * are cached per session. OWN avatar is seeded locally so it shows before
 * (and even without) any cloud round-trip. */
const PLACEHOLDER_NAMES = new Set(["کاربر نما", "کاربر فریم"]);
const profileCache = new Map<string, { name?: string; avatar?: string }>();
let selfUid = "";
let selfName = "";
let selfAvatar = "";
let enrichBusy = false;

/** Called by useCinemaIdentity() on every session/profile change. */
export function setCinemaSelf(info: { uid?: string | null; name?: string; avatar?: string | null }) {
  if (typeof info.avatar === "string") selfAvatar = info.avatar;
  if (info.name) selfName = info.name;
  if (info.uid) selfUid = info.uid;
  if (selfUid) profileCache.set(selfUid, { name: selfName, avatar: selfAvatar });
  // Identity often arrives LATE (session hydration after a reload): the
  // resume() track may already have published a placeholder name. Re-publish
  // the moment the real one lands so the member list self-corrects.
  if (channel && selfUid && selfName && !PLACEHOLDER_NAMES.has(selfName.trim())) {
    try {
      void channel.track({ uid: selfUid, name: selfName });
    } catch {
      /* not subscribed yet → connect() tracks with the resolved name */
    }
  }
}

/** Missing identities → one batched read from cinema_profiles, then merge
 *  back into the live member list. Silent no-op when the table is not
 *  migrated yet (initial-letter circles remain). */
async function enrichMembers(uids: string[]) {
  const missing = [...new Set(uids.filter((u) => u && !profileCache.has(u)))];
  if (!missing.length || enrichBusy) return;
  enrichBusy = true;
  try {
    for (const r of await fetchCinemaProfiles(missing)) {
      profileCache.set(r.uid, { name: r.name || undefined, avatar: r.avatar });
    }
    // cache misses too, so one offline room never spams the read
    for (const u of missing) if (!profileCache.has(u)) profileCache.set(u, {});
    useCinema.setState((s) => ({
      members: s.members.map((m) => {
        const c = profileCache.get(m.uid);
        if (!c) return m;
        return {
          uid: m.uid,
          name: m.name && m.name !== "کاربر" ? m.name : c.name || m.name,
          avatar: m.uid === selfUid ? selfAvatar : c.avatar || m.avatar,
        };
      }),
    }));
  } catch {
    /* offline → initials stay */
  } finally {
    enrichBusy = false;
  }
}

/** The player registers this so a guest can FOLLOW the host when the host
 *  switches movie/episode (module scope → survives every navigation). */
export function setCinemaFollowHandler(fn: ((slug: string, season: number, epnum: number) => void) | null) {
  followHandler = fn;
}

/** Guest target position right now: host position + elapsed since the beat
 *  arrived (we never trust the two machines' wall clocks against each other
 *  — only the LOCAL time since the message landed). */
export function cinemaTargetPosition(): number | null {
  const s = useCinema.getState();
  if ((s.status !== "joined" && s.status !== "connecting") || !s.hostAt) return null;
  return s.hostPlaying ? s.hostPos + (Date.now() - s.hostAt) / 1000 : s.hostPos;
}

function pushFeed(kind: CinemaFeedItem["kind"], name: string) {
  useCinema.setState((s) => ({
    feed: [...s.feed.slice(-7), { id: feedId++, name, kind, at: Date.now() }],
  }));
}

function teardownChannel() {
  if (channel) {
    try {
      channel.unsubscribe();
    } catch {
      /* ignore */
    }
    channel = null;
  }
}

function resetState(status: CinemaStatus) {
  useCinema.setState({
    status,
    room: null,
    members: [],
    feed: [],
    hostAt: 0,
    hostPlaying: false,
    hostPos: 0,
    hostAbsent: false,
  });
}

/* ------------------------------------------------------------------ */
/* Store                                                               */
/* ------------------------------------------------------------------ */

export const useCinema = create<CinemaState & CinemaActions>((set, get) => ({
  status: "idle",
  room: null,
  members: [],
  feed: [],
  hostAt: 0,
  hostPlaying: false,
  hostPos: 0,
  hostAbsent: false,
  error: null,

  clearError: () => set({ error: null }),

  /* ---------------- host ---------------- */

  hostCreate: async (meta, name) => {
    const sb = getSupabase();
    const uid = await currentUid();
    if (!sb || !uid) return { ok: false, reason: "auth" };
    try {
      // one live room per host — sweep the previous ones (and stale junk)
      void sb.from("cinema_rooms").delete().eq("host_id", uid);
      void sb.from("cinema_rooms").delete().lt("updated_at", new Date(Date.now() - 12 * 3600_000).toISOString());
      const code = genCode();
      const ins = await sb
        .from("cinema_rooms")
        .insert({
          code,
          host_id: uid,
          host_name: name,
          slug: meta.slug,
          title: meta.title,
          poster: meta.poster,
          kind: meta.kind,
          season: meta.season,
          epnum: meta.epnum,
          position: meta.position,
          duration: meta.duration,
          is_playing: meta.isPlaying,
        })
        .select("*")
        .single();
      if (ins.error || !ins.data) return { ok: false, reason: "network" };
      teardownChannel();
      storeCode(code); // app reload mid-session → resume() re-adopts the room
      set({
        status: "hosting",
        room: rowToRoom(ins.data as Row),
        members: [],
        feed: [],
        hostAt: 0,
        hostPlaying: meta.isPlaying,
        hostPos: meta.position,
        hostAbsent: false,
        error: null,
      });
      await get().connect(name);
      return { ok: true };
    } catch {
      return { ok: false, reason: "network" };
    }
  },

  hostBeat: (p) => {
    const st = get();
    if (st.status !== "hosting" || !st.room) return;
    set({ hostPos: p.position, hostPlaying: p.isPlaying, hostAt: Date.now() });
    if (!channel) return;
    void channel.send({ type: "broadcast", event: "state", payload: p as unknown as Record<string, unknown> });
    const contentChanged =
      st.room.slug !== p.slug || st.room.season !== p.season || st.room.epnum !== p.epnum;
    if (contentChanged || Date.now() - lastPersistAt > 6000) {
      lastPersistAt = Date.now();
      const sb = getSupabase();
      if (sb) {
        void sb
          .from("cinema_rooms")
          .update({
            slug: p.slug,
            title: p.title,
            poster: p.poster,
            kind: p.kind,
            season: p.season,
            epnum: p.epnum,
            position: p.position,
            duration: p.duration,
            is_playing: p.isPlaying,
            updated_at: new Date().toISOString(),
          })
          .eq("id", st.room.id)
          .eq("host_id", st.room.hostId);
      }
      if (contentChanged) {
        set({
          room: { ...st.room, slug: p.slug, title: p.title, poster: p.poster, kind: p.kind, season: p.season, epnum: p.epnum },
        });
      }
    }
  },

  hostClose: async () => {
    const st = get();
    if (st.status !== "hosting" || !st.room) return;
    const sb = getSupabase();
    if (channel) {
      try {
        void channel.send({ type: "broadcast", event: "closed", payload: {} });
      } catch {
        /* ignore */
      }
    }
    if (sb) void sb.from("cinema_rooms").delete().eq("id", st.room.id).eq("host_id", st.room.hostId);
    teardownChannel();
    resetState("idle");
    storeCode(null);
  },

  /* ---------------- guest ---------------- */

  guestJoin: async (rawCode, name) => {
    const sb = getSupabase();
    const uid = await currentUid();
    if (!sb || !uid) return { ok: false, reason: "auth" };
    const code = normalizeCode(rawCode);
    if (code.length < 4) return { ok: false, reason: "code" };
    try {
      const q = await sb.from("cinema_rooms").select("*").eq("code", code).maybeSingle();
      const row = q.data as Row | null;
      if (q.error) return { ok: false, reason: "network" };
      if (!row) return { ok: false, reason: "code" };
      if (row.is_closed) return { ok: false, reason: "closed" };
      teardownChannel();
      const room = rowToRoom(row);
      set({
        status: "connecting",
        room,
        members: [],
        feed: [],
        hostAt: row.is_playing ? Date.now() : 0,
        hostPlaying: !!row.is_playing,
        hostPos: row.position ?? 0,
        hostAbsent: false,
        error: null,
      });
      storeCode(code);
      // the CALLER navigates to the room's content; connect() runs when the
      // video is live (Player). If we are ALREADY on it, connect right away.
      await get().connect(name);
      return { ok: true };
    } catch {
      return { ok: false, reason: "network" };
    }
  },

  connect: async (name) => {
    const st = get();
    const sb = getSupabase();
    const uid = await currentUid();
    if (!sb || !uid || !st.room) return;
    if (channel) teardownChannel();
    set({ status: st.room.hostId === uid ? "hosting" : "connecting" });

    const ch = sb.channel(`cinema:${st.room.code}`, {
      config: { presence: { key: uid }, broadcast: { self: false } },
    });

    ch.on("presence", { event: "sync" }, () => {
      const state = ch.presenceState<{ uid: string; name: string }>();
      const members: CinemaMember[] = Object.values(state)
        .flat()
        .filter((p) => p && p.uid)
        .map((p) => {
          const c = profileCache.get(p.uid);
          return {
            uid: p.uid,
            name: p.name || c?.name || "کاربر",
            avatar: p.uid === selfUid ? selfAvatar : c?.avatar || "",
          };
        });
      void enrichMembers(members.map((m) => m.uid));
      const prev = useCinema.getState().members;
      // join/leave feed (diff by uid)
      for (const m of members) if (!prev.some((x) => x.uid === m.uid) && m.uid !== uid) pushFeed("join", m.name);
      for (const m of prev) if (!members.some((x) => x.uid === m.uid) && m.uid !== uid) pushFeed("leave", m.name);
      const cur = useCinema.getState();
      const hostGone = cur.status === "joined" && cur.room ? !members.some((m) => m.uid === cur.room!.hostId) : false;
      set({ members, hostAbsent: hostGone });
    });

    ch.on("broadcast", { event: "state" }, ({ payload }) => {
      const cur = useCinema.getState();
      if (cur.status !== "joined") return;
      const p = payload as unknown as HostMsg;
      const wasContent = cur.room && (cur.room.slug !== p.slug || cur.room.season !== p.season || cur.room.epnum !== p.epnum);
      set({
        hostAt: Date.now(),
        hostPlaying: !!p.isPlaying,
        hostPos: p.position ?? 0,
        hostAbsent: false,
        room: cur.room
          ? { ...cur.room, slug: p.slug, title: p.title, poster: p.poster, kind: p.kind, season: p.season, epnum: p.epnum }
          : cur.room,
      });
      if (wasContent && followHandler) followHandler(p.slug, p.season, p.epnum);
    });

    ch.on("broadcast", { event: "closed" }, () => {
      teardownChannel();
      resetState("idle");
      storeCode(null);
      set({ error: "میزبان سینما را بست" });
    });

    channel = ch;
    ch.subscribe(async (ev) => {
      if (ev === "SUBSCRIBED") {
        try {
          const tName = name && !PLACEHOLDER_NAMES.has(name.trim()) ? name : selfName || name || "کاربر";
          void ch.track({ uid, name: tName });
        } catch {
          /* ignore */
        }
        const cur = get();
        if (cur.status === "hosting") {
          // hosting → Player's beat effect starts publishing immediately
          set({ status: "hosting" });
          return;
        }
        // guest: pull the freshest row once, then ride the broadcasts
        const q = await sb.from("cinema_rooms").select("*").eq("id", cur.room!.id).maybeSingle();
        const row = q.data as Row | null;
        if (!row || row.is_closed) {
          teardownChannel();
          resetState("idle");
          storeCode(null);
          set({ error: row ? "میزبان سینما را بست" : "این سینما دیگر فعال نیست" });
          return;
        }
        set({
          status: "joined",
          hostAt: row.is_playing ? Date.now() : 0,
          hostPlaying: !!row.is_playing,
          hostPos: row.position ?? 0,
        });
      }
    });
  },

  resume: async (name) => {
    const st = get();
    if (st.status !== "idle") return;
    const code = readStoredCode();
    if (!code) return;
    const sb = getSupabase();
    const uid = await currentUid();
    if (!sb || !uid) return;
    try {
      const q = await sb.from("cinema_rooms").select("*").eq("code", code).maybeSingle();
      const row = q.data as Row | null;
      if (!row || row.is_closed) {
        storeCode(null);
        return;
      }
      if (row.host_id === uid) {
        // host reloaded the app → re-adopt the room seamlessly
        teardownChannel();
        set({
          status: "hosting",
          room: rowToRoom(row),
          members: [],
          feed: [],
          hostAt: 0,
          hostPlaying: !!row.is_playing,
          hostPos: row.position ?? 0,
          hostAbsent: false,
          error: null,
        });
        await get().connect(name);
      } else {
        const r = await get().guestJoin(code, name);
        if (!r.ok) storeCode(null);
      }
    } catch {
      /* offline → the next open retries */
    }
  },

  leave: () => {
    const st = get();
    if (channel) {
      try {
        void channel.untrack();
      } catch {
        /* ignore */
      }
    }
    teardownChannel();
    storeCode(null);
    resetState("idle");
    void st;
  },
}));

/* ------------------------------------------------------------------ */
/* Navigation helper                                                   */
/* ------------------------------------------------------------------ */

/** URL for the room's current content (guest follow / home card). */
export function cinemaWatchHref(slug: string, season = 0, epnum = 0): string {
  const base = watchHref(slug);
  if (season > 0 && epnum > 0) {
    return `${base}${base.includes("?") ? "&" : "?"}season=${season}&epnum=${epnum}`;
  }
  return base;
}
