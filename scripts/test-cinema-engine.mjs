/* Cinema engine test — drives the REAL Supabase project exactly like
 * src/lib/cinema.ts does (table row + realtime broadcast + presence).
 * Two virtual users: HOST creates a room, GUEST joins by code.
 *   1. host insert → RLS (auth.uid() = host_id)
 *   2. guest select by code → RLS (authenticated read)
 *   3. both join channel cinema:<CODE> → presence sync → 2 members
 *   4. host broadcast "state" → guest receives beat
 *   5. host broadcast "closed" + row delete → guest notified
 * Exit code 0 = all checks passed. */
import { createClient } from "@supabase/supabase-js";

const URL = "https://emqsegjeiyimoyncbhfn.supabase.co";
const KEY = "sb_publishable_m23eUV8cC-xqhqD-3P6Wsg_U5WsiM3E";

const results = [];
const ok = (name, cond, extra = "") => {
  results.push({ name, ok: !!cond, extra });
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${extra ? "  — " + extra : ""}`);
};

const stamp = Date.now().toString(36).slice(-6);
const HOST_EMAIL = `cinema-host-${stamp}@frame-test.ir`;
const GUEST_EMAIL = `cinema-guest-${stamp}@frame-test.ir`;
const PASSWORD = "Frame#test-2026";

async function signUpAs(email) {
  const sb = createClient(URL, KEY);
  let r = await sb.auth.signUp({ email, password: PASSWORD });
  if (r.error && /already|registered|exists/i.test(r.error.message)) {
    r = await sb.auth.signInWithPassword({ email, password: PASSWORD });
  }
  if (r.error) throw new Error(`signup ${email}: ${r.error.message}`);
  if (!r.data.session) throw new Error(`signup ${email}: NO SESSION (email confirm is ON?)`);
  return sb;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* wait until predicate true or timeout — polled every 150ms */
async function waitFor(name, fn, timeout = 8000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) {
    if (fn()) return true;
    await sleep(150);
  }
  console.log(`  (timeout waiting for ${name})`);
  return false;
}

const host = await signUpAs(HOST_EMAIL);
const guest = await signUpAs(GUEST_EMAIL);
const hostUid = host.auth.getUser().data?.user?.id ?? (await host.auth.getUser()).data.user.id;
const guestUid = guest.auth.getUser().data?.user?.id ?? (await guest.auth.getUser()).data.user.id;
console.log("host uid:", hostUid, " guest uid:", guestUid);

const CODE = "T" + stamp.toUpperCase().replace(/[^A-Z0-9]/g, "").padEnd(5, "X");
console.log("room code:", CODE);

/* ---------- 1. host creates the room row (mirrors hostCreate) ---------- */
const beat = {
  slug: "test-cinema-slug", title: "تست سینما", poster: "/covers/x/poster.jpg",
  kind: "movie", season: 0, epnum: 0, position: 12.5, duration: 5400, is_playing: true,
};
const ins = await host.from("cinema_rooms").insert({ code: CODE, host_id: hostUid, host_name: "میزبانِ تست", ...beat }).select("*").single();
ok("host: INSERT room row (RLS)", !ins.error && !!ins.data, ins.error?.message ?? "");
const roomId = ins.data?.id;

/* guest must NOT be able to insert/update/delete rooms it doesn't own:
   RLS only lets a room through when host_id = the caller's own uid, so a
   row CLAIMING the HOST's identity must be rejected */
const badIns = await guest.from("cinema_rooms").insert({ code: "FAKE01", host_id: hostUid, host_name: "x", slug: "s", title: "t", poster: "", kind: "movie", season: 0, epnum: 0, position: 0, duration: 0, is_playing: false }).select("id");
ok("guest: INSERT claiming another host → RLS rejects", !!badIns.error, badIns.error?.message ?? "");
/* PostgREST applies RLS silently on UPDATE/DELETE: the statement "succeeds"
   but touches ZERO rows. The real proof is that the row survives unchanged. */
const badUpd = await guest.from("cinema_rooms").update({ position: 999 }).eq("id", roomId).select("id");
ok("guest: UPDATE touches 0 rows (RLS)", !badUpd.error && (badUpd.data?.length ?? 1) === 0, badUpd.error?.message ?? JSON.stringify(badUpd.data));
const badDel = await guest.from("cinema_rooms").delete().eq("id", roomId).select("id");
ok("guest: DELETE touches 0 rows (RLS)", !badDel.error && (badDel.data?.length ?? 1) === 0, badDel.error?.message ?? JSON.stringify(badDel.data));
const still = await host.from("cinema_rooms").select("position").eq("id", roomId).single();
ok("room row intact after guest tampering", !still.error && still.data?.position === 12.5, `position=${still.data?.position}`);

/* ---------- 2. guest finds the room by code ---------- */
const q = await guest.from("cinema_rooms").select("*").eq("code", CODE).maybeSingle();
ok("guest: SELECT room by code", !q.error && q.data?.id === roomId, q.error?.message ?? "");

/* bogus code must come back empty, not error */
const q404 = await guest.from("cinema_rooms").select("*").eq("code", "ZZZZZZ").maybeSingle();
ok("guest: bogus code → null row", !q404.error && q404.data === null);

/* ---------- 3. realtime channel + presence ---------- */
let hostMembers = [];
let guestMembers = [];
let guestBeat = null;
let guestClosed = 0;
let guestReady = false;
let hostReady = false;

const chH = host.channel(`cinema:${CODE}`, { config: { presence: { key: hostUid }, broadcast: { self: false } } });
chH.on("presence", { event: "sync" }, () => {
  hostMembers = Object.values(chH.presenceState()).flat().map((p) => p.uid);
});
chH.subscribe(async (ev) => {
  if (ev === "SUBSCRIBED") {
    void chH.track({ uid: hostUid, name: "میزبانِ تست" });
    hostReady = true;
  }
});

const chG = guest.channel(`cinema:${CODE}`, { config: { presence: { key: guestUid }, broadcast: { self: false } } });
chG.on("presence", { event: "sync" }, () => {
  guestMembers = Object.values(chG.presenceState()).flat().map((p) => p.uid);
});
chG.on("broadcast", { event: "state" }, ({ payload }) => { guestBeat = payload; });
chG.on("broadcast", { event: "closed" }, () => { guestClosed++; });
chG.subscribe(async (ev) => {
  if (ev === "SUBSCRIBED") {
    void chG.track({ uid: guestUid, name: "مهمانِ تست" });
    guestReady = true;
  }
});

await waitFor("host subscribed", () => hostReady);
await waitFor("guest subscribed", () => guestReady);
await waitFor("presence on both sides", () => hostMembers.length === 2 && guestMembers.length === 2);
ok("presence: host sees 2 members", hostMembers.length === 2, hostMembers.join(","));
ok("presence: guest sees 2 members", guestMembers.length === 2, guestMembers.join(","));

/* ---------- 4. host beat broadcast (play/pause/seek wire format) ---------- */
const beat2 = { ...beat, position: 42.7, isPlaying: false };
chH.send({ type: "broadcast", event: "state", payload: beat2 });
await waitFor("guest receives state beat", () => !!guestBeat);
ok("broadcast: guest got host beat", !!guestBeat && guestBeat.position === 42.7 && guestBeat.isPlaying === false,
   guestBeat ? `pos=${guestBeat.position} playing=${guestBeat.isPlaying}` : "nothing");

/* ---------- 5. host closes → closed broadcast + row delete ---------- */
chH.send({ type: "broadcast", event: "closed", payload: {} });
await host.from("cinema_rooms").delete().eq("id", roomId).eq("host_id", hostUid);
await waitFor("guest got closed event", () => guestClosed > 0);
ok("broadcast: guest notified of close", guestClosed > 0);
const after = await guest.from("cinema_rooms").select("id").eq("code", CODE).maybeSingle();
ok("host close: row deleted", after.data === null);

/* ---------- cleanup: unsub + remove test junk rows ---------- */
void chH.unsubscribe();
void chG.unsubscribe();
await host.from("cinema_rooms").delete().eq("host_id", hostUid);
await host.from("cinema_rooms").delete().eq("code", "FAKE01");

const fails = results.filter((r) => !r.ok);
console.log(`\n${results.length - fails.length}/${results.length} checks passed`);
process.exit(fails.length ? 1 : 0);
