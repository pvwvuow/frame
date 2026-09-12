/* Mobile user-data layer — mirrors src/lib/library.ts + src/lib/notifications.ts
 * on top of Dexie. Every response shape matches the desktop API routes so the
 * existing client components (LibraryProvider, SettingsForm, HistoryList…)
 * keep working through the fetch shim unchanged. */

import { db, episodeId, getEpisodes, getFullTitle, getTitleLiteBySlug, isDesktopRuntime, type LiteTitle } from "./db";
import { LIST_STATUSES, type ListStatus } from "@/lib/library-shared";
import type { TitleView } from "./db";
import { titleHref, watchHref } from "@/lib/links";
import { recordTombstone, tombstoneNewerThan } from "@/lib/sync-queue";

export { LIST_STATUSES };
export type { ListStatus };

const json = (v: unknown, fb: string) => {
  try { const p = JSON.parse(v as string); return Array.isArray(p) ? p : fb ? JSON.parse(fb) : []; } catch { return []; }
};

/* Desktop runtime: the shared pages call these functions directly, but on
 * Electron the data lives in the local Prisma DB (NOT in Dexie — the desktop
 * installer ships no shard catalog). Each function therefore has a thin
 * branch that talks to the real API / the /api/x bridge, keeping desktop and
 * Android on one code path with platform-correct storage underneath. */
const srv = async <T>(url: string, init?: RequestInit): Promise<T> => {
  const r = await fetch(url, { cache: "no-store", ...init });
  if (!r.ok) throw new Error(`API ${url} → ${r.status}`);
  return (await r.json()) as T;
};
const srvPost = <T,>(url: string, body: unknown, method = "POST"): Promise<T> =>
  srv<T>(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

/** userKey from the same cookie the desktop server reads (nama_uid).
 *  v0.10.35: per-account data spaces — when an identity attach happened, the
 *  ACTIVE space (per cloud account) wins over the raw device cookie, mirroring
 *  the desktop /api/identity route so switching accounts gives each account
 *  its own profile / history / collections on Android too. */
export function getUserKey(): string {
  const active = lsGet(ACCT_ACTIVE);
  if (active) return active;
  if (typeof document === "undefined") return "guest";
  const m = document.cookie.match(/(?:^|;\s*)nama_uid=([^;]*)/);
  return m ? decodeURIComponent(m[1]) : "guest";
}

/* ---- v0.10.35 — per-account data spaces (mobile side of /api/identity) ---- */

const ACCT_ACTIVE = "frame.acct.active";
const ACCT_MAP = "frame.acct.map";

function lsGet(k: string): string | null {
  try { return localStorage.getItem(k); } catch { return null; }
}
function lsSet(k: string, v: string): void {
  try { localStorage.setItem(k, v); } catch { /* ignore */ }
}
function readAcctMap(): Record<string, string> {
  try { return JSON.parse(lsGet(ACCT_MAP) ?? "{}") as Record<string, string>; } catch { return {}; }
}

/* v0.27.0 (DATA-14) — the space id is a sha-256 of the account id, EXACTLY
 * like the desktop route ("a" + first 24 hex chars of sha256("frame:"+id)).
 * The old djb2 hash fit in 32 bits — two accounts could collide and read
 * each other's library/history. A compact pure-JS sha-256 keeps this working
 * even where crypto.subtle is unavailable. */
function sha256Hex(input: string): string {
  const rr = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
  ];
  const l = input.length;
  const withOne = ((l + 9) >> 6) + 1;
  const words = new Uint32Array(withOne * 16);
  for (let i = 0; i < l; i++) words[i >> 2] |= input.charCodeAt(i) << ((3 - (i % 4)) * 8);
  words[l >> 2] |= 0x80 << ((3 - (l % 4)) * 8);
  words[withOne * 16 - 1] = l * 8;
  let h0 = 0x6a09e667, h1 = 0xbb67ae85, h2 = 0x3c6ef372, h3 = 0xa54ff53a, h4 = 0x510e527f, h5 = 0x9b05688c, h6 = 0x1f83d9ab, h7 = 0x5be0cd19;
  const w = new Uint32Array(64);
  for (let j = 0; j < withOne * 16; j += 16) {
    for (let i = 0; i < 16; i++) w[i] = words[j + i];
    for (let i = 16; i < 64; i++) {
      const s0 = ((w[i - 15] >>> 7) | (w[i - 15] << 25)) ^ ((w[i - 15] >>> 18) | (w[i - 15] << 14)) ^ (w[i - 15] >>> 3);
      const s1 = ((w[i - 2] >>> 17) | (w[i - 2] << 15)) ^ ((w[i - 2] >>> 19) | (w[i - 2] << 13)) ^ (w[i - 2] >>> 10);
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0;
    }
    let a = h0, b = h1, c = h2, d = h3, e = h4, f = h5, g = h6, h = h7;
    for (let i = 0; i < 64; i++) {
      const S1 = ((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7));
      const ch = (e & f) ^ (~e & g);
      const t1 = (h + S1 + ch + rr[i] + w[i]) >>> 0;
      const S0 = ((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10));
      const mj = (a & b) ^ (a & c) ^ (b & c);
      const t2 = (S0 + mj) >>> 0;
      h = g; g = f; f = e; e = (d + t1) >>> 0; d = c; c = b; b = a; a = (t1 + t2) >>> 0;
    }
    h0 = (h0 + a) >>> 0; h1 = (h1 + b) >>> 0; h2 = (h2 + c) >>> 0; h3 = (h3 + d) >>> 0;
    h4 = (h4 + e) >>> 0; h5 = (h5 + f) >>> 0; h6 = (h6 + g) >>> 0; h7 = (h7 + h) >>> 0;
  }
  return [h0, h1, h2, h3, h4, h5, h6, h7].map((x) => x.toString(16).padStart(8, "0")).join("");
}

/** deterministic empty space for a brand-new account on this device */
function accountSpaceUid(accountId: string): string {
  return "a" + sha256Hex(`frame:${accountId}`).slice(0, 24);
}

/** the NEW scheme — used to detect legacy djb2 spaces that must migrate */
const NEW_SPACE_RE = /^a[0-9a-f]{24}$/;

async function spaceHasData(uid: string): Promise<boolean> {
  const [p, prog, wl, fav, rt, cols] = await Promise.all([
    db.profiles.get(uid),
    db.progress.where("userKey").equals(uid).first(),
    db.watchlist.where("userKey").equals(uid).first(),
    db.favorites.where("userKey").equals(uid).first(),
    db.ratings.where("userKey").equals(uid).first(),
    db.ucollections.where("userKey").equals(uid).first(),
  ]);
  return Boolean(p || prog || wl || fav || rt || cols);
}

/** v0.27.0 (DATA-14 migration) — copy one account's rows from the legacy
 * djb2 space into the new sha-256 space. Only runs when the target is empty. */
async function migrateAccountSpace(oldUid: string, newUid: string): Promise<void> {
  if (oldUid === newUid || (await spaceHasData(newUid))) return;
  const [profs, progs, wls, favs, rats, cols, notifs] = await Promise.all([
    db.profiles.get(oldUid),
    db.progress.where("userKey").equals(oldUid).toArray(),
    db.watchlist.where("userKey").equals(oldUid).toArray(),
    db.favorites.where("userKey").equals(oldUid).toArray(),
    db.ratings.where("userKey").equals(oldUid).toArray(),
    db.ucollections.where("userKey").equals(oldUid).toArray(),
    db.notificationsRead.where("userKey").equals(oldUid).toArray(),
  ]);
  await db.transaction("rw", [db.profiles, db.progress, db.watchlist, db.favorites, db.ratings, db.ucollections, db.ucitems, db.notificationsRead] as never, async () => {
    if (profs) await db.profiles.put({ ...profs, userKey: newUid });
    for (const r of progs) await db.progress.put({ ...(r as Record<string, unknown>), id: undefined, userKey: newUid });
    for (const r of wls) await db.watchlist.put({ ...(r as Record<string, unknown>), id: undefined, userKey: newUid });
    for (const r of favs) await db.favorites.put({ ...(r as Record<string, unknown>), id: undefined, userKey: newUid });
    for (const r of rats) await db.ratings.put({ ...(r as Record<string, unknown>), id: undefined, userKey: newUid });
    for (const c of cols) {
      const oldColId = Number((c as { id: number }).id);
      const newColId = Number(await db.ucollections.put({ ...(c as Record<string, unknown>), id: undefined, userKey: newUid }));
      const items = await db.ucitems.where("collectionId").equals(oldColId).toArray();
      for (const it of items) await db.ucitems.put({ ...(it as Record<string, unknown>), id: undefined, collectionId: newColId });
    }
    for (const n of notifs) await db.notificationsRead.put({ ...n, userKey: newUid });
  });
}

/** v0.29.0 (VERIFY-QOL-3) — does signing out RIGHT NOW risk destroying guest
 * data? The reset path wipes the current space when NO account claims it —
 * usually an empty fresh-guest (harmless), but after an OFFLINE sign-in the
 * adopted-but-unattached space can still be the unclaimed guest space holding
 * the user's library/history. The sign-out UI calls this to ask for
 * confirmation instead of silently destroying everything. */
export async function guestDataAtRisk(): Promise<boolean> {
  try {
    if (isDesktopRuntime()) return false; // desktop sign-out never wipes
    const current = getUserKey();
    const map = readAcctMap();
    if (Object.values(map).includes(current)) return false; // claimed by an account → protected
    return await spaceHasData(current);
  } catch {
    return false;
  }
}

/** v0.27.0 (QOL-3) — orphan guest spaces used to pile up forever after every
 * sign-out. Now the PREVIOUS guest space (unclaimed by any account) is wiped
 * before a fresh one is minted — same isolation, no litter. */
async function wipeGuestSpace(uid: string): Promise<void> {
  const map = readAcctMap();
  if (Object.values(map).includes(uid)) return; // claimed by an account
  const cols = await db.ucollections.where("userKey").equals(uid).toArray();
  for (const c of cols) await db.ucitems.where("collectionId").equals(Number((c as { id: number }).id)).delete();
  await Promise.all([
    db.progress.where("userKey").equals(uid).delete(),
    db.watchlist.where("userKey").equals(uid).delete(),
    db.favorites.where("userKey").equals(uid).delete(),
    db.ratings.where("userKey").equals(uid).delete(),
    db.ucollections.where("userKey").equals(uid).delete(),
    db.notificationsRead.where("userKey").equals(uid).delete(),
    db.profiles.delete(uid),
  ]);
}

/** Same contract as the desktop POST /api/identity route:
 *  - attach(accountId): known account → its recorded space (data returns on
 *    re-login); first attach + current space unclaimed + has data → ADOPT the
 *    current space (seamless upgrade / guest continuity); otherwise a fresh
 *    empty space so a second account never sees the first account's data.
 *    v0.27.0 — legacy djb2 spaces migrate to the sha-256 scheme (DATA-14).
 *  - reset (sign-out): the previous guest space is wiped (QOL-3), then a
 *    fresh guest space — signed-out data survives restarts of the CURRENT
 *    guest, never leaks into the next one. */
export async function switchIdentity(accountId: string | null, reset = false): Promise<{ switched: boolean }> {
  // v0.29.0 (VERIFY-DATA-14) — restore the persisted account→space map FIRST
  // (a wiped localStorage must not turn every known account into a stranger)
  await restoreAcctMapFromDexie();
  const current = getUserKey();
  const map = readAcctMap();
  const claimed = Object.values(map).includes(current);

  if (reset || !accountId) {
    if (!claimed) return { switched: false };
    await wipeGuestSpace(current);
    const fresh = "guest-" + Math.random().toString(36).slice(2, 10);
    lsSet(ACCT_ACTIVE, fresh);
    return { switched: true };
  }

  let known = map[accountId];
  if (known && !NEW_SPACE_RE.test(known)) {
    // legacy djb2 space → migrate the data into the deterministic sha-256 space
    const target = accountSpaceUid(accountId);
    await migrateAccountSpace(known, target);
    map[accountId] = target;
    known = target;
    lsSet(ACCT_MAP, JSON.stringify(map));
    void mirrorAcctMapToDexie();
  }
  if (known) {
    if (known === current) return { switched: false };
    lsSet(ACCT_ACTIVE, known);
    return { switched: true };
  }

  const hasData = await spaceHasData(current);
  const target = !claimed && hasData ? current : accountSpaceUid(accountId);
  map[accountId] = target;
  lsSet(ACCT_MAP, JSON.stringify(map));
  lsSet(ACCT_ACTIVE, target);
  // v0.29.0 (VERIFY-DATA-14) — remember WHICH account is active so the map
  // restore can re-point the active space after a localStorage wipe
  lsSet("frame.acct.activeId", accountId);
  void mirrorAcctMapToDexie();
  return { switched: target !== current };
}

/** v0.27.0 (DATA-14) — the account map survives a wiped localStorage via a
 * Dexie mirror (localStorage alone lost every space mapping before). */
async function mirrorAcctMapToDexie(): Promise<void> {
  try {
    await db.kv.put({ key: "acct.map", value: readAcctMap() });
  } catch {
    /* best-effort */
  }
}

/** v0.29.0 (VERIFY-DATA-14) — the Dexie mirror was WRITE-ONLY: no code ever
 * read it back, so wiping localStorage (WebView cleanup, cache tools, a
 * crash…) permanently hid every account that had ADOPTED its guest space —
 * the adopted space id is random and lived only in the map. Now the map is
 * restored (merged, localStorage entries win) before every identity
 * decision, and the active space follows it when localStorage lost it. */
async function restoreAcctMapFromDexie(): Promise<Record<string, string>> {
  const local = readAcctMap();
  try {
    const row = (await db.kv.get("acct.map")) as { value?: Record<string, string> } | undefined;
    const mirrored = row?.value && typeof row.value === "object" ? row.value : {};
    const merged: Record<string, string> = { ...mirrored };
    for (const [k, v] of Object.entries(local)) if (v) merged[k] = v; // local wins
    const changed = JSON.stringify(merged) !== JSON.stringify(local);
    if (changed) {
      lsSet(ACCT_MAP, JSON.stringify(merged));
      void mirrorAcctMapToDexie();
    }
    // the ACTIVE pointer can be lost independently of the map — if the map
    // knows the active account but localStorage forgot, re-point it
    if (!lsGet(ACCT_ACTIVE)) {
      const activeId = lsGet("frame.acct.activeId");
      const known = activeId ? merged[activeId] : "";
      if (known) lsSet(ACCT_ACTIVE, known);
    }
    return merged;
  } catch {
    return local;
  }
}

const now = () => new Date().toISOString();

/* v0.27.0 (DATA-1/2) — local tombstones for mobile deletions. The cloud push
 * (pushWatchlist/pushFavorite/…) records its own tombstone when it runs, but
 * the shim-only paths (MyListManager DELETE /api/watchlist etc.) never call
 * it — so the LOCAL layer records the tombstone right here, keyed by slug. */
async function tombstoneForTitle(kind: "favorite" | "watchlist" | "rating" | "progress", titleId: number): Promise<void> {
  try {
    const t = (await db.titles.get(Number(titleId))) as { slug?: string } | undefined;
    if (t?.slug) recordTombstone(kind, t.slug);
  } catch {
    /* best-effort */
  }
}

const tsOf = (v: unknown): number => (typeof v === "number" ? v : Date.parse(String(v)) || 0);

/* ------------------------------------------------------------------ */
/* Profile                                                             */
/* ------------------------------------------------------------------ */

export type ProfileRow = {
  userKey: string;
  displayName: string;
  avatar: number;
  avatarImage: string | null;
  autoplay: boolean;
  autoNext: boolean;
  quality: string;
  subtitle: string;
  matureContent: boolean;
  reduceMotion: boolean;
  skipIntro: boolean;
  playbackSpeed: number;
  volume: number;
  dataSaver: boolean;
  notifyNewEpisodes: boolean;
  notifyRecommendations: boolean;
  notifyContinue: boolean;
  kidsMode: boolean;
  parentalPin: string;
  language: string;
  /** v0.27.0 (DATA-10) — synced player-prefs blob (zoom/sub-delay maps…) */
  playerPrefs?: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
};

const DEFAULT_PROFILE = (userKey: string): ProfileRow => ({
  userKey,
  displayName: "کاربر نما",
  avatar: 0,
  avatarImage: null,
  autoplay: true,
  autoNext: true,
  quality: "auto",
  subtitle: "fa",
  matureContent: true,
  reduceMotion: false,
  skipIntro: true,
  playbackSpeed: 1,
  volume: 80,
  dataSaver: false,
  notifyNewEpisodes: true,
  notifyRecommendations: true,
  notifyContinue: true,
  kidsMode: false,
  parentalPin: "",
  language: "fa",
  createdAt: now(),
  updatedAt: now(),
});

export async function getProfile(userKey = getUserKey()): Promise<ProfileRow> {
  if (isDesktopRuntime()) {
    const row = await srv<Partial<ProfileRow>>("/api/profile");
    return { ...DEFAULT_PROFILE(userKey), ...row } as ProfileRow;
  }
  const row = await db.profiles.get(userKey);
  if (row) return { ...DEFAULT_PROFILE(userKey), ...(row as object) } as ProfileRow;
  const fresh = DEFAULT_PROFILE(userKey);
  await db.profiles.put({ ...fresh } as Record<string, unknown>);
  return fresh;
}

const QUALITIES = new Set(["auto", "4k", "1080p", "720p", "480p"]);
const SUBS = new Set(["fa", "en", "off"]);
const LANGS = new Set(["fa", "en"]);
const SPEEDS = new Set([0.5, 0.75, 1, 1.25, 1.5, 1.75, 2]);

export async function patchProfile(b: Record<string, unknown>, userKey = getUserKey()): Promise<ProfileRow> {
  if (isDesktopRuntime()) {
    const row = await srvPost<Partial<ProfileRow>>("/api/profile", b, "PATCH");
    return { ...DEFAULT_PROFILE(userKey), ...row } as ProfileRow;
  }
  const cur = await getProfile(userKey);
  const next: ProfileRow = { ...cur, updatedAt: now() };
  if (typeof b.displayName === "string") next.displayName = b.displayName.trim().slice(0, 40) || "کاربر نما";
  if (typeof b.avatar === "number") next.avatar = Math.max(0, Math.min(11, Math.round(b.avatar)));
  if (b.avatarImage === null) next.avatarImage = null;
  else if (typeof b.avatarImage === "string" && b.avatarImage.length <= 400_000 && /^data:image\/(?:png|jpe?g|webp);base64,[A-Za-z0-9+/=]+$/.test(b.avatarImage)) next.avatarImage = b.avatarImage;
  for (const k of ["autoplay", "autoNext", "matureContent", "reduceMotion", "skipIntro", "dataSaver", "notifyNewEpisodes", "notifyRecommendations", "notifyContinue", "kidsMode"] as const) {
    if (typeof b[k] === "boolean") next[k] = b[k] as boolean;
  }
  if (typeof b.quality === "string" && QUALITIES.has(b.quality)) next.quality = b.quality;
  if (typeof b.subtitle === "string" && SUBS.has(b.subtitle)) next.subtitle = b.subtitle;
  if (typeof b.language === "string" && LANGS.has(b.language)) next.language = b.language;
  if (typeof b.playbackSpeed === "number" && SPEEDS.has(b.playbackSpeed)) next.playbackSpeed = b.playbackSpeed;
  if (typeof b.volume === "number") next.volume = Math.max(0, Math.min(100, Math.round(b.volume)));
  if (typeof b.parentalPin === "string" && (b.parentalPin === "" || /^\d{4}$/.test(b.parentalPin))) next.parentalPin = b.parentalPin;
  // v0.27.0 (DATA-10) — the synced player-prefs blob rides the profile row
  if (b.playerPrefs && typeof b.playerPrefs === "object") {
    try {
      const pp = JSON.stringify(b.playerPrefs);
      if (pp.length <= 200_000) next.playerPrefs = JSON.parse(pp) as Record<string, unknown>;
    } catch {
      /* ignore malformed */
    }
  }
  await db.profiles.put({ ...next } as Record<string, unknown>);
  try {
    // v0.12.0 — local profile touch timestamp drives the newer-wins cloud sync
    localStorage.setItem("frame.profile.touched", new Date().toISOString());
  } catch {
    /* ignore */
  }
  return next;
}

export async function wipeProfile(scope: string, userKey = getUserKey()): Promise<void> {
  if (isDesktopRuntime()) {
    await srvPost("/api/profile", { scope }, "DELETE");
    return;
  }
  const ops: Promise<unknown>[] = [];
  if (scope === "all" || scope === "history") ops.push(db.progress.where("userKey").equals(userKey).delete());
  if (scope === "all" || scope === "list") ops.push(db.watchlist.where("userKey").equals(userKey).delete());
  if (scope === "all" || scope === "favorites") ops.push(db.favorites.where("userKey").equals(userKey).delete());
  if (scope === "all" || scope === "ratings") ops.push(db.ratings.where("userKey").equals(userKey).delete());
  if (scope === "all") ops.push(db.profiles.delete(userKey));
  await Promise.all(ops);
  // v0.13.1 — user collections ride along with the full wipe (items first,
  // then the parents — mirrors the desktop route's ordering).
  if (scope === "all") {
    const cols = await db.ucollections.where("userKey").equals(userKey).toArray();
    for (const c of cols) {
      await db.ucitems.where("collectionId").equals((c as { id: number }).id).delete();
    }
    await db.ucollections.where("userKey").equals(userKey).delete();
  }
}

/* ------------------------------------------------------------------ */
/* Snapshot (GET /api/library)                                         */
/* ------------------------------------------------------------------ */

export type LibrarySnapshot = {
  watchlist: { titleId: number; status: ListStatus }[];
  favorites: number[];
  ratings: { titleId: number; score: number }[];
  collections: { name: string; items: number[] }[];
  profile: { displayName: string; avatar: number; avatarImage: string | null; reduceMotion: boolean; kidsMode: boolean; hasPin: boolean };
  /* v0.12.0 — history + full profile ride along for the cloud push */
  progress: { titleId: number; episodeId: number | null; position: number; duration: number; updatedAt: string }[];
  profileFull: Record<string, unknown>;
};

export async function getLibrarySnapshot(userKey = getUserKey()): Promise<LibrarySnapshot> {
  if (isDesktopRuntime()) return srv<LibrarySnapshot>("/api/library");
  const user = userKey || "guest";
  const [wl, fav, rt, cols, profile, progress] = await Promise.all([
    db.watchlist.where("userKey").equals(user).toArray(),
    db.favorites.where("userKey").equals(user).toArray(),
    db.ratings.where("userKey").equals(user).toArray(),
    listUserCollections(user),
    getProfile(user),
    db.progress.where("userKey").equals(user).toArray(),
  ]);
  const itemsOf = async (id: number) =>
    (await db.ucitems.where("collectionId").equals(id).toArray()).map((i) => Number((i as { titleId: number }).titleId));
  const collections = [] as { name: string; cid?: string; items: number[] }[];
  for (const c of cols) collections.push({ name: c.name, cid: c.cloudId, items: await itemsOf(c.id) });
  const { userKey: _uk, ...profileFull } = profile as Record<string, unknown>;
  return {
    watchlist: wl.map((w) => ({ titleId: Number(w.titleId), status: String(w.status) as ListStatus })),
    favorites: fav.map((f) => Number(f.titleId)),
    ratings: rt.map((r) => ({ titleId: Number(r.titleId), score: Number(r.score) })),
    collections,
    profile: {
      displayName: profile.displayName,
      avatar: profile.avatar,
      avatarImage: profile.avatarImage ?? null,
      reduceMotion: profile.reduceMotion,
      kidsMode: profile.kidsMode,
      hasPin: !!profile.parentalPin,
    },
    progress: (progress as unknown as { titleId: number; episodeId: number | null; position: number; duration: number; updatedAt: string }[])
      .slice(0, 500)
      .map((p) => ({ titleId: Number(p.titleId), episodeId: p.episodeId ?? null, position: Number(p.position), duration: Number(p.duration), updatedAt: String(p.updatedAt) })),
    profileFull,
  };
}

/* ------------------------------------------------------------------ */
/* Favorites                                                           */
/* ------------------------------------------------------------------ */

export async function toggleFavorite(titleId: number, value?: boolean, userKey = getUserKey()): Promise<boolean> {
  if (isDesktopRuntime()) {
    const d = await srvPost<{ isFavorite: boolean }>("/api/favorites", { titleId, value });
    return d.isFavorite;
  }
  const user = userKey || "guest";
  const existing = await db.favorites.where("[userKey+titleId]").equals([user, titleId]).first();
  const wanted = typeof value === "boolean" ? value : !existing;
  if (!wanted && existing) {
    await db.favorites.delete((existing as { id: number }).id);
    void tombstoneForTitle("favorite", titleId);
  }
  if (wanted && !existing) await db.favorites.add({ userKey: user, titleId, createdAt: now() });
  return wanted;
}

export async function addFavorites(titleIds: number[], userKey = getUserKey()): Promise<void> {
  if (isDesktopRuntime()) {
    await srvPost("/api/favorites", { titleIds }, "PUT");
    return;
  }
  const user = userKey || "guest";
  const have = new Set((await db.favorites.where("userKey").equals(user).toArray()).map((f) => Number(f.titleId)));
  const rows = titleIds.filter((id) => !have.has(id)).map((titleId) => ({ userKey: user, titleId, createdAt: now() }));
  if (rows.length) await db.favorites.bulkAdd(rows);
}

export async function removeFavorites(titleIds?: number[], userKey = getUserKey()): Promise<void> {
  if (isDesktopRuntime()) {
    if (!titleIds?.length) await srvPost("/api/profile", { scope: "favorites" }, "DELETE");
    else await srvPost("/api/favorites", { titleIds }, "DELETE");
    return;
  }
  const user = userKey || "guest";
  if (!titleIds?.length) {
    const rows = await db.favorites.where("userKey").equals(user).toArray();
    await db.favorites.where("userKey").equals(user).delete();
    for (const r of rows) void tombstoneForTitle("favorite", Number(r.titleId));
    return;
  }
  for (const id of titleIds) {
    const row = await db.favorites.where("[userKey+titleId]").equals([user, id]).first();
    if (row) {
      await db.favorites.delete((row as { id: number }).id);
      void tombstoneForTitle("favorite", id);
    }
  }
}

export async function isFavorite(titleId: number, userKey = getUserKey()): Promise<boolean> {
  if (isDesktopRuntime()) return srv<boolean>(`/api/x/is-favorite?titleId=${titleId}`);
  const user = userKey || "guest";
  return (await db.favorites.where("[userKey+titleId]").equals([user, titleId]).count()) > 0;
}

/* ------------------------------------------------------------------ */
/* Watchlist                                                           */
/* ------------------------------------------------------------------ */

const STATUSES = new Set(["planned", "watching", "watched"]);

export async function toggleWatchlist(titleId: number, value?: boolean, userKey = getUserKey()): Promise<boolean> {
  if (isDesktopRuntime()) {
    const d = await srvPost<{ inList: boolean }>("/api/watchlist", { titleId, value });
    return d.inList;
  }
  const user = userKey || "guest";
  const existing = await db.watchlist.where("[userKey+titleId]").equals([user, titleId]).first();
  const wanted = typeof value === "boolean" ? value : !existing;
  if (!wanted && existing) {
    await db.watchlist.delete((existing as { id: number }).id);
    void tombstoneForTitle("watchlist", titleId);
  }
  if (wanted && !existing) await db.watchlist.add({ userKey: user, titleId, status: "planned", note: "", pinned: false, createdAt: now(), updatedAt: now() });
  return wanted;
}

export async function patchWatchlist(
  b: { titleId: number; status?: string; note?: string; pinned?: boolean; plannedDate?: string | null },
  userKey = getUserKey()
): Promise<void> {
  if (isDesktopRuntime()) {
    await srvPost("/api/watchlist", b, "PATCH");
    return;
  }
  const user = userKey || "guest";
  const existing = await db.watchlist.where("[userKey+titleId]").equals([user, b.titleId]).first();
  const base = (existing as Record<string, unknown> | undefined) ?? { userKey: user, titleId: b.titleId, status: "planned", note: "", pinned: false, createdAt: now() };
  const next = { ...base, updatedAt: now() } as Record<string, unknown>;
  if (b.status && STATUSES.has(b.status)) next.status = b.status;
  if (typeof b.note === "string") next.note = b.note.slice(0, 500);
  if (typeof b.pinned === "boolean") next.pinned = b.pinned;
  if (b.plannedDate !== undefined) next.plannedDate = b.plannedDate || null;
  if (existing) await db.watchlist.put(next);
  else await db.watchlist.add(next);
}

export async function removeWatchlist(titleId?: number, userKey = getUserKey()): Promise<void> {
  if (isDesktopRuntime()) {
    await srvPost("/api/watchlist", titleId ? { titleIds: [titleId] } : {}, "DELETE");
    return;
  }
  const user = userKey || "guest";
  if (!titleId) {
    const rows = await db.watchlist.where("userKey").equals(user).toArray();
    for (const r of rows) void tombstoneForTitle("watchlist", Number(r.titleId));
    await db.watchlist.where("userKey").equals(user).delete();
    return;
  }
  const row = await db.watchlist.where("[userKey+titleId]").equals([user, titleId]).first();
  if (row) {
    await db.watchlist.delete((row as { id: number }).id);
    void tombstoneForTitle("watchlist", titleId);
  }
}

export async function isInWatchlist(titleId: number, userKey = getUserKey()): Promise<boolean> {
  if (isDesktopRuntime()) return srv<boolean>(`/api/x/in-watchlist?titleId=${titleId}`);
  const user = userKey || "guest";
  return (await db.watchlist.where("[userKey+titleId]").equals([user, titleId]).count()) > 0;
}

export async function getWatchlistIds(userKey = getUserKey()): Promise<number[]> {
  if (isDesktopRuntime()) return srv<number[]>("/api/x/watchlist-ids");
  const user = userKey || "guest";
  const rows = await db.watchlist.where("userKey").equals(user).toArray();
  return rows.map((r) => Number(r.titleId));
}

/* ------------------------------------------------------------------ */
/* Progress / history                                                  */
/* ------------------------------------------------------------------ */

export type ProgressRow = { titleId: number; episodeId: number | null; position: number; duration: number; updatedAt: string };

export async function upsertProgress(
  b: { titleId: number; episodeId?: number | null; position: number; duration: number },
  userKey = getUserKey()
): Promise<void> {
  if (isDesktopRuntime()) {
    await srvPost("/api/progress", { titleId: b.titleId, episodeId: b.episodeId ?? null, position: b.position, duration: b.duration });
    return;
  }
  const user = userKey || "guest";
  const epId = b.episodeId ? Number(b.episodeId) : null;
  /* v0.27.0 (DATA-7) — ONE ROW PER EPISODE, not per title: finishing S02E01
   * no longer erases the S01E03 position. Movies (episodeId null) keep one
   * title-level row. */
  const existing = await db.progress
    .where("[userKey+titleId]")
    .equals([user, b.titleId])
    .filter((r) => ((r as { episodeId?: number | null }).episodeId ?? null) === epId)
    .first();
  const row = { userKey: user, titleId: b.titleId, episodeId: epId, position: b.position, duration: b.duration, updatedAt: now() };
  if (existing) await db.progress.put({ ...row, id: (existing as { id: number }).id });
  else await db.progress.add(row);
}

/** v0.27.0 (DATA-7) — per-episode aware progress read:
 *  - WITH episodeId → that episode's own row (fallback: the legacy
 *    title-level row only when it points at the same episode);
 *  - WITHOUT episodeId → the most recently touched row of the title (the
 *    classic «resume» behaviour). */
export async function getProgressFor(titleId: number, episodeId?: number | null, userKey = getUserKey()): Promise<ProgressRow | null> {
  if (isDesktopRuntime()) {
    const q = episodeId ? `&episodeId=${episodeId}` : "";
    return srv<ProgressRow | null>(`/api/x/progress?titleId=${titleId}${q}`);
  }
  const user = userKey || "guest";
  const rows = (await db.progress.where("[userKey+titleId]").equals([user, titleId]).toArray()) as unknown as { id: number; episodeId: number | null; position: number; duration: number; updatedAt: string }[];
  if (!rows.length) return null;
  const toRow = (r: (typeof rows)[number]): ProgressRow => ({ titleId, episodeId: r.episodeId ?? null, position: Number(r.position), duration: Number(r.duration), updatedAt: String(r.updatedAt) });
  if (episodeId) {
    const epRow = rows.find((r) => (r.episodeId ?? null) === Number(episodeId));
    if (epRow) return toRow(epRow);
    return null;
  }
  const latest = [...rows].sort((a, b) => tsOf(b.updatedAt) - tsOf(a.updatedAt))[0];
  return latest ? toRow(latest) : null;
}

export async function getProgressMap(titleIds: number[], userKey = getUserKey()): Promise<Map<number, { position: number; duration: number }>> {
  if (isDesktopRuntime()) {
    if (!titleIds.length) return new Map();
    const obj = await srv<Record<string, { position: number; duration: number }>>(`/api/x/progress-map?ids=${titleIds.join(",")}`);
    return new Map(Object.entries(obj).map(([k, v]) => [Number(k), v]));
  }
  const user = userKey || "guest";
  const out = new Map<number, { position: number; duration: number }>();
  for (const id of titleIds) {
    const r = await getProgressFor(id, null, user);
    if (r) out.set(id, { position: r.position, duration: r.duration });
  }
  return out;
}

export async function removeProgress(titleId?: number | number[], userKey = getUserKey()): Promise<number> {
  if (isDesktopRuntime()) {
    const body = Array.isArray(titleId) ? { titleIds: titleId } : titleId ? { titleId } : {};
    const d = await srvPost<{ removed: number }>("/api/progress", body, "DELETE");
    return d.removed;
  }
  const user = userKey || "guest";
  const ids = Array.isArray(titleId) ? titleId : titleId ? [titleId] : [];
  if (!ids.length) {
    const all = await db.progress.where("userKey").equals(user).toArray();
    await db.progress.where("userKey").equals(user).delete();
    recordTombstone("progress", "*");
    return all.length;
  }
  let n = 0;
  for (const id of ids) {
    const rows = (await db.progress.where("[userKey+titleId]").equals([user, id]).toArray()) as unknown as { id: number }[];
    if (rows.length) {
      await db.progress.bulkDelete(rows.map((r) => r.id));
      void tombstoneForTitle("progress", id);
      n += rows.length;
    }
  }
  return n;
}

/* ------------------------------------------------------------------ */
/* Ratings                                                             */
/* ------------------------------------------------------------------ */

export async function setRating(titleId: number, score: number, userKey = getUserKey()): Promise<number | null> {
  if (isDesktopRuntime()) {
    const d = await srvPost<{ score: number | null }>("/api/rating", { titleId, score });
    return d.score;
  }
  const user = userKey || "guest";
  if (score === 0) {
    void tombstoneForTitle("rating", titleId);
    await db.ratings.where("[userKey+titleId]").equals([user, titleId]).delete();
    return null;
  }
  const existing = await db.ratings.where("[userKey+titleId]").equals([user, titleId]).first();
  const row = { userKey: user, titleId, score, updatedAt: now() };
  if (existing) await db.ratings.put({ ...row, id: (existing as { id: number }).id });
  else await db.ratings.add(row);
  return score;
}

export async function getUserScore(titleId: number, userKey = getUserKey()): Promise<number | null> {
  if (isDesktopRuntime()) return srv<number | null>(`/api/x/score?titleId=${titleId}`);
  const user = userKey || "guest";
  const row = await db.ratings.where("[userKey+titleId]").equals([user, titleId]).first();
  return row ? Number((row as { score: number }).score) : null;
}

/* ------------------------------------------------------------------ */
/* Rich rows (my list / favorites / history)                           */
/* ------------------------------------------------------------------ */

export type ListRow = {
  title: LiteTitle & Partial<TitleView>;
  status: ListStatus;
  note: string;
  pinned: boolean;
  addedAt: string;
  updatedAt: string;
  plannedDate: string | null;
  progress: { position: number; duration: number; episodeId: number | null } | null;
  isFavorite: boolean;
  myScore: number | null;
};

export async function getMyListRows(userKey = getUserKey()): Promise<ListRow[]> {
  if (isDesktopRuntime()) return srv<ListRow[]>("/api/x/list");
  const user = userKey || "guest";
  const rows = await db.watchlist.where("userKey").equals(user).toArray();
  const ids = rows.map((r) => Number(r.titleId));
  const titles = await Promise.all(ids.map((id) => db.titles.get(id) as Promise<Record<string, unknown> | undefined>));
  const liteById = new Map<number, LiteTitle>();
  titles.forEach((t) => {
    if (t) liteById.set(Number(t.id), t as unknown as LiteTitle);
  });
  const [prog, favs, rats] = await Promise.all([
    Promise.all(ids.map((id) => getProgressFor(id, null, user))),
    db.favorites.where("userKey").equals(user).toArray(),
    db.ratings.where("userKey").equals(user).toArray(),
  ]);
  const pm = new Map<number, ProgressRow>();
  prog.forEach((p) => p && pm.set(p.titleId, p));
  const fs = new Set(favs.map((f) => Number(f.titleId)));
  const rm = new Map<number, number>(rats.map((r) => [Number(r.titleId), Number(r.score)]));
  /* v0.27.0 (QOL-4) — numeric timestamp compare (string compare broke when
   * cloud-merged rows mixed date formats) */
  const sorted = [...rows].sort((a, b) => Number(b.pinned) - Number(a.pinned) || tsOf(b.createdAt) - tsOf(a.createdAt));
  return sorted.map((r) => {
    const titleId = Number(r.titleId);
    const t = liteById.get(titleId);
    const p = pm.get(titleId) ?? null;
    return {
      title: (t ?? { id: titleId, slug: "", title: "؟", titleEn: "", type: "movie", year: 0, rating: 0, duration: 0, genres: [], poster: "", backdrop: "", quality: "", country: "", ageRating: "", views: 0, featured: false, trendingScore: 0, director: "", cast: [] }) as LiteTitle & Partial<TitleView>,
      status: String(r.status) as ListStatus,
      note: String(r.note ?? ""),
      pinned: !!r.pinned,
      addedAt: String(r.createdAt ?? now()),
      updatedAt: String(r.updatedAt ?? now()),
      plannedDate: r.plannedDate ? String(r.plannedDate).slice(0, 10) : null,
      progress: p ? { position: p.position, duration: p.duration, episodeId: p.episodeId } : null,
      isFavorite: fs.has(titleId),
      myScore: rm.get(titleId) ?? null,
    };
  });
}

export type FavoriteRow = { title: LiteTitle & Partial<TitleView>; addedAt: string; inList: boolean; myScore: number | null };

export async function getFavoriteRows(userKey = getUserKey()): Promise<FavoriteRow[]> {
  if (isDesktopRuntime()) return srv<FavoriteRow[]>("/api/x/favorites");
  const user = userKey || "guest";
  const rows = await db.favorites.where("userKey").equals(user).toArray();
  rows.sort((a, b) => tsOf(b.createdAt) - tsOf(a.createdAt));
  const out: FavoriteRow[] = [];
  for (const f of rows) {
    const titleId = Number(f.titleId);
    const t = (await db.titles.get(titleId)) as unknown as LiteTitle | undefined;
    if (!t) continue;
    const [inList, myScore] = await Promise.all([isInWatchlist(titleId, user), getUserScore(titleId, user)]);
    out.push({ title: t as LiteTitle & Partial<TitleView>, addedAt: String(f.createdAt), inList, myScore });
  }
  return out;
}

export type HistoryRow = {
  title: LiteTitle & Partial<TitleView>;
  position: number;
  duration: number;
  episodeId: number | null;
  episodeName: string | null;
  episodeNumber: number | null;
  season: number | null;
  updatedAt: string;
  finished: boolean;
};

export async function getHistory(userKey = getUserKey()): Promise<HistoryRow[]> {
  if (isDesktopRuntime()) return srv<HistoryRow[]>("/api/x/history");
  const user = userKey || "guest";
  const rows = await db.progress.where("userKey").equals(user).toArray();
  rows.sort((a, b) => tsOf(b.updatedAt) - tsOf(a.updatedAt));
  const out: HistoryRow[] = [];
  for (const r of rows) {
    const titleId = Number(r.titleId);
    const t = (await db.titles.get(titleId)) as unknown as LiteTitle | undefined;
    if (!t) continue;
    const episodeId = (r.episodeId as number | null) ?? null;
    let episodeName: string | null = null;
    let episodeNumber: number | null = null;
    let season: number | null = null;
    if (episodeId && t.type === "series") {
      const eps = await getEpisodes(titleId);
      const ep = eps.find((e) => e.id === episodeId);
      if (ep) { episodeName = ep.name; episodeNumber = ep.number; season = ep.season; }
    }
    const position = Number(r.position);
    const duration = Number(r.duration);
    out.push({
      title: t as LiteTitle & Partial<TitleView>,
      position, duration, episodeId, episodeName, episodeNumber, season,
      updatedAt: String(r.updatedAt),
      finished: duration > 0 && position / duration >= 0.97,
    });
  }
  return out;
}

export type ContinueItem = {
  title: LiteTitle & Partial<TitleView>;
  position: number;
  duration: number;
  episodeId: number | null;
  episodeName: string | null;
  episodeNumber: number | null;
  season: number | null;
};

export async function getContinueWatching(limit = 12, userKey = getUserKey()): Promise<ContinueItem[]> {
  if (isDesktopRuntime()) return srv<ContinueItem[]>(`/api/x/continue?limit=${limit}`);
  const rows = await getHistory(userKey);
  /* v0.27.0 (DATA-7) — progress is now PER-EPISODE: one series can have many
   * rows. Continue-watching still shows ONE card per title — its most recent
   * unfinished episode. */
  const seen = new Set<number>();
  const out: ContinueItem[] = [];
  for (const r of rows) {
    if (seen.has(r.title.id)) continue;
    if (!(r.duration > 0 && r.position / r.duration < 0.97)) continue;
    seen.add(r.title.id);
    out.push({ title: r.title, position: r.position, duration: r.duration, episodeId: r.episodeId, episodeName: r.episodeName, episodeNumber: r.episodeNumber, season: r.season });
    if (out.length >= limit) break;
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Reviews                                                             */
/* ------------------------------------------------------------------ */

export type ReviewRow = { id: number; titleId: number; author: string; rating: number; body: string; createdAt: string; userKey?: string };

export async function addReview(b: { titleId: number; author: string; rating: number; body: string }): Promise<ReviewRow> {
  if (isDesktopRuntime()) return srvPost<ReviewRow>("/api/reviews", b);
  // v0.29.0 (NEW-DATA-10) — reviews are stamped with the owning data space;
  // the shared Dexie table used to leak every account's comments to every
  // other account on the SAME device.
  const row = { titleId: b.titleId, author: b.author.slice(0, 80), rating: Math.min(10, Math.max(1, Math.round(b.rating))), body: b.body.slice(0, 2000), createdAt: now(), userKey: getUserKey() };
  const id = await db.reviews.add({ ...row } as Record<string, unknown>);
  return { ...row, id: Number(id) };
}

export async function getReviews(titleId: number): Promise<ReviewRow[]> {
  if (isDesktopRuntime()) return srv<ReviewRow[]>(`/api/x/reviews?titleId=${titleId}`);
  const uk = getUserKey();
  const rows = await db.reviews.where("titleId").equals(titleId).toArray();
  // v0.29.0 (NEW-DATA-10) — own rows + legacy rows written before the stamp
  // existed (they keep their old everyone-visible behaviour)
  return (rows as unknown as (ReviewRow & { userKey?: string })[])
    .filter((r) => !r.userKey || r.userKey === uk)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/* ------------------------------------------------------------------ */
/* Stats (profile page)                                                */
/* ------------------------------------------------------------------ */

export type UserStats = {
  listCount: number;
  favCount: number;
  watchedCount: number;
  historyCount: number;
  ratingCount: number;
  minutesWatched: number;
  topGenres: { genre: string; count: number }[];
  memberSince: string;
};

export async function getUserStats(userKey = getUserKey()): Promise<UserStats> {
  if (isDesktopRuntime()) return srv<UserStats>("/api/x/stats");
  const user = userKey || "guest";
  const [wl, favs, hist, ratingCount, profile] = await Promise.all([
    db.watchlist.where("userKey").equals(user).toArray(),
    db.favorites.where("userKey").equals(user).toArray(),
    db.progress.where("userKey").equals(user).toArray(),
    db.ratings.where("userKey").equals(user).count(),
    getProfile(user),
  ]);
  const gc = new Map<string, number>();
  const bump = (g: string) => gc.set(g, (gc.get(g) ?? 0) + 1);
  const enrich = async (rows: Record<string, unknown>[]) => {
    for (const r of rows) {
      const t = (await db.titles.get(Number(r.titleId))) as unknown as { genres?: string[] } | undefined;
      (t?.genres ?? []).forEach(bump);
    }
  };
  await enrich(wl);
  await enrich(favs);
  return {
    listCount: wl.length,
    favCount: favs.length,
    watchedCount: wl.filter((w) => w.status === "watched").length,
    historyCount: hist.length,
    ratingCount,
    minutesWatched: Math.round(hist.reduce((a, h) => a + Number(h.position), 0) / 60),
    topGenres: [...gc.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([genre, count]) => ({ genre, count })),
    memberSince: profile.createdAt,
  };
}

/* ------------------------------------------------------------------ */
/* Notifications (derived on the fly, mirrors lib/notifications.ts)    */
/* ------------------------------------------------------------------ */

export type Notification = { id: string; kind: "episode" | "continue" | "recommend" | "new" | "system"; title: string; body: string; href: string; image?: string; at: string; read?: boolean };

export async function getNotifications(userKey = getUserKey()): Promise<Notification[]> {
  if (isDesktopRuntime()) return srv<Notification[]>("/api/notifications");
  const user = userKey || "guest";
  const [profile, list, cont] = await Promise.all([getProfile(user), getMyListRows(user), getContinueWatching(6, user)]);
  const out: Notification[] = [];
  const nowMs = Date.now();

  if (profile.notifyNewEpisodes) {
    const series = list.filter((r) => r.title.type === "series" && r.status !== "watched").slice(0, 8);
    for (const r of series) {
      const eps = await getEpisodes(r.title.id);
      const last = eps[eps.length - 1];
      if (!last) continue;
      out.push({
        id: `ep-${last.id}`,
        kind: "episode",
        title: `قسمت ${last.number} فصل ${last.season} «${r.title.title}»`,
        body: last.name,
        href: watchHref(r.title.slug, last.id),
        image: last.thumbnail || r.title.backdrop,
        at: new Date(nowMs - 1000 * 60 * 60 * (2 + (last.id % 20))).toISOString(),
      });
    }
  }

  if (profile.notifyContinue) {
    for (const c of cont) {
      const pct = c.duration ? Math.round((c.position / c.duration) * 100) : 0;
      out.push({
        id: `cont-${c.title.id}`,
        kind: "continue",
        title: `ادامه‌ی «${c.title.title}»`,
        body: c.episodeName ? `قسمت ${c.episodeNumber} · ${pct}٪ دیده‌اید` : `${pct}٪ دیده‌اید؛ از همان‌جا ادامه دهید`,
        href: watchHref(c.title.slug, c.episodeId),
        image: c.title.backdrop,
        at: new Date(nowMs - 1000 * 60 * 60 * 26).toISOString(),
      });
    }
  }

  if (profile.notifyRecommendations) {
    const counts = new Map<string, number>();
    list.forEach((r) => r.title.genres.forEach((g) => counts.set(g, (counts.get(g) ?? 0) + 1)));
    const top = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
    if (top) {
      const { getSimilar } = await import("./db");
      const pool = list.length ? await getSimilar(list[0].title, 6) : [];
      for (const t of pool.slice(0, 3)) {
        out.push({
          id: `rec-${t.id}`,
          kind: "recommend",
          title: `پیشنهاد برای شما: «${t.title}»`,
          body: top,
          href: titleHref(t.slug),
          image: t.poster,
          at: new Date(nowMs - 1000 * 60 * 60 * 40).toISOString(),
        });
      }
    }
  }

  const { getNewest, currentManifest } = await import("./db");
  const manifestAt = currentManifest()?.generatedAt ?? new Date().toISOString();
  for (const t of await getNewest(4)) {
    out.push({
      id: `new-${t.id}`,
      kind: "new",
      title: `تازه اضافه شد: «${t.title}»`,
      body: `${t.type === "series" ? "سریال" : "فیلم"} · ${t.year} · ${t.genres.slice(0, 2).join("، ")}`,
      href: titleHref(t.slug),
      image: t.poster,
      at: manifestAt,
    });
  }

  out.push({
    id: "sys-welcome",
    kind: "system",
    title: "به فریم خوش آمدید",
    body: "از تنظیمات می‌توانید نوع اعلان‌هایی که دریافت می‌کنید را شخصی‌سازی کنید.",
    href: "/settings#notifications",
    at: profile.createdAt,
  });

  const reads = new Set((await db.notificationsRead.where("userKey").equals(user).toArray()).map((r) => r.id));
  return out.sort((a, b) => +new Date(b.at) - +new Date(a.at)).map((n) => ({ ...n, read: reads.has(n.id) }));
}

export async function markNotificationRead(id: string, userKey = getUserKey()): Promise<void> {
  if (isDesktopRuntime()) {
    await srvPost("/api/notifications", { id });
    return;
  }
  const user = userKey || "guest";
  if (await db.notificationsRead.get(id)) return;
  await db.notificationsRead.put({ id, userKey: user, at: now() });
}

export async function markAllNotificationsRead(userKey = getUserKey()): Promise<void> {
  if (isDesktopRuntime()) {
    await srvPost("/api/notifications", { all: true });
    return;
  }
  const items = await getNotifications(userKey);
  const user = userKey || "guest";
  await db.notificationsRead.bulkPut(items.filter((n) => !n.read).map((n) => ({ id: n.id, userKey: user, at: now() })));
}

/* episode id helper re-export for the watch page */
export { episodeId, getFullTitle, getTitleLiteBySlug, json };

/* ------------------------------------------------------------------ */
/* User collections (v0.10.32) — کالکشن‌های شخصی، سینک با اکانت        */
/* Desktop → real /api/collections* routes (Prisma).                   */
/* Mobile  → Dexie (the fetch shim serves the same endpoints).         */
/* ------------------------------------------------------------------ */

export type UCollection = {
  id: number;
  name: string;
  count: number;
  posters: string[];
  movies: number;
  series: number;
  createdAt: string;
  updatedAt: string;
  /** v0.29.0 (VERIFY-DATA-16) — the cloud row's stable uuid when synced */
  cloudId?: string;
};

export async function listUserCollections(userKey = getUserKey()): Promise<UCollection[]> {
  if (isDesktopRuntime()) return srv<UCollection[]>("/api/collections");
  const user = userKey || "guest";
  const cols = await db.ucollections.where("userKey").equals(user).toArray();
  const out: UCollection[] = [];
  for (const c of cols) {
    const id = Number((c as { id: number }).id);
    const items = await db.ucitems.where("collectionId").equals(id).toArray();
    const ids = items.map((i) => Number((i as { titleId: number }).titleId));
    const posters: string[] = [];
    let movies = 0;
    let series = 0;
    for (const tid of ids.slice(0, 30)) {
      const t = (await db.titles.get(tid)) as Record<string, unknown> | undefined;
      if (t?.poster) posters.push(String(t.poster));
      if (t?.type === "series") series++;
      else movies++;
    }
    out.push({
      id,
      name: String((c as { name: string }).name),
      count: ids.length,
      posters: posters.slice(0, 6),
      movies,
      series,
      createdAt: String((c as { createdAt: string }).createdAt ?? now()),
      updatedAt: String((c as { updatedAt: string }).updatedAt ?? now()),
      cloudId: typeof (c as { cloudId?: unknown }).cloudId === "string" ? String((c as { cloudId?: unknown }).cloudId) : undefined,
    });
  }
  return out.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export async function createUserCollection(name: string, userKey = getUserKey()): Promise<{ id: number; name: string }> {
  const clean = String(name ?? "").trim().slice(0, 60);
  if (!clean) throw new Error("name required");
  if (isDesktopRuntime()) return srvPost<{ id: number; name: string }>("/api/collections", { name: clean });
  const user = userKey || "guest";
  const dupe = await db.ucollections.where("[userKey+name]").equals([user, clean]).first();
  if (dupe) return { id: Number((dupe as { id: number }).id), name: clean };
  const id = await db.ucollections.add({ userKey: user, name: clean, createdAt: now(), updatedAt: now() });
  return { id: Number(id), name: clean };
}

export async function renameUserCollection(id: number, name: string, userKey = getUserKey()): Promise<void> {
  const clean = String(name ?? "").trim().slice(0, 60);
  if (!id || !clean) throw new Error("id + name required");
  if (isDesktopRuntime()) {
    await srvPost("/api/collections", { id, name: clean }, "PATCH");
    return;
  }
  await db.ucollections.update(id, { name: clean, updatedAt: now() });
}

export async function deleteUserCollection(id: number, userKey = getUserKey()): Promise<void> {
  if (!id) return;
  if (isDesktopRuntime()) {
    await srv("/api/collections", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) });
    return;
  }
  await db.ucitems.where("collectionId").equals(id).delete();
  await db.ucollections.delete(id);
}

/** Full item rows of one user collection (grid-ready). */
export async function getCollectionItems(collectionId: number, userKey = getUserKey()): Promise<TitleView[]> {
  if (!collectionId) return [];
  if (isDesktopRuntime()) return srv<TitleView[]>(`/api/collections/items?collectionId=${collectionId}`);
  const rows = await db.ucitems.where("collectionId").equals(collectionId).toArray();
  const ids = rows.map((r) => Number((r as { titleId: number }).titleId));
  const out: TitleView[] = [];
  for (const id of ids) {
    const t = (await db.titles.get(id)) as unknown as TitleView | undefined;
    if (t) out.push(t);
  }
  return out.reverse(); // newest first (ucitems were added ascending)
}

/** Which of MY collections contain this title → ids (for the picker checkmarks). */
export async function collectionsContaining(titleId: number, userKey = getUserKey()): Promise<number[]> {
  if (!titleId) return [];
  if (isDesktopRuntime()) return srv<{ collectionIds: number[] }>(`/api/collections/items?titleId=${titleId}`).then((d) => d.collectionIds);
  const user = userKey || "guest";
  const mine = await db.ucollections.where("userKey").equals(user).toArray();
  const out: number[] = [];
  for (const c of mine) {
    const id = Number((c as { id: number }).id);
    const hit = await db.ucitems.where("[collectionId+titleId]").equals([id, titleId]).count();
    if (hit > 0) out.push(id);
  }
  return out;
}

/** Add/remove a title in a collection → { inCollection, items } (items = current ids, for the cloud push). */
export async function setCollectionItem(
  collectionId: number,
  titleId: number,
  value?: boolean,
  userKey = getUserKey()
): Promise<{ inCollection: boolean; items: number[] }> {
  if (!collectionId || !titleId) throw new Error("collectionId + titleId required");
  if (isDesktopRuntime()) return srvPost<{ inCollection: boolean; items: number[] }>("/api/collections/items", { collectionId, titleId, value });
  const existing = await db.ucitems.where("[collectionId+titleId]").equals([collectionId, titleId]).first();
  const wanted = typeof value === "boolean" ? value : !existing;
  if (wanted && !existing) await db.ucitems.add({ collectionId, titleId, addedAt: now() });
  if (!wanted && existing) await db.ucitems.delete((existing as { id: number }).id);
  await db.ucollections.update(collectionId, { updatedAt: now() });
  const rows = await db.ucitems.where("collectionId").equals(collectionId).toArray();
  return { inCollection: wanted, items: rows.map((r) => Number((r as { titleId: number }).titleId)) };
}

/* ------------------------------------------------------------------ */
/* Cloud → Dexie merge (v0.10.32, slug-based since v0.13.0)             */
/* The mobile shim serves POST /api/cloud/merge with this — Supabase    */
/* snapshot rows land in IndexedDB, so an account's library shows up    */
/* on Android too (cloud fills gaps, local wins, nothing is deleted).   */
/* v0.13.0: snapshot rows carry STABLE slugs; they are resolved against */
/* THIS device's lite index (slug → local id) before merging, so rows   */
/* from a device with a different catalog generation can never land on  */
/* the wrong title again. Unknown slugs are skipped.                    */
/* ------------------------------------------------------------------ */

export type CloudMergeBody = {
  favorites?: { slug?: unknown; title?: unknown }[];
  watchlist?: { slug?: unknown; title?: unknown; status?: unknown; updatedAt?: unknown }[];
  ratings?: { slug?: unknown; title?: unknown; score?: unknown; updatedAt?: unknown }[];
  collections?: { name?: unknown; items?: { slug?: unknown; title?: unknown }[] }[];
  progress?: { slug?: unknown; season?: unknown; episode?: unknown; position?: unknown; duration?: unknown; updatedAt?: unknown }[];
  deletions?: { kind?: unknown; key?: unknown; at?: unknown; action?: unknown; to?: unknown; slug?: unknown }[];
};

const slugOf = (r: unknown): string => String((r as { slug?: unknown })?.slug ?? "").trim().slice(0, 140);

export async function mergeCloudSnapshot(
  body: CloudMergeBody,
  userKey = getUserKey()
): Promise<{ favoritesAdded: number; listAdded: number; listUpdated: number; ratingsAdded: number; collectionsAdded: number; collectionItemsAdded: number; progressApplied: number; deletionsApplied: number; skipped: number }> {
  const user = userKey || "guest";
  let favoritesAdded = 0;
  let listAdded = 0;
  let listUpdated = 0;
  let ratingsAdded = 0;
  let collectionsAdded = 0;
  let collectionItemsAdded = 0;
  let progressApplied = 0;
  let deletionsApplied = 0;
  let skipped = 0;
  const nowMs = Date.now();
  const SKEW_MS = 24 * 60 * 60 * 1000;

  // one slug → local id pass for the whole payload
  const allSlugs = [
    ...(body.favorites ?? []),
    ...(body.watchlist ?? []),
    ...(body.ratings ?? []),
    ...(body.collections ?? []).flatMap((c) => (c?.items ?? []) as { slug?: unknown }[]),
    ...(body.progress ?? []),
    ...((body.deletions ?? []).filter((d) => String(d?.kind ?? "") !== "collection").map((d) => ({ slug: (d as Record<string, unknown>)?.key }))) as { slug?: unknown }[],
  ]
    .map(slugOf)
    .filter(Boolean);
  const idBySlug = new Map<string, number>();
  for (const s of [...new Set(allSlugs)]) {
    const t = await getTitleLiteBySlug(s);
    if (t) idBySlug.set(s, t.id);
  }

  /* ---------- deletions first (other devices' sync_del events) ---------- */
  const deletedSlugs = new Set<string>();
  const renamedFrom = new Set<string>();
  for (const d of (body.deletions ?? []).slice(0, 1_000)) {
    const kind = String(d?.kind ?? "");
    const key = String(d?.key ?? "").slice(0, 160);
    const at = typeof d?.at === "number" ? d.at : Date.parse(String(d?.at ?? "")) || 0;
    if (!kind || !key || !at) continue;
    if (kind === "favorite" || kind === "watchlist" || kind === "rating") {
      const titleId = idBySlug.get(key);
      if (!titleId) continue;
      const table = kind === "favorite" ? db.favorites : kind === "watchlist" ? db.watchlist : db.ratings;
      const row = (await table.where("[userKey+titleId]").equals([user, titleId]).first()) as Record<string, unknown> | undefined;
      if (!row) continue;
      const rowTs = tsOf(row.updatedAt) || tsOf(row.createdAt);
      if (at > rowTs) {
        await table.delete((row as { id: number }).id);
        deletionsApplied++;
        deletedSlugs.add(key);
      }
      continue;
    }
    if (kind === "progress") {
      if (key === "*") {
        const rows = (await db.progress.where("userKey").equals(user).toArray()) as unknown as { id: number; updatedAt: string }[];
        const stale = rows.filter((r) => at > tsOf(r.updatedAt));
        await db.progress.bulkDelete(stale.map((r) => r.id));
        deletionsApplied += stale.length;
      } else {
        const titleId = idBySlug.get(key);
        if (!titleId) continue;
        const rows = (await db.progress.where("[userKey+titleId]").equals([user, titleId]).toArray()) as unknown as { id: number; updatedAt: string }[];
        const stale = rows.filter((r) => at > tsOf(r.updatedAt));
        await db.progress.bulkDelete(stale.map((r) => r.id));
        deletionsApplied += stale.length;
        if (stale.length) deletedSlugs.add(key);
      }
      continue;
    }
    if (kind === "collection") {
      const row = (await db.ucollections.where("[userKey+name]").equals([user, key]).first()) as Record<string, unknown> | undefined;
      if (!row) continue;
      if (String(d?.action ?? "delete") === "rename") {
        const to = String(d?.to ?? "").slice(0, 60);
        if (!to) continue;
        renamedFrom.add(key);
        const dst = (await db.ucollections.where("[userKey+name]").equals([user, to]).first()) as Record<string, unknown> | undefined;
        if (at > tsOf(row.updatedAt)) {
          if (dst) {
            // both exist → keep the target, drop the stale old-name row
            await db.ucitems.where("collectionId").equals(Number(row.id)).delete();
            await db.ucollections.delete(Number(row.id));
          } else {
            await db.ucollections.update(Number(row.id), { name: to, updatedAt: now() });
          }
          deletionsApplied++;
        }
      } else if (at > tsOf(row.updatedAt)) {
        await db.ucitems.where("collectionId").equals(Number(row.id)).delete();
        await db.ucollections.delete(Number(row.id));
        deletionsApplied++;
      }
      continue;
    }
    if (kind === "collection-item") {
      const row = (await db.ucollections.where("[userKey+name]").equals([user, key]).first()) as Record<string, unknown> | undefined;
      if (!row) continue;
      const itemSlug = String(d?.slug ?? "").slice(0, 140);
      const titleId = idBySlug.get(itemSlug);
      if (!titleId) continue;
      const item = (await db.ucitems.where("[collectionId+titleId]").equals([Number(row.id), titleId]).first()) as Record<string, unknown> | undefined;
      if (item && at > tsOf(item.addedAt)) {
        await db.ucitems.delete(Number(item.id));
        deletionsApplied++;
      }
    }
  }

  // favorites — tombstone-aware (a pending offline delete blocks re-adding)
  for (const r of body.favorites ?? []) {
    const slug = slugOf(r);
    if (!slug || deletedSlugs.has(slug)) continue;
    if (tombstoneNewerThan("favorite", slug, 0)) continue;
    const titleId = idBySlug.get(slug);
    if (!titleId) {
      skipped++;
      continue;
    }
    const ex = await db.favorites.where("[userKey+titleId]").equals([user, titleId]).count();
    if (!ex) {
      await db.favorites.add({ userKey: user, titleId, createdAt: now() });
      favoritesAdded++;
    }
  }

  // watchlist — LWW by updated_at (DATA-5), no more fill-gaps-only
  for (const row of body.watchlist ?? []) {
    const slug = slugOf(row);
    const status = String(row?.status ?? "");
    if (!slug || !STATUSES.has(status) || deletedSlugs.has(slug)) continue;
    const titleId = idBySlug.get(slug);
    if (!titleId) {
      skipped++;
      continue;
    }
    const cloudTs = typeof row?.updatedAt === "number" ? row.updatedAt : Date.parse(String(row?.updatedAt ?? "")) || 0;
    if (tombstoneNewerThan("watchlist", slug, cloudTs || nowMs)) continue;
    const ex = (await db.watchlist.where("[userKey+titleId]").equals([user, titleId]).first()) as Record<string, unknown> | undefined;
    if (!ex) {
      await db.watchlist.add({ userKey: user, titleId, status, note: "", pinned: false, createdAt: now(), updatedAt: now() });
      listAdded++;
    } else if (cloudTs > tsOf(ex.updatedAt) + 500) {
      await db.watchlist.update(Number(ex.id), { status, updatedAt: now() });
      listUpdated++;
    }
  }

  // ratings — LWW by updated_at
  for (const row of body.ratings ?? []) {
    const slug = slugOf(row);
    const score = Number(row?.score);
    if (!slug || !Number.isFinite(score) || score < 1 || score > 10 || deletedSlugs.has(slug)) continue;
    const titleId = idBySlug.get(slug);
    if (!titleId) {
      skipped++;
      continue;
    }
    const cloudTs = typeof row?.updatedAt === "number" ? row.updatedAt : Date.parse(String(row?.updatedAt ?? "")) || 0;
    if (tombstoneNewerThan("rating", slug, cloudTs || nowMs)) continue;
    const ex = (await db.ratings.where("[userKey+titleId]").equals([user, titleId]).first()) as Record<string, unknown> | undefined;
    if (!ex) {
      await db.ratings.add({ userKey: user, titleId, score: Math.round(score), updatedAt: now() });
      ratingsAdded++;
    } else if (cloudTs > tsOf(ex.updatedAt) + 500) {
      await db.ratings.update(Number(ex.id), { score: Math.round(score), updatedAt: now() });
      ratingsAdded++;
    }
  }

  // collections (v0.29.0 VERIFY-DATA-16: matched by cloudId when the body
  // carries it; the stable uuid is stamped on the local row so pushes can
  // keep using it. renames arrive as deletion events above)
  for (const col of body.collections ?? []) {
    const name = String(col?.name ?? "").trim().slice(0, 60);
    if (!name || renamedFrom.has(name)) continue;
    const cid = typeof (col as { cid?: unknown })?.cid === "string" && /^[0-9a-f-]{36}$/i.test(String((col as { cid?: unknown }).cid)) ? String((col as { cid?: unknown }).cid) : "";
    let row = cid
      ? ((await db.ucollections.where("userKey").equals(user).filter((c) => (c as { cloudId?: unknown }).cloudId === cid).first()) as Record<string, unknown> | undefined)
      : undefined;
    if (!row) row = (await db.ucollections.where("[userKey+name]").equals([user, name]).first()) as Record<string, unknown> | undefined;
    if (!row) {
      const id = await db.ucollections.add({ userKey: user, name, createdAt: now(), updatedAt: now(), ...(cid ? { cloudId: cid } : {}) });
      row = { id } as Record<string, unknown>;
      collectionsAdded++;
    } else if (cid && !(row as { cloudId?: unknown }).cloudId) {
      await db.ucollections.update(Number(row.id), { cloudId: cid });
    }
    const colId = Number((row as { id: number }).id);
    for (const item of col?.items ?? []) {
      const slug = slugOf(item);
      if (!slug) continue;
      const titleId = idBySlug.get(slug);
      if (!titleId) {
        skipped++;
        continue;
      }
      const ex = await db.ucitems.where("[collectionId+titleId]").equals([colId, titleId]).count();
      if (!ex) {
        await db.ucitems.add({ collectionId: colId, titleId, addedAt: now() });
        collectionItemsAdded++;
      }
    }
  }

  // watch progress — NEWER WINS per (title, episode) with the SAME clock-skew
  // guard as the desktop merge (DATA-8); episodes resolved the stable way via
  // the (titleId, season, number) formula instead of the drifting id
  for (const row of body.progress ?? []) {
    const slug = slugOf(row);
    const position = Number(row?.position ?? 0);
    const duration = Number(row?.duration ?? 0);
    if (!slug || !Number.isFinite(position) || deletedSlugs.has(slug)) continue;
    if (tombstoneNewerThan("progress", slug, 0)) continue;
    const titleId = idBySlug.get(slug);
    if (!titleId) {
      skipped++;
      continue;
    }
    const season = Math.max(0, Math.round(Number(row?.season ?? 0)) || 0);
    const number = Math.max(0, Math.round(Number(row?.episode ?? 0)) || 0);
    const epId = season > 0 && number > 0 ? episodeId(titleId, season, number) : null;
    let incomingTs = typeof row?.updatedAt === "number" ? row.updatedAt : Date.parse(String(row?.updatedAt ?? "")) || 0;
    if (incomingTs > nowMs + SKEW_MS) incomingTs = nowMs; // wrong device clock
    const rows = (await db.progress.where("[userKey+titleId]").equals([user, titleId]).toArray()) as unknown as { id: number; episodeId: number | null; position: number; duration: number; updatedAt: string }[];
    const ex = rows.find((r) => (r.episodeId ?? null) === epId);
    if (!ex) {
      await db.progress.add({ userKey: user, titleId, episodeId: epId, position, duration, updatedAt: new Date(incomingTs || Date.now()).toISOString() });
      progressApplied++;
    } else {
      const exTs = tsOf(ex.updatedAt);
      const newer = incomingTs > exTs + 500;
      const closeCall = Math.abs(incomingTs - exTs) <= 2_000;
      const further = position > Number(ex.position) + 1;
      if (newer || (closeCall && further)) {
        await db.progress.put({ ...ex, position, duration, updatedAt: new Date(incomingTs || Date.now()).toISOString() });
        progressApplied++;
      }
    }
  }

  return { favoritesAdded, listAdded, listUpdated, ratingsAdded, collectionsAdded, collectionItemsAdded, progressApplied, deletionsApplied, skipped };
}
