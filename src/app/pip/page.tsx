import type { Metadata } from "next";
import PipClient from "@/components/PipClient";

export const metadata: Metadata = {
  title: "پخش شناور",
  robots: { index: false, follow: false },
};

/* Route loaded INSIDE the desktop floating player window (electron/pip.cjs).
 * All playback state arrives over IPC (nama.pip.getState / onState). */
export default function PipPage() {
  return <PipClient />;
}
