# Print player feedback (Supabase events): one-tap reasons (ev='fb_reason', v29.8) as counts, then the free-text
# messages (ev='feedback' from the quit dialog / exit box / end screen). Usage: python3 tools/feedback.py [DAYS=7]
import json, re, sys, urllib.request, datetime as D
from collections import Counter
days = float(sys.argv[1]) if len(sys.argv) > 1 else 7
K = re.search(r"key: '([^']+)'", open('game/telemetry.js').read()).group(1)
since = (D.datetime.now(D.UTC) - D.timedelta(days=days)).strftime('%Y-%m-%dT%H:%M:%S')
def get(ev): return json.load(urllib.request.urlopen(urllib.request.Request(
    f"https://tzpebjsikktsqlzqlemb.supabase.co/rest/v1/events?select=at,dev,data&ev=eq.{ev}&at=gt.{since}&order=at.desc&limit=5000",
    headers={'apikey': K, 'Authorization': 'Bearer ' + K})))
R = get('fb_reason')
print(f"== One-tap reasons, last {days:g} days ({len(R)} taps) ==")
for where in ('end', 'quit', 'exit'):
    rs = [e for e in R if e['data'].get('where') == where]
    if not rs: continue
    c = Counter(e['data'].get('r') for e in rs)
    print(f"  {where:5} ({len(rs)}): " + ', '.join(f"{k} {v} ({v * 100 // len(rs)}%)" for k, v in c.most_common()))
    for d in ('touch', 'desk'):
        c2 = Counter(e['data'].get('r') for e in rs if e['dev'].startswith(d))
        if c2: print(f"        {d:5}: " + ', '.join(f"{k} {v}" for k, v in c2.most_common()))
F = get('feedback')
print(f"\n== Written feedback ({len(F)}) ==")
for e in F:
    d = e['data']; print(f"{e['at'][:16]} {e['dev']:8} {d.get('where','')}/{d.get('mode','')}/{d.get('m','')} lv{d.get('lvl','')}: {d.get('text','')}")
