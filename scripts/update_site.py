#!/usr/bin/env python3
"""Bake the latest release into docs/index.html (version + direct download links
+ file sizes). Runs in GitHub Actions (authenticated GITHUB_TOKEN -> no rate
limits) on every published release, plus a daily cron as backstop.
Idempotent: only rewrites when something actually changed."""
import json
import os
import re
import sys
import time
import urllib.request

REPO = os.environ.get("GITHUB_REPOSITORY", "pvwvuow/frame")
TOKEN = os.environ.get("GITHUB_TOKEN", "")
HTML = os.path.join(os.path.dirname(__file__), "..", "docs", "index.html")
MAP = {"dl-win": "win-x64-setup.exe", "dl-mac": "mac-arm64.dmg",
       "dl-linux": "linux-x86_64.AppImage", "dl-android": "android.apk"}
# CI uploads big assets right after publishing; wait until all 4 are present
TRIES, DELAY = 30, 30  # up to 15 minutes


def fetch_latest():
    req = urllib.request.Request(
        f"https://api.github.com/repos/{REPO}/releases/latest",
        headers={"Accept": "application/vnd.github+json",
                 "User-Agent": "frame-site-refresh",
                 **({"Authorization": f"Bearer {TOKEN}"} if TOKEN else {})})
    with urllib.request.urlopen(req) as r:
        return json.load(r)


rel = None
for attempt in range(1, TRIES + 1):
    rel = fetch_latest()
    names = [a["name"] for a in rel.get("assets", [])]
    missing = [s for s in MAP.values() if not any(s in n for n in names)]
    if not missing:
        break
    print(f"[{attempt}/{TRIES}] assets still uploading, missing suffixes: {missing}; retrying in {DELAY}s")
    time.sleep(DELAY)
else:
    sys.exit("!! gave up waiting for release assets — not touching the page")

tag = rel["tag_name"]
assets = rel["assets"]
html = open(HTML, encoding="utf-8").read()
orig = html

html = re.sub(r'(<b id="ver">)[^<]*(</b>)', rf'\g<1>{tag}\g<2>', html)
html = re.sub(r'("softwareVersion":\s*")[^"]*(")', rf'\g<1>{tag.lstrip("v")}\g<2>', html)

for el_id, suffix in MAP.items():
    asset = next(a for a in assets if suffix in a["name"])
    url = f"https://github.com/{REPO}/releases/download/{tag}/{asset['name']}"
    mb = round(asset["size"] / 1048576)
    html, n = re.subn(rf'(<a class="dl" id="{el_id}"[^>]*href=")[^"]*(")',
                      rf'\g<1>{url}\g<2>', html)
    if n != 1:
        sys.exit(f"!! href patch failed for {el_id}")
    block = re.search(rf'<a class="dl" id="{el_id}".*?</a>', html, re.S).group(0)

    def fix(m):
        label = re.sub(r"\s*·\s*~\d+MB\s*$", "", m.group(2))
        return m.group(1) + label + f" · ~{mb}MB" + m.group(3)

    new_block = re.sub(r'(<b>[^<]*</b><span>)([^<]*)(</span>)', fix, block, count=1)
    html = html.replace(block, new_block)
    print(f"  {el_id}: {asset['name']} (~{mb}MB)")

if html == orig:
    print(f"no changes — page already at {tag}")
    sys.exit(0)

open(HTML, "w", encoding="utf-8").write(html)
print(f"index.html updated to {tag}")
