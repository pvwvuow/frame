#!/usr/bin/env python3
"""Convert Tailwind v3-style `!utility` important prefixes to v4 `utility!` suffixes
inside src/components/lumina/*.tsx. Only tokens containing '-' or '[' are touched,
so JS logical-not operators like `!p` or `!playing` are left alone."""
import re, pathlib

DIR = pathlib.Path("/home/z/my-project/src/components/lumina")
# match: (quote or whitespace) + !token  where token contains '-' or '[' or '/'
PAT = re.compile(r'(?<=[\s"\'])!([A-Za-z][A-Za-z0-9_]*(?:[-\[/][A-Za-z0-9_\-\[\]\./#%]*)+)')

total = 0
for f in sorted(DIR.glob("*.tsx")):
    src = f.read_text()
    out, n = PAT.subn(r"\1!", src)
    if n:
        f.write_text(out)
        print(f"{f.name}: {n} conversions")
        total += n
print(f"TOTAL: {total}")
