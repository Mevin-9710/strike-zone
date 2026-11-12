#!/usr/bin/env python3 -I
"""Fetch a URL and print readable text (WebFetch was broken on 2026-11-07).
Usage: python3 -I tools/fetch_text.py URL [START_MARKER] [MAX_CHARS]
Tip: docs.crazygames.com pages repeat a huge nav; pass a START_MARKER such as
'Table of contents' (use the LAST occurrence) or a heading to skip it."""
import re, html, sys, urllib.request
url = sys.argv[1]; marker = sys.argv[2] if len(sys.argv) > 2 else ""; n = int(sys.argv[3]) if len(sys.argv) > 3 else 6000
t = urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})).read().decode("utf-8", "replace")
t = re.sub(r"<(script|style)[^>]*>.*?</\1>", "", t, flags=re.S)  # never strip <nav>: it swallowed real content once
t = html.unescape(re.sub(r"<[^>]+>", " ", t)); t = re.sub(r"\s+", " ", t)
i = t.rfind(marker) if marker else 0
print(t[max(i, 0): max(i, 0) + n])
