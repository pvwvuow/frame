"use client";

/* Single long-lived player instance, mounted from the root layout — outside
   every routed page — so the video element never unmounts and playback keeps
   running while the user browses (mini/floating mode). */
import Player from "@/components/Player";

export default function GlobalPlayer() {
  return <Player />;
}
