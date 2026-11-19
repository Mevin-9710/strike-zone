# Telemetry funnel from Supabase `events` (anon read). Usage: python3 tools/funnel.py [hours=24]
import json, re, sys, urllib.request, collections as C
H = int(sys.argv[1]) if len(sys.argv) > 1 else 24
K = re.search(r"key: '([^']+)'", open('game/telemetry.js').read()).group(1)
U = 'https://tzpebjsikktsqlzqlemb.supabase.co/rest/v1/events'
import datetime as D
since = (D.datetime.now(D.UTC).replace(tzinfo=None) - D.timedelta(hours=H)).isoformat()
rows, off = [], 0
while True:
    q = f"{U}?select=at,sid,dev,ev,t,data&at=gt.{since}&order=at.asc&limit=1000&offset={off}"
    r = json.load(urllib.request.urlopen(urllib.request.Request(q, headers={'apikey': K, 'Authorization': 'Bearer ' + K})))
    rows += r; off += 1000
    if len(r) < 1000: break
S = C.defaultdict(list)
for e in rows: S[e['sid']].append(e)
bot = {s for s, es in S.items() if any('SwiftShader' in (e['data'].get('gpu') or '') for e in es) or s == 'selftest'}
S = {s: es for s, es in S.items() if s not in bot}
def cls(es): return es[0]['dev'][:5]
print(f'{len(S)} real sessions in last {H}h')
for dv in ['desk-', 'touch']:
    ss = [es for es in S.values() if cls(es) == dv]
    if not ss: continue
    has = lambda es, ev: any(e['ev'] == ev for e in es)
    n = len(ss); f = lambda c: f'{c} ({100*c//max(1,n)}%)'
    started = [es for es in ss if has(es, 'start')]
    print(f'\n== {dv} sessions {n}: booted {f(sum(has(es,"boot") for es in ss))} · started {f(len(started))} · first kill {f(sum(has(es,"kill1") for es in ss))} · cleared a level {f(sum(has(es,"part") or has(es,"win") for es in ss))} · 3+ levels {f(sum(max([e["data"].get("n",0) for e in es if e["ev"]=="start"] or [0])>=3 for es in ss))}')
    dur = sorted(max(e['t'] or 0 for e in es) for es in ss); print('  session length s: median', dur[len(dur)//2], 'p75', dur[3*len(dur)//4])
    tut = C.Counter(); [tut.update({max([e['data']['s'] for e in es if e['ev']=='tut'], key=['look','move','fire','fight','reload','defuse'].index)}) for es in ss if has(es,'tut')]
    print('  furthest drill step:', dict(tut))
    q = C.Counter(re.sub(r':\d+$', '', e['data'].get('where','?')) for es in ss for e in es if e['ev']=='quit'); print('  quit at:', q.most_common(8))
    fl = C.Counter((e['data'].get('m'), e['data'].get('why')) for es in ss for e in es if e['ev']=='fail'); print('  fails:', fl.most_common(6))
    wn = C.Counter(e['data'].get('m') for es in ss for e in es if e['ev'] in ('win','part')); print('  clears:', wn.most_common(8))
    fps = [e['data']['fps'] for es in ss for e in es if e['ev']=='fps']; print('  fps median', sorted(fps)[len(fps)//2] if fps else '-', '· <25fps share', f'{100*sum(x<25 for x in fps)//max(1,len(fps))}%')
    gl = [e['data'].get('load') for es in ss for e in es if e['ev']=='boot']; print('  load s median', sorted(gl)[len(gl)//2] if gl else '-', '· no boot', n - len(gl))
    err = C.Counter(e['data'].get('m','')[:60] for es in ss for e in es if e['ev']=='err'); print('  errors:', err.most_common(4))
    ui = C.Counter(e['data'].get('id') for es in ss for e in es if e['ev']=='ui'); print('  buttons:', ui.most_common(10))
