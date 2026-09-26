#!/usr/bin/env python3
"""Generate docs/browse.json — a compact, top-rated slice of the catalog for the
landing page's live browse grid (search + filters + posters).

Source: public/catalog/mobile/lite-*.json (28 shards, ~19.6k titles).
Output: docs/browse.json  (~1.6k titles, slim fields, sorted by rating desc)
        docs/covers coverage is verified per-title (covers-web/<tt3>/<tt>.webp).

Fields per title (compact keys to keep the payload small):
  i = imdb id (tt…)   t = fa title      e = en title   y = year
  r = imdb rating     g = fa genres[]   q = quality    p = movie|series

Idempotent + deterministic: same shards -> same bytes (stable sort, stable ties).
"""
import glob
import json
import os
import re

ROOT = os.path.join(os.path.dirname(__file__), "..")
SRC = os.path.join(ROOT, "public", "catalog", "mobile", "lite-*.json")
OUT = os.path.join(ROOT, "docs", "browse.json")

TT_RE = re.compile(r"tt\d+")
MAX_MOVIES = 1000
MAX_SERIES = 600

titles = {}
for path in sorted(glob.glob(SRC)):
    with open(path, encoding="utf-8") as fh:
        for t in json.load(fh):
            m = TT_RE.search(t.get("poster") or "")
            rating = t.get("rating")
            if not m or not rating or rating <= 0:
                continue
            tt = m.group(0)
            if tt in titles:
                continue
            titles[tt] = {
                "i": tt,
                "t": (t.get("title") or "").strip(),
                "e": (t.get("titleEn") or "").strip(),
                "y": t.get("year") or 0,
                "r": rating,
                "g": (t.get("genres") or [])[:3],
                "q": t.get("quality") or "",
                "p": t.get("type") or "movie",
            }

movies = sorted(
    (v for v in titles.values() if v["p"] == "movie"),
    key=lambda v: (-v["r"], v["i"]))[:MAX_MOVIES]
series = sorted(
    (v for v in titles.values() if v["p"] == "series"),
    key=lambda v: (-v["r"], v["i"]))[:MAX_SERIES]

slice_ = movies + series
# deterministic final order: rating desc (client re-sorts as needed)
slice_.sort(key=lambda v: (-v["r"], v["i"]))

payload = {
    "generatedFrom": "public/catalog/mobile",
    "counts": {"movies": len(movies), "series": len(series), "total": len(slice_)},
    "titles": slice_,
}
os.makedirs(os.path.dirname(OUT), exist_ok=True)
with open(OUT, "w", encoding="utf-8") as fh:
    json.dump(payload, fh, ensure_ascii=False, separators=(",", ":"))

print(f"movies={len(movies)} series={len(series)} total={len(slice_)}")
print(f"wrote {OUT} ({os.path.getsize(OUT)//1024}KB)")
