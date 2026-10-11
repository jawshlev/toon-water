"""compare.py ref.png render.png out.png [zoomA x,y,w,h] [zoomB x,y,w,h]
Side-by-side reference | render, plus 3x nearest-neighbour zoom crops of both."""
import sys
from PIL import Image, ImageDraw
ref, ren, out = sys.argv[1:4]
zooms = [tuple(map(int, z.split(','))) for z in (sys.argv[4:] or ['560,560,320,240', '200,800,320,240'])]
A = Image.open(ref).convert('RGB').resize((720, 540)); B = Image.open(ren).convert('RGB').resize((720, 540))
fa = Image.open(ref).convert('RGB'); fb = Image.open(ren).convert('RGB').resize(fa.size)
W = 1440; H = 540 + len(zooms) * 360 + 30
img = Image.new('RGB', (W, H), (20, 20, 20)); d = ImageDraw.Draw(img)
img.paste(A, (0, 30)); img.paste(B, (720, 30))
d.text((8, 8), 'REFERENCE  ' + ref.split('/')[-1], fill=(255, 255, 255)); d.text((728, 8), 'RENDER  ' + ren.split('/')[-1], fill=(255, 255, 255))
for i, (x, y, w, h) in enumerate(zooms):
    za = fa.crop((x, y, x + w, y + h)).resize((480, 360), Image.NEAREST)
    zb = fb.crop((x, y, x + w, y + h)).resize((480, 360), Image.NEAREST)
    yy = 570 + i * 360
    img.paste(za, (120, yy)); img.paste(zb, (840, yy))
    d.text((124, yy + 4), f'zoom {x},{y} {w}x{h}', fill=(0, 0, 0))
img.save(out)
