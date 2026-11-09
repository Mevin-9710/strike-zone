#!/usr/bin/env python3 -I
"""Build carousel JSON entries from render images. Usage: carousel.py out.txt width quality 'name|desc|img1,img2' ..."""
import sys, json, base64, io
from PIL import Image
out, W, Q = sys.argv[1], int(sys.argv[2]), int(sys.argv[3])
items = []
for spec in sys.argv[4:]:
    name, desc, imgs = spec.split('|')
    ims = [Image.open(p).convert('RGB') for p in imgs.split(',')]
    h = min(i.height for i in ims)
    ims = [i.resize((int(i.width * h / i.height), h)) for i in ims]
    c = Image.new('RGB', (sum(i.width for i in ims), h)); x = 0
    for i in ims: c.paste(i, (x, 0)); x += i.width
    c = c.crop((0, int(h * 0.06), c.width, int(h * 0.97)))
    c = c.resize((W, int(W * c.height / c.width)))
    b = io.BytesIO(); c.save(b, 'WEBP', quality=Q)
    items.append('{n:%s,d:%s,k:"%s"}' % (json.dumps(name), json.dumps(desc), base64.b64encode(b.getvalue()).decode()))
open(out, 'w').write(','.join(items)); print(len(','.join(items)))
