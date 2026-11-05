#!/usr/bin/env python3
"""Builds every launcher icon from the one real logo, www/img/leaf.png (the orange feather and pen).
Run:  python3 tools/icons/build_icons.py     (needs Pillow)"""
import os
from PIL import Image, ImageDraw
HERE = os.path.dirname(os.path.abspath(__file__))
LOGO = Image.open(os.path.join(HERE, '..', '..', 'www', 'img', 'leaf.png')).convert('RGBA')
RES = os.path.join(HERE, 'res')
BG = (255, 247, 240, 255)  # warm white so the orange logo stays the star
LOGO = LOGO.crop(LOGO.getbbox())

def art(px, frac):
    w, h = LOGO.size
    s = px * frac / max(w, h)
    im = LOGO.resize((max(1, round(w * s)), max(1, round(h * s))), Image.LANCZOS)
    c = Image.new('RGBA', (px, px), (0, 0, 0, 0))
    c.alpha_composite(im, ((px - im.width) // 2, (px - im.height) // 2))
    return c

def tile(px, shape, frac=0.66):
    ss = 4
    big = px * ss
    base = Image.new('RGBA', (big, big), BG)
    base.alpha_composite(art(big, frac))
    m = Image.new('L', (big, big), 0)
    d = ImageDraw.Draw(m)
    if shape == 'round': d.ellipse((0, 0, big - 1, big - 1), fill=255)
    else: d.rounded_rectangle((0, 0, big - 1, big - 1), radius=big * 22 // 100, fill=255)
    base.putalpha(m)
    return base.resize((px, px), Image.LANCZOS)

def mono(px):
    a = art(px, 0.58)
    out = Image.new('LA', (px, px), (0, 0))
    out.putalpha(a.getchannel('A'))
    return out

DENS = {'mdpi': 100, 'hdpi': 150, 'xhdpi': 200, 'xxhdpi': 300, 'xxxhdpi': 400}
for d, f in DENS.items():
    folder = os.path.join(RES, 'mipmap-' + d)
    os.makedirs(folder, exist_ok=True)
    legacy, adp = (48 * f + 50) // 100, (108 * f + 50) // 100
    tile(legacy, 'square').save(os.path.join(folder, 'ln_icon.png'))
    tile(legacy, 'round').save(os.path.join(folder, 'ln_icon_round.png'))
    art(adp, 0.5).save(os.path.join(folder, 'ln_icon_fg.png'))   # orange logo on transparent, inside the adaptive safe zone
    mono(adp).save(os.path.join(folder, 'ln_icon_mono.png'))
tile(512, 'square').save(os.path.join(HERE, 'play-store-512.png'))
tile(256, 'square').save(os.path.join(HERE, '..', '..', 'www', 'img', 'icon.png'))
print('icons written')
