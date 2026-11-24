# Print player feedback from the quit dialog (Supabase events, ev='feedback'). Usage: python3 tools/feedback.py [DAYS=7]
import json, re, sys, urllib.request, datetime as D
days = float(sys.argv[1]) if len(sys.argv) > 1 else 7
K = re.search(r"key: '([^']+)'", open('game/telemetry.js').read()).group(1)
since = (D.datetime.now(D.UTC) - D.timedelta(days=days)).strftime('%Y-%m-%dT%H:%M:%S')
q = f"https://tzpebjsikktsqlzqlemb.supabase.co/rest/v1/events?select=at,dev,data&ev=eq.feedback&at=gt.{since}&order=at.desc&limit=500"
for e in json.load(urllib.request.urlopen(urllib.request.Request(q, headers={'apikey': K, 'Authorization': 'Bearer ' + K}))):
    d = e['data']; print(f"{e['at'][:16]} {e['dev']:8} {d.get('mode','')}/{d.get('m','')} lv{d.get('lvl','')}: {d.get('text','')}")
