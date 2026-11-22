# Conversion funnel from telemetry: script loaded (ctx) -> assets loaded (boot) -> mission start -> first input/first kill -> 60 s played.
# usage: python3 -I tools/convfunnel.py FROM_ISO TO_ISO   (UTC, e.g. 2026-11-15 2026-11-22)
import json, re, sys, urllib.request, collections as C, statistics as st
a, b = sys.argv[1:3]
K = re.search(r"key: '([^']+)'", open('game/telemetry.js').read()).group(1)
U = 'https://tzpebjsikktsqlzqlemb.supabase.co/rest/v1/events'
rows, off = [], 0
while True:
    r = json.load(urllib.request.urlopen(urllib.request.Request(f"{U}?select=at,sid,dev,ev,t,data&at=gte.{a}&at=lt.{b}&order=id.asc&limit=1000&offset={off}", headers={'apikey': K, 'Authorization': 'Bearer ' + K})))
    rows += r; off += 1000
    if len(r) < 1000: break
S = C.defaultdict(list)
for e in rows: S[e['sid']].append(e)
print(f"{a} -> {b}: {len(rows)} events, {len(S)} sessions (first event {rows[0]['at'][:16] if rows else '-'})")
for dv in ('desk', 'touch'):
    ss = [es for es in S.values() if es[0]['dev'].startswith(dv) and not any('SwiftShader' in (e['data'].get('gpu') or '') for e in es)]
    has = lambda es, ev: any(e['ev'] == ev for e in es)
    n = len(ss); boot = [es for es in ss if has(es, 'boot')]; start = [es for es in ss if has(es, 'start')]
    def played(es):
        s0 = [e['t'] or 0 for e in es if e['ev'] == 'start']
        return max(e['t'] or 0 for e in es) - min(s0) if s0 else 0
    p60 = [es for es in start if played(es) >= 60]; k1 = [es for es in start if has(es, 'kill1')]
    loads = sorted(next(e['data'].get('load') or 0 for e in es if e['ev'] == 'boot') for es in boot)
    nob = [es for es in ss if not has(es, 'boot')]; nob_t = sorted(max(e['t'] or 0 for e in es) for es in nob)
    bootNoStart = [es for es in boot if not has(es, 'start')]
    print(f"\n== {dv}: {n} sessions that ran our script")
    print(f"  loaded (boot)   {len(boot):4} {len(boot)/n*100:5.1f}%   load s median {st.median(loads) if loads else 0:.1f}  p75 {loads[int(len(loads)*.75)] if loads else 0:.1f}  p90 {loads[int(len(loads)*.9)] if loads else 0:.1f}")
    print(f"  left while loading {len(nob)} (seconds in: median {st.median(nob_t) if nob_t else 0:.1f}, {nob_t[:12]})")
    print(f"  started a match {len(start):4} {len(start)/n*100:5.1f}%   loaded but never started: {len(bootNoStart)} (last 'where': {C.Counter(next((e['data'].get('where') for e in es if e['ev']=='quit'), '?') for es in bootNoStart).most_common(5)})")
    print(f"  got a kill      {len(k1):4} {len(k1)/n*100:5.1f}%")
    print(f"  played 60 s+    {len(p60):4} {len(p60)/n*100:5.1f}%")
    for lo, hi in ((0, 5), (5, 10), (10, 20), (20, 999)):
        g = [es for es in boot if lo <= next(e['data'].get('load') or 0 for e in es if e['ev'] == 'boot') < hi]
        if g: print(f"    load {lo}-{hi}s: n={len(g):3}  started {sum(has(es,'start') for es in g)/len(g)*100:3.0f}%  60s+ {sum(played(es)>=60 for es in g)/len(g)*100:3.0f}%")
    q = C.Counter((e['data'].get('os'), e['data'].get('br')) for es in nob for e in es if e['ev'] == 'ctx'); print(f"  left-while-loading by os/browser: {q.most_common(5)}")

# v20+ builds: full funnel from the inline 'page' beacon (fires before any game code downloads)
print("\n== v20+ funnel (sessions with a 'page' event)")
for dv in ('desk', 'touch'):
    ss = [es for es in S.values() if es[0]['dev'].startswith(dv) and any(e['ev'] == 'page' for e in es) and not any('SwiftShader' in (e['data'].get('gpu') or '') for e in es)]
    if not ss: print(f"  {dv}: no v20 sessions yet"); continue
    has = lambda es, ev, **kw: any(e['ev'] == ev and all(e['data'].get(k) == v for k, v in kw.items()) for e in es)
    steps = [('page opened', lambda es: True), ('game code ran (ctx)', lambda es: has(es, 'ctx')), ('25% assets', lambda es: has(es, 'ld', p=25)),
             ('75% assets', lambda es: has(es, 'ld', p=75)), ('loaded (boot)', lambda es: has(es, 'boot')), ('match started', lambda es: has(es, 'start')),
             ('gameplayStart sent', lambda es: has(es, 'gs')), ('first input', lambda es: has(es, 'input')), ('first kill', lambda es: has(es, 'kill1'))]
    print(f"  {dv}: {len(ss)} page opens")
    for name, f in steps: n = sum(1 for es in ss if f(es)); print(f"    {name:22} {n:4} {n/len(ss)*100:5.1f}%")
    q0 = C.Counter(e['data'].get('stage') for es in ss for e in es if e['ev'] == 'quit0'); print(f"    left before game code ran, by stage: {dict(q0)}")
    lk = C.Counter(e['data'].get('k') for es in ss for e in es if e['ev'] == 'lock'); print(f"    mouse capture: {dict(lk)}  (hint shown -> click)")
    js = sorted(next(e['data'].get('js') for e in es if e['ev'] == 'ctx') or 0 for es in ss if any(e['ev'] == 'ctx' and e['data'].get('js') is not None for e in es))
    if js: print(f"    game code arrival s: median {st.median(js):.1f} p90 {js[int(len(js)*.9)]:.1f}")
