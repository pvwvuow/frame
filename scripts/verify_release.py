#!/usr/bin/env python3
"""Release guard — assert that a published release actually carries every
Electron/desktop artifact the update channel and the landing page expect.

Why this exists
---------------
The desktop build lives in the PRIVATE repo (pvwvuow/pvame) and uploads into
THIS public repo (pvwvuow/frame). Two very different failures look identical
from the outside ("the new version is out but the app says there is no
update"):

  1. The release pipeline died in the `Detect version / create tag` job, so
     NO Electron job ever started (this exact thing happened on 2026-09-25,
     run #93 — the tag/release was never produced for that commit).
  2. The release was published, but one platform artifact never finished
     uploading (electron-builder 5xx / 422 retry exhaustion). The release
     still looks "done" in the GitHub UI.

Both are silent. This script makes them loud: it fails the workflow run and
opens (or updates) a single tracking issue listing exactly what is missing.

Env:
  GITHUB_TOKEN / GH_TOKEN   token with contents:read (+ issues:write to report)
  GITHUB_REPOSITORY         owner/repo, defaults to pvwvuow/frame
  GUARD_TAG                 tag to verify (default: the latest release)
  REPORT_ISSUE              "1" to open/update an issue on failure
"""

from __future__ import annotations

import json
import os
import sys
import urllib.error
import urllib.request

REPO = os.environ.get("GITHUB_REPOSITORY", "pvwvuow/frame")
TOKEN = os.environ.get("GITHUB_TOKEN") or os.environ.get("GH_TOKEN", "")
API = "https://api.github.com"
MB = 1024 * 1024

# (substring that must appear in an asset name, human label, minimum bytes)
# Minimums are deliberately far below the real sizes so they only catch
# truncated / empty uploads, never a legitimately smaller build.
REQUIRED = [
    ("win-x64-setup.exe", "Windows installer (NSIS)", 40 * MB),
    ("win-x64-portable.exe", "Windows portable", 40 * MB),
    ("mac-arm64.dmg", "macOS Apple Silicon dmg", 40 * MB),
    ("mac-x64.dmg", "macOS Intel dmg", 40 * MB),
    ("mac-arm64.zip", "macOS arm64 zip (auto-update target)", 40 * MB),
    ("linux-x86_64.AppImage", "Linux AppImage", 40 * MB),
    ("linux-amd64.deb", "Linux .deb", 40 * MB),
    ("android.apk", "Android APK", 10 * MB),
]

# electron-updater metadata: tiny files, but if one is missing the whole
# platform silently stops auto-updating.
META = [
    ("latest.yml", "electron-updater channel: Windows", 80),
    ("latest-mac.yml", "electron-updater channel: macOS", 80),
    ("latest-linux.yml", "electron-updater channel: Linux", 80),
    ("version.json", "catalog/update fallback pointer", 20),
]


def gh(path: str, method: str = "GET", payload: dict | None = None):
    req = urllib.request.Request(API + path, method=method)
    req.add_header("Accept", "application/vnd.github+json")
    req.add_header("User-Agent", "frame-release-guard")
    if TOKEN:
        req.add_header("Authorization", f"Bearer {TOKEN}")
    data = None
    if payload is not None:
        data = json.dumps(payload).encode()
        req.add_header("Content-Type", "application/json")
    try:
        with urllib.request.urlopen(req, data) as r:
            return json.load(r) if r.status != 204 else {}
    except urllib.error.HTTPError as e:
        return {"__error__": e.code, "__body__": e.read().decode()[:400]}


def find(assets: list[dict], needle: str) -> dict | None:
    hits = [a for a in assets if needle in a["name"]]
    return max(hits, key=lambda a: a["size"]) if hits else None


def main() -> int:
    tag = os.environ.get("GUARD_TAG", "").strip()
    if tag:
        rel = gh(f"/repos/{REPO}/releases/tags/{tag}")
    else:
        rel = gh("/repos/{REPO}/releases/latest")
        # /releases/latest 404s when the newest release is a prerelease or a
        # draft sits on top — fall back to the newest published release.
        if rel.get("__error__") == 404:
            alt = gh(f"/repos/{REPO}/releases?per_page=25")
            rel = next((r for r in alt if not r.get("draft")), rel) \
                if isinstance(alt, list) else rel

    if "__error__" in rel:
        print(f"!! could not read release ({rel['__error__']}): {rel['__body__']}")
        return 1

    tag = rel["tag_name"]
    assets = rel.get("assets", [])
    print(f"release {tag} · published {rel.get('published_at')} · {len(assets)} assets\n")

    rows, problems = [], []

    for needle, label, minimum in REQUIRED + META:
        asset = find(assets, needle)
        if asset is None:
            rows.append(("MISSING", label, needle, 0))
            problems.append(f"**{label}** — no asset matching `{needle}`")
            continue
        size = asset["size"]
        state = "ok" if size >= minimum else "TOO SMALL"
        rows.append((state, label, asset["name"], size))
        if state != "ok":
            problems.append(
                f"**{label}** — `{asset['name']}` is {size/MB:.1f} MB "
                f"(expected at least {minimum/MB:.0f} MB; upload looks truncated)"
            )

    width = max(len(r[2]) for r in rows)
    for state, label, name, size in rows:
        mark = {"ok": "OK  ", "MISSING": "----", "TOO SMALL": "!!!!"}[state]
        print(f"  [{mark}] {name.ljust(width)}  {size/MB:8.1f} MB   {label}")

    total = sum(a["size"] for a in assets) / MB
    print(f"\n  total payload: {total:,.0f} MB across {len(assets)} assets")

    summary_title = f"Release guard: {tag} is missing desktop artifacts"
    if not problems:
        print(f"\n  verdict: {tag} carries every Electron artifact. Nothing to do.")
        # Heal: close a previously opened guard issue for this tag.
        if os.environ.get("REPORT_ISSUE") == "1":
            issues = gh(f"/repos/{REPO}/issues?state=open&labels=release-guard&per_page=100")
            if isinstance(issues, list):
                for it in issues:
                    if tag in it.get("title", ""):
                        gh(f"/repos/{REPO}/issues/{it['number']}", "PATCH",
                           {"state": "closed",
                            "body": it.get("body", "")
                            + f"\n\n---\nFixed — re-checked and `{tag}` now carries every artifact."})
                        print(f"  closed stale guard issue #{it['number']}")
        return 0

    print("\n  verdict: PROBLEMS FOUND")
    body = (
        f"Automated check of [`{tag}`](https://github.com/{REPO}/releases/tag/{tag}) "
        "found that part of the desktop build never landed on the release.\n\n"
        + "\n".join(f"- {p}" for p in problems)
        + "\n\n### What usually causes this\n"
        "1. The release workflow died in the `Detect version / create tag` job, so no\n"
        "   Electron job ever started — re-run it with `workflow_dispatch` + `force: true`.\n"
        "2. An artifact upload failed after the release object was created — re-run only\n"
        "   the affected OS job; electron-builder will skip what is already uploaded.\n\n"
        "_Opened by the release-guard workflow._"
    )

    if os.environ.get("REPORT_ISSUE") == "1":
        issues = gh(f"/repos/{REPO}/issues?state=open&labels=release-guard&per_page=100")
        existing = next((i for i in issues if tag in i.get("title", "")), None) \
            if isinstance(issues, list) else None
        if existing:
            gh(f"/repos/{REPO}/issues/{existing['number']}", "PATCH", {"body": body})
            print(f"  updated issue #{existing['number']}")
        else:
            out = gh(f"/repos/{REPO}/issues", "POST",
                     {"title": summary_title, "body": body,
                      "labels": ["release-guard", "bug"]})
            print(f"  opened issue #{out.get('number')}")

    return 1


if __name__ == "__main__":
    sys.exit(main())
