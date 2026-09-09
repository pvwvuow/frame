"use client";

/* Single long-lived player instance, mounted from the root layout — outside
   every routed page — so the video element never unmounts and playback keeps
   running while the user browses (mini/floating mode).
   v0.15.0 — the Capacitor/mobile build (NAMA_MOBILE=1) mounts the touch-first
   PlayerMobile instead of the desktop theater; the desktop bundle is
   unchanged (IS_MOBILE is a compile-time constant, dead code is dropped). */
import Player from "@/components/Player";
import PlayerMobile from "@/components/mobile/PlayerMobile";
import { IS_MOBILE } from "@/lib/links";

export default function GlobalPlayer() {
  return IS_MOBILE ? <PlayerMobile /> : <Player />;
}
