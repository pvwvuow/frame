import { readFile } from "fs/promises";
import path from "path";

export const dynamic = "force-dynamic";

// Serves the AKRAN · اکران UI preview (single-file HTML) at "/"
// Source of truth: /home/z/my-project/download/akran-ui.html
// (re-read on every request so live edits show up on refresh)
export async function GET() {
  const html = await readFile(
    path.join(process.cwd(), "download", "akran-ui.html"),
    "utf-8"
  );
  return new Response(html, {
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}
