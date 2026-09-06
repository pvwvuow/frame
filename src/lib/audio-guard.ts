"use client";

/* v0.10.6 – audio guard: never start a movie the player cannot sound.
 *
 * Chromium (and therefore Electron) ships WITHOUT licensed decoders for
 * AC-3 / E-AC-3 / DTS / TrueHD. An MKV whose first audio track carries one
 * of those plays with picture but NO sound — the classic «گاهی صدا پخش
 * نمی‌شود» report. The local stream proxy reads the Matroska header
 * (Tracks element) and reports whether the first audio track is decodable.
 *
 * This helper probes the currently chosen source; if its audio cannot be
 * decoded it probes the remaining variants (hardsub > dub > sub-first
 * ordering preserved) and asks the caller to switch to the closest one that
 * WILL play, with a short Persian notice. One round of probing per video,
 * at most ~2.5MB per probed variant (header lives at the file head). */

import { isMkvUrl, probeUrl, subsUrl, type ProxyProbeResponse, type ProxySubsResponse } from "./video-url";

export interface SourceLike {
  q?: string;
  v?: string;
  url: string;
  mb?: number;
}

export interface AudioGuardResult {
  /** index to switch to, or null to keep the current source */
  switchedTo: number | null;
  /** Persian notice to show (why we switched / why nothing can play) */
  message: string | null;
}

const KEEP: AudioGuardResult = { switchedTo: null, message: null };

function variantScore(v?: string): number {
  const s = v || "";
  return s.includes("چسبیده") ? 3 : s.includes("دوبله") ? 2 : s.includes("زیرنویس") ? 1 : 0;
}

/** Header info for one source; falls back to the live /subs data. */
async function probeSource(url: string, proxyBase: string): Promise<ProxyProbeResponse | null> {
  const pUrl = probeUrl(url, proxyBase);
  const sUrl = subsUrl(url, proxyBase);
  const grab = async (u: string | null): Promise<ProxySubsResponse | ProxyProbeResponse | null> => {
    if (!u) return null;
    try {
      const r = await fetch(u, { cache: "no-store" });
      if (!r.ok) return null;
      return (await r.json()) as ProxySubsResponse | ProxyProbeResponse;
    } catch {
      return null;
    }
  };
  const [probe, subs] = await Promise.all([grab(pUrl), grab(sUrl)]);
  // merge: either side may already hold the Tracks info
  const merged: ProxyProbeResponse = {
    found: Boolean(probe?.found || subs?.found),
    cues: probe?.cues ?? subs?.cues ?? 0,
    probed: Boolean(probe?.probed || subs?.probed),
    kinds: probe?.kinds ?? subs?.kinds ?? [],
    audio: probe?.audio ?? subs?.audio ?? [],
    video: probe?.video ?? subs?.video ?? null,
    audioOk: probe?.audioOk ?? subs?.audioOk ?? null,
    audioLabel: probe?.audioLabel ?? subs?.audioLabel ?? null,
  };
  return merged.audio?.length || merged.probed ? merged : null;
}

/**
 * Check the chosen source; find a playable alternative when its first audio
 * track is undecodable (AC3/DTS/…). Only MKV-family sources are probed —
 * MP4 audio is effectively always AAC/MP3.
 */
export async function ensurePlayableAudio(list: SourceLike[], currentIdx: number, proxyBase: string | null | undefined): Promise<AudioGuardResult> {
  if (!proxyBase || !list.length) return KEEP;
  const idx = Math.min(Math.max(currentIdx, 0), list.length - 1);
  const current = list[idx];
  if (!current?.url) return KEEP;

  // header info may already exist from the ongoing playback pass
  const cur = await probeSource(current.url, proxyBase);
  if (!cur || cur.audioOk !== false) return KEEP;

  const label = cur.audioLabel || (cur.audio?.[0] ?? "ناشناخته");
  if (list.length <= 1) {
    return {
      switchedTo: null,
      message: `صدای این نسخه با فرمت ${label} است و در پخش‌کننده پشتیبانی نمی‌شود`,
    };
  }

  // probe every other variant in parallel, prefer hardsub/dub among playable
  const others = list.map((s, i) => ({ s, i })).filter(({ s, i }) => i !== idx && isMkvUrl(s.url));
  const probed = await Promise.all(
    others.map(async ({ s, i }) => ({ i, info: await probeSource(s.url, proxyBase) }))
  );
  const playable = probed
    .filter(({ info }) => info && info.audioOk !== false)
    .sort((a, b) => variantScore(list[b.i].v) - variantScore(list[a.i].v) || a.i - b.i);
  // variants we could not read at all (timeout etc.) stay unknown → skipped
  if (playable.length) {
    const to = playable[0].i;
    const s = list[to];
    return {
      switchedTo: to,
      message: `صدای این نسخه (${label}) قابل پخش نیست — نسخه ${s.q || ""} ${s.v || ""} جایگزین شد`.trim(),
    };
  }
  return {
    switchedTo: null,
    message: `صدای نسخه‌های این فایل با فرمت ${label} است و در پخش‌کننده پشتیبانی نمی‌شود`,
  };
}
