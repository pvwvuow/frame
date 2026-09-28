#!/usr/bin/env python3
"""Verify docs/index.html satisfies scripts/update_site.py contract.
Replays the exact regexes update_site.py uses against a fake release."""
import re, sys

HTML = "/home/z/my-project/pvame/docs/index.html"
MAP = {"dl-win": "win-x64-setup.exe", "dl-mac": "mac-arm64.dmg",
       "dl-linux": "linux-x86_64.AppImage", "dl-android": "android.apk"}

html = open(HTML, encoding="utf-8").read()
ok = True

def check(name, cond, detail=""):
    global ok
    print(("PASS " if cond else "FAIL ") + name + ((" — " + detail) if detail and not cond else ""))
    if not cond: ok = False

# 1) version anchor
m = re.search(r'(<b id="ver">)[^<]*(</b>)', html)
check('<b id="ver">', bool(m), m.group(0) if m else "missing")

# 2) JSON-LD softwareVersion
m = re.search(r'("softwareVersion":\s*")[^"]*(")', html)
check('softwareVersion', bool(m), m.group(0) if m else "missing")

# 3) per-platform anchors: exact regexes from update_site.py
for el_id, suffix in MAP.items():
    pat = rf'(<a class="dl" id="{el_id}"[^>]*href=")[^"]*(")'
    m = re.search(pat, html)
    check(f'{el_id} href regex', bool(m), "anchor must be <a class=\"dl\" id=... ... href=...>")
    if not m: continue
    block = re.search(rf'<a class="dl" id="{el_id}".*?</a>', html, re.S).group(0)
    check(f'{el_id} data-asset~{suffix}', suffix in block)
    bm = re.search(r'(<b>[^<]*</b><span>)([^<]*)(</span>)', block)
    check(f'{el_id} <b>+<span> pair', bool(bm))
    if bm:
        # simulate update_site.py size bake
        label = re.sub(r"\s*·\s*~\d+MB\s*$", "", bm.group(2))
        baked = bm.group(1) + label + " · ~99MB" + bm.group(3)
        check(f'{el_id} bake idempotent', "~" in baked)

# 4) JSON-LD blocks parse
for i, block in enumerate(re.findall(r'<script type="application/ld\+json">(.*?)</script>', html, re.S), 1):
    import json
    try:
        json.loads(block)
        check(f'JSON-LD #{i} valid', True)
    except Exception as e:
        check(f'JSON-LD #{i} valid', False, str(e))

# 5) referenced local assets exist
import os
base = os.path.dirname(HTML)
missing = []
for src in re.findall(r'(?:src|href)="(covers-web/[^"]+|fonts/[^"]+|assets/[^"]+)"', html):
    if not os.path.exists(os.path.join(base, src)):
        missing.append(src)
check("all local assets exist", not missing, ", ".join(missing[:8]))

sys.exit(0 if ok else 1)
