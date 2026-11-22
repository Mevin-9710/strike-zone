# Per-version funnel from telemetry. Version is inferred from events each build sends:
#   v17+: 'dm' events or start.def; v15+: start has 'def'; v14+: thr/quest/lobby/dbl/dcard/trial; else v12-.
# usage: python3 -I tools/vsplit.py [hours_back]
import json, re, sys, urllib.request, collections as C, statistics as st, datetime as D
H = float(sys.argv[1]) if len(sys.argv) > 1 else 48
K = re.search(r"key: '([^']+)'", open('game/telemetry.js').read()).group(1)
U = 'https://tzpebjsikktsqlzqlemb.supabase.co/rest/v1/events'
t0 = (D.datetime.now(D.UTC) - D.timedelta(hours=H)).strftime('%Y-%m-%dT%H:%M:%S')
rows, off = [], 0
while True:
    q = f"{U}?select=at,sid,dev,ev,t,data&at=gt.{t0}&order=id.asc&limit=1000&offset={off}"
    r = json.load(urllib.request.urlopen(urllib.request.Request(q, headers={'apikey': K, 'Authorization': 'Bearer ' + K})))
    rows += r; off += 1000
    if len(r) < 1000: break
S = C.defaultdict(list)
for e in rows: S[e['sid']].append(e)
bot = {s for s, es in S.items() if any('SwiftShader' in (e['data'].get('gpu') or '') for e in es) or s == 'selftest'}
# CrazyGames upload windows, from the first time each build's new events appeared (UTC)
WIN = [('2026-11-21T15:54', 'v17-18'), ('2026-11-21T12:52', 'v15-16'), ('0000', 'v12')]
def ver(es):
    t = es[0]['at'][:16]
    return next(v for a, v in WIN if t >= a)
print(f"last {H:.0f} h: {len(rows)} events, {len(S)} sessions ({len(bot)} bots), {rows[0]['at'][5:16] if rows else ''} -> {rows[-1]['at'][5:16] if rows else ''} UTC")
G = C.defaultdict(list)
for s, es in S.items():
    if s in bot: continue
    G[(ver(es), 'desk' if es[0]['dev'].startswith('desk') else 'touch')].append(es)
for (v, dv) in sorted(G):
    ss = G[(v, dv)]; started = [es for es in ss if any(e['ev'] == 'start' for e in es)]
    play = [max(0, max(e['t'] or 0 for e in es) - min(e['t'] or 0 for e in es if e['ev'] == 'start')) for es in started] or [0]
    kill = sum(any(e['ev'] == 'kill1' for e in es) for es in started) / max(1, len(started)) * 100
    dme = [e['data'] for es in ss for e in es if e['ev'] == 'dm_end']
    dms = sum(1 for es in ss for e in es if e['ev'] == 'start' and e['data'].get('mode') == 'dm')
    ctx = [e['data'] for es in ss for e in es if e['ev'] == 'ctx']; ret = sum(1 for x in ctx if x.get('ret')) / max(1, len(ctx)) * 100
    print(f"{v:7} {dv:5} sess {len(ss):4} | gameplay {len(started)/max(1,len(ss))*100:3.0f}% | 1+min {sum(p>=60 for p in play)/max(1,len(play))*100:3.0f}% | median {st.median(play)/60:4.1f}m avg {st.mean(play)/60:4.1f}m | 10+min {sum(p>=600 for p in play)/max(1,len(play))*100:3.0f}% | kill {kill:3.0f}% | returning {ret:3.0f}%"
          + (f" | DM starts {dms}, finished {len(dme)} ({len(dme)/max(1,dms)*100:.0f}%), won {sum(1 for d in dme if d.get('won'))}, deaths med {st.median([d.get('d',0) for d in dme]) if dme else '-'}, kills med {st.median([d.get('k',0) for d in dme]) if dme else '-'}" if dms else ''))
