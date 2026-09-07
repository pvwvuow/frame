import type { Metadata } from "next";
import DownloadsClient from "@/components/download/DownloadsClient";

export const metadata: Metadata = { title: "دانلودها | فریم" };

export default function DownloadsPage() {
  return <DownloadsClient />;
}
