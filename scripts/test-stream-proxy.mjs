/* Regression tests for the local stream proxy + MKV subtitle scanner.
 *
 * Builds synthetic Matroska files (video+audio+text tracks), serves them from
 * a local dummy upstream with Range support, then drives the real proxy:
 *   1. full pass  → byte-identical passthrough + 2 cues extracted (SRT)
 *   2. /subs      → VTT contains the Persian lines with VTT timestamps
 *   3. mid-file Range pass (no Tracks in sight) → shared trackNumber still
 *      recognises the subtitle block
 *   4. chunked feeding in odd sizes → parser survives chunk boundaries
 *   5. laced subtitle block → safely ignored
 *   6. v0.10.6: ASS/SSA extraction (bare fields + full Dialogue line),
 *      override-tag stripping, explicit end timing
 *   7. v0.10.6: audio codec capture → audioOk=false for DTS/AC3, true for AAC
 *   8. v0.10.6: /probe endpoint reports tracks without touching playback
 *   9. v0.10.6: UTF8 preferred over ASS when both exist; bitmap-only → found=false
 *
 * Run: node scripts/test-stream-proxy.mjs
 */
import { createRequire } from "node:module";
import http from "node:http";

const require = createRequire(import.meta.url);
const { startStreamProxy, MkvScanner, SubStore, StoreCache, assFrameToCue, isAudioCodecSupported } = require("../electron/stream-proxy.cjs");

let passed = 0;
let failed = 0;
function check(name, cond, extra = "") {
  if (cond) {
    passed++;
    console.log(`  ok  ${name}`);
  } else {
    failed++;
    console.error(`FAIL  ${name} ${extra}`);
  }
}

/* ---------------------------------------------------------------- EBML */
function vint(val) {
  // EBML data-size vint: the length-marker bit is ALWAYS set (0x7f | 0x80 …)
  if (val < 0x7f) return Buffer.from([val | 0x80]);
  if (val < 0x3fff) {
    const v = val | 0x4000;
    return Buffer.from([(v >> 8) & 0xff, v & 0xff]);
  }
  if (val < 0x1fffff) {
    const v = val | 0x200000;
    return Buffer.from([(v >> 16) & 0xff, (v >> 8) & 0xff, v & 0xff]);
  }
  throw new Error("test sizes must stay below 2MB");
}
function el(id, payload) {
  const idBytes = id > 0xffffff ? 4 : id > 0xffff ? 3 : id > 0xff ? 2 : 1;
  const idBuf = Buffer.alloc(idBytes);
  for (let i = 0; i < idBytes; i++) idBuf[i] = (id >>> (8 * (idBytes - 1 - i))) & 0xff;
  return Buffer.concat([idBuf, vint(payload.length), payload]);
}
const uint16 = (n) => Buffer.from([(n >> 8) & 0xff, n & 0xff]);
const uint32 = (n) => Buffer.from([(n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff]);

function trackEntry(trackNo, type, codec, lang) {
  // TrackNumber = plain big-endian integer (what real muxers write)
  return el(0xae, Buffer.concat([
    el(0xd7, Buffer.from([trackNo])),
    el(0x83, Buffer.from([type])),
    el(0x86, Buffer.from(codec, "ascii")),
    lang ? el(0x22b59c, Buffer.from(lang, "ascii")) : Buffer.alloc(0),
  ]));
}
function simpleBlock(trackNo, relTc, flags, text) {
  // block track field = marker-inclusive vint (0x81/0x82/0x83 …)
  return el(0xa3, Buffer.concat([
    Buffer.from([trackNo < 0x7f ? trackNo | 0x80 : trackNo]),
    uint16(relTc),
    Buffer.from([flags]),
    Buffer.from(text, "utf8"),
  ]));
}

const SRT1 = "1\n00:00:01,000 --> 00:00:03,000\nسلام دنیا\n";
const SRT2 = "2\n00:00:05,200 --> 00:00:08,500\nخط دوم زیرنویس\n";

const cluster1 = el(0x1f43b675, Buffer.concat([
  el(0xe7, uint16(0)),
  simpleBlock(1, 0, 0x80, Buffer.alloc(64, 1)), // video keyframe
  simpleBlock(3, 1000, 0x00, SRT1), // subtitle @1s
]));
const cluster2 = el(0x1f43b675, Buffer.concat([
  el(0xe7, uint16(5000)),
  simpleBlock(1, 100, 0x00, Buffer.alloc(64, 2)), // video
  simpleBlock(3, 200, 0x00, SRT2), // subtitle @5.2s
  simpleBlock(3, 400, 0x06, "laced should be ignored"), // lacing=3 → skip
]));

const mkv = Buffer.concat([
  el(0x1a45dfa3, el(0x4282, Buffer.from("matroska", "ascii"))),
  el(0x18538067, Buffer.concat([
    el(0x1549a966, el(0x2ad7b1, uint32(1000000))), // Info: TimecodeScale
    el(0x1654ae6b, Buffer.concat([
      trackEntry(1, 1, "V_MPEG4/ISO/AVC"),
      trackEntry(2, 2, "A_AAC"),
      trackEntry(3, 0x11, "S_TEXT/UTF8"),
    ])),
    cluster1,
    cluster2,
  ])),
]);
const CLUSTER2_OFFSET = mkv.indexOf(Buffer.from([0x1f, 0x43, 0xb6, 0x75]), 60);

/* ------------------------------------------------- v0.10.6 fixtures ---- */
const ASS1 = "0,0:00:02.00,0:00:04.50,Def,,0,0,0,,سلام دوباره"; // bare Dialogue fields (Matroska convention)
const ASS2 = "Dialogue: 0,0:00:06.00,0:00:07.50,Def,,0,0,0,,{\\i1}خط دوم{\\i0}"; // full line + override tags
const assCluster1 = el(0x1f43b675, Buffer.concat([
  el(0xe7, uint16(0)),
  simpleBlock(1, 0, 0x80, Buffer.alloc(64, 1)),
  simpleBlock(3, 2000, 0x00, ASS1), // @2s
]));
const assCluster2 = el(0x1f43b675, Buffer.concat([
  el(0xe7, uint16(5000)),
  simpleBlock(3, 1000, 0x00, ASS2), // @6s
]));
/** video + DTS audio + ASS subtitle */
const assMkv = Buffer.concat([
  el(0x1a45dfa3, el(0x4282, Buffer.from("matroska", "ascii"))),
  el(0x18538067, Buffer.concat([
    el(0x1549a966, el(0x2ad7b1, uint32(1000000))),
    el(0x1654ae6b, Buffer.concat([
      trackEntry(1, 1, "V_MPEG4/ISO/AVC"),
      trackEntry(2, 2, "A_DTS"),
      trackEntry(3, 0x11, "S_TEXT/ASS"),
    ])),
    assCluster1,
    assCluster2,
  ])),
]);
/** video + AC3 audio + PGS bitmap subtitle (no renderable text) */
const bitmapMkv = Buffer.concat([
  el(0x1a45dfa3, el(0x4282, Buffer.from("matroska", "ascii"))),
  el(0x18538067, Buffer.concat([
    el(0x1654ae6b, Buffer.concat([
      trackEntry(1, 1, "V_MPEG4/ISO/AVC"),
      trackEntry(2, 2, "A_AC3"),
      trackEntry(3, 0x11, "S_HDMV/PGS"),
    ])),
    el(0x1f43b675, Buffer.concat([el(0xe7, uint16(0)), simpleBlock(1, 0, 0x80, Buffer.alloc(32, 3))])),
  ])),
]);
/** video + AAC audio + BOTH UTF8 and ASS subtitle tracks → UTF8 wins */
const dualMkv = Buffer.concat([
  el(0x1a45dfa3, el(0x4282, Buffer.from("matroska", "ascii"))),
  el(0x18538067, Buffer.concat([
    el(0x1654ae6b, Buffer.concat([
      trackEntry(1, 1, "V_MPEG4/ISO/AVC"),
      trackEntry(2, 2, "A_AAC"),
      trackEntry(3, 0x11, "S_TEXT/ASS"),
      trackEntry(4, 0x11, "S_TEXT/UTF8"),
    ])),
    el(0x1f43b675, Buffer.concat([
      el(0xe7, uint16(0)),
      simpleBlock(4, 1000, 0x00, "3\n00:00:01,000 --> 00:00:02,000\nاز ترک SRT\n"),
      simpleBlock(3, 2000, 0x00, ASS1),
    ])),
  ])),
]);

/** v0.10.8: eng SRT muxed FIRST, fas SRT SECOND → the PERSIAN track must win
 *  (the old extractor followed the first UTF8 track and showed English) */
const faSecondMkv = Buffer.concat([
  el(0x1a45dfa3, el(0x4282, Buffer.from("matroska", "ascii"))),
  el(0x18538067, Buffer.concat([
    el(0x1654ae6b, Buffer.concat([
      trackEntry(1, 1, "V_MPEG4/ISO/AVC"),
      trackEntry(2, 2, "A_AAC"),
      trackEntry(3, 0x11, "S_TEXT/UTF8", "eng"),
      trackEntry(4, 0x11, "S_TEXT/UTF8", "fas"),
    ])),
    el(0x1f43b675, Buffer.concat([
      el(0xe7, uint16(0)),
      simpleBlock(3, 1000, 0x00, "1\n00:00:01,000 --> 00:00:02,000\nenglish line\n"),
      simpleBlock(4, 2000, 0x00, "1\n00:00:02,000 --> 00:00:03,000\nخط فارسی برنده\n"),
    ])),
  ])),
]);

/** dummy upstream that serves one of the fixtures with Range support */
function serveFixture(buffer, contentType = "video/x-matroska") {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const range = req.headers.range;
      if (range) {
        const m = /^bytes=(\d+)-/.exec(range);
        const start = m ? Number(m[1]) : 0;
        const slice = buffer.subarray(start);
        res.writeHead(206, {
          "content-type": contentType,
          "content-length": String(slice.length),
          "content-range": `bytes ${start}-${buffer.length - 1}/${buffer.length}`,
          "accept-ranges": "bytes",
        });
        res.end(slice);
        return;
      }
      res.writeHead(200, { "content-type": contentType, "content-length": String(buffer.length), "accept-ranges": "bytes" });
      res.end(buffer);
    });
    server.listen(0, "127.0.0.1", () => resolve({ server, url: `http://127.0.0.1:${server.address().port}/movie.mkv` }));
  });
}

/* ------------------------------------------------------- dummy upstream */
async function withUpstream(fn) {
  const server = http.createServer((req, res) => {
    const range = req.headers.range;
    if (range) {
      const m = /^bytes=(\d+)-/.exec(range);
      const start = m ? Number(m[1]) : 0;
      const slice = mkv.subarray(start);
      res.writeHead(206, {
        "content-type": "video/x-matroska",
        "content-length": String(slice.length),
        "content-range": `bytes ${start}-${mkv.length - 1}/${mkv.length}`,
        "accept-ranges": "bytes",
      });
      res.end(slice);
      return;
    }
    res.writeHead(200, { "content-type": "video/x-matroska", "content-length": String(mkv.length), "accept-ranges": "bytes" });
    res.end(mkv);
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  try {
    await fn(`http://127.0.0.1:${server.address().port}/movie.mkv`);
  } finally {
    server.close();
  }
}

async function getJson(url) {
  const r = await fetch(url);
  return { status: r.status, body: await r.json() };
}

/* ---------------------------------------------------------------- tests */
const logStub = { info: () => {}, warn: () => {}, error: () => {} };

await withUpstream(async (upstreamUrl) => {
  const proxy = await startStreamProxy(logStub);
  const base = proxy.base;
  const streamUrl = `${base}/stream?u=${encodeURIComponent(upstreamUrl)}`;
  const subsUrl = `${base}/subs?u=${encodeURIComponent(upstreamUrl)}`;

  // 1) full passthrough
  const r1 = await fetch(streamUrl);
  const buf1 = Buffer.from(await r1.arrayBuffer());
  check("stream: 200", r1.status === 200);
  check("stream: byte-identical passthrough", buf1.equals(mkv), `${buf1.length} vs ${mkv.length}`);
  check("stream: content-type forwarded", (r1.headers.get("content-type") || "").includes("matroska"));

  // 2) subs after a full pass
  await new Promise((r) => setTimeout(r, 150));
  const s1 = await getJson(subsUrl);
  check("subs: found srt track", s1.body.found === true);
  check("subs: 2 cues extracted", s1.body.cues === 2, `got ${s1.body.cues}`);
  check("subs: vtt header", s1.body.vtt?.startsWith("WEBVTT"));
  check("subs: persian line 1", s1.body.vtt?.includes("سلام دنیا"));
  check("subs: persian line 2", s1.body.vtt?.includes("خط دوم زیرنویس"));
  check("subs: vtt timestamp", s1.body.vtt?.includes("00:00:01.000 --> "));
  check("subs: laced block ignored", !s1.body.vtt?.includes("laced"));

  // 3) mid-file range pass (seek) – shared trackNumber must find cue 2
  const r3 = await fetch(streamUrl, { headers: { range: `bytes=${CLUSTER2_OFFSET}-` } });
  check("range: 206", r3.status === 206);
  const buf3 = Buffer.from(await r3.arrayBuffer());
  check("range: correct slice", buf3.equals(mkv.subarray(CLUSTER2_OFFSET)));
  await new Promise((r) => setTimeout(r, 150));
  const s3 = await getJson(subsUrl);
  check("range: cue 2 extracted on seek pass", s3.body.cues >= 2, `got ${s3.body.cues}`);
  check("range: vtt still has both lines", s3.body.vtt?.includes("خط دوم زیرنویس"));

  // 4) scanner fed in odd chunk sizes (boundary straddles)
  const store = new SubStore("chunked");
  const sc = new MkvScanner(store);
  for (let i = 0; i < mkv.length; i += 7) sc.feed(mkv.subarray(i, i + 7));
  sc.end();
  check("chunked feed: cues found", store.cues.size === 2, `got ${store.cues.size}`);
  check("chunked feed: track found", store.found === true);

  // 5) no-subs file → found=false, zero cues
  const store2 = new SubStore("nosubs");
  const sc2 = new MkvScanner(store2);
  const noSubMkv = Buffer.concat([
    el(0x1a45dfa3, el(0x4282, Buffer.from("matroska", "ascii"))),
    el(0x18538067, Buffer.concat([
      el(0x1654ae6b, trackEntry(1, 1, "V_MPEG4/ISO/AVC")),
      el(0x1f43b675, Buffer.concat([el(0xe7, uint16(0)), simpleBlock(1, 0, 0x80, Buffer.alloc(32, 9))])),
    ])),
  ]);
  sc2.feed(noSubMkv);
  sc2.end();
  check("no-subs: found=false", store2.found === false && store2.cues.size === 0);

  // 6) garbage input → scanner stays alive, no throw
  const store3 = new SubStore("garbage");
  const sc3 = new MkvScanner(store3);
  sc3.feed(Buffer.alloc(4096, 0x5a));
  sc3.feed(Buffer.from([0x1f, 0x43, 0xb6, 0x75, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]));
  sc3.end();
  check("garbage: no crash", store3.cues.size === 0);

  // 7) security: /stream rejects non-http urls and remote peers are impossible (loopback bind)
  const bad = await fetch(`${base}/stream?u=${encodeURIComponent("file:///etc/passwd")}`);
  check("security: file:// rejected", bad.status === 400);

  /* -------------------------------------------- v0.10.6: new subsystems -- */

  // 8) ASS/SSA extraction via the real proxy (DTS audio → audioOk=false)
  const ass = await serveFixture(assMkv);
  try {
    const assStream = `${base}/stream?u=${encodeURIComponent(ass.url)}`;
    const assSubs = `${base}/subs?u=${encodeURIComponent(ass.url)}`;
    const ra = await fetch(assStream);
    await ra.arrayBuffer();
    await new Promise((r) => setTimeout(r, 150));
    const sa = await getJson(assSubs);
    check("ass: found text track", sa.body.found === true);
    check("ass: 2 cues extracted", sa.body.cues === 2, `got ${sa.body.cues}`);
    check("ass: bare-fields line", sa.body.vtt?.includes("سلام دوباره"));
    check("ass: override tags stripped", sa.body.vtt?.includes("خط دوم") && !sa.body.vtt?.includes("\\i1"));
    check("ass: explicit end 4.5s", sa.body.vtt?.includes("00:00:02.000 --> 00:00:04.500"));
    check("ass: kinds recorded", (sa.body.kinds || []).includes("S_TEXT/ASS"));
    check("ass: DTS detected", sa.body.audio?.[0] === "A_DTS");
    check("ass: audioOk=false for DTS", sa.body.audioOk === false);
    check("ass: audioLabel", sa.body.audioLabel === "DTS");
    check("ass: video codec captured", sa.body.video === "V_MPEG4/ISO/AVC");
  } finally {
    ass.server.close();
  }

  // 9) /probe endpoint – header intelligence with a ranged fetch only
  const bit = await serveFixture(bitmapMkv);
  try {
    const probe = await getJson(`${base}/probe?u=${encodeURIComponent(bit.url)}`);
    check("probe: probed=true", probe.body.probed === true);
    check("probe: AC3 detected", probe.body.audio?.[0] === "A_AC3");
    check("probe: audioOk=false for AC3", probe.body.audioOk === false);
    check("probe: AC3 label", probe.body.audioLabel === "AC3 (Dolby Digital)");
    check("probe: bitmap kind listed", (probe.body.kinds || []).includes("S_HDMV/PGS"));
    check("probe: no text track", probe.body.found === false);
    // /subs mirrors the header info gathered by the probe
    const s2 = await getJson(`${base}/subs?u=${encodeURIComponent(bit.url)}`);
    check("probe→subs: audioOk mirrored", s2.body.audioOk === false && s2.body.probed === true);
  } finally {
    bit.server.close();
  }

  // 10) dual UTF8+ASS → UTF8 preferred; AAC → audioOk=true
  const dual = await serveFixture(dualMkv);
  try {
    const store4 = new SubStore("dual");
    const sc4 = new MkvScanner(store4);
    sc4.feed(dualMkv);
    sc4.end();
    check("dual: found=true", store4.found === true);
    check("dual: utf8 preferred", store4.textTracks.get(store4.trackNumber)?.codec === "utf8");
    check("dual: srt cue text", [...store4.cues.values()].some((c) => c.t.includes("از ترک SRT")));
    check("dual: ass cue not merged", ![...store4.cues.values()].some((c) => c.t.includes("سلام دوباره")));
    check("dual: AAC audioOk=true", store4.audioOk() === true);
    const probe = await getJson(`${base}/probe?u=${encodeURIComponent(dual.url)}`);
    check("dual: probe audioOk=true", probe.body.audioOk === true);
  } finally {
    dual.server.close();
  }

  // 11) v0.10.8: eng-first + fas-second → the Persian track must be followed
  const faSecond = new SubStore("fa-second");
  const sc5 = new MkvScanner(faSecond);
  sc5.feed(faSecondMkv);
  sc5.end();
  check("fa-pref: found=true", faSecond.found === true);
  check("fa-pref: persian track picked", faSecond.textTracks.get(faSecond.trackNumber)?.lang === "fas", JSON.stringify([...faSecond.textTracks.values()]));
  check("fa-pref: persian cue extracted", [...faSecond.cues.values()].some((c) => c.t.includes("خط فارسی برنده")));
  check("fa-pref: english cue NOT merged", ![...faSecond.cues.values()].some((c) => c.t.includes("english line")));

  // 12) codec support table
  check("codec: A_AAC ok", isAudioCodecSupported("A_AAC") === true);
  check("codec: A_MP3 ok", isAudioCodecSupported("A_MPEG/L3") === true);
  check("codec: A_OPUS ok", isAudioCodecSupported("A_OPUS") === true);
  check("codec: A_FLAC ok", isAudioCodecSupported("A_FLAC") === true);
  check("codec: A_DTS no", isAudioCodecSupported("A_DTS") === false);
  check("codec: A_DTSHD no", isAudioCodecSupported("A_DTS/HD") === false);
  check("codec: A_TRUEHD no", isAudioCodecSupported("A_TRUEHD") === false);
  check("codec: A_EAC3 no", isAudioCodecSupported("A_EAC3") === false);
  check("codec: assFrameToCue timing", JSON.stringify(assFrameToCue(Buffer.from(ASS1, "utf8"))) === JSON.stringify({ start: 2000, end: 4500, text: "سلام دوباره" }));

  proxy.close();
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
});
