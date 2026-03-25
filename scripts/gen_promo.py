#!/usr/bin/env python3
"""Generate Chrome Web Store promo tiles (24-bit PNG, no alpha)."""

from PIL import Image, ImageDraw, ImageFont, ImageFilter
import os

# ── Fonts ────────────────────────────────────────────────────────────
_FONT = "/System/Library/Fonts/HelveticaNeue.ttc"


def font(size, weight="regular"):
    idx = {"regular": 0, "bold": 1, "light": 7, "ultralight": 5}[weight]
    return ImageFont.truetype(_FONT, size, index=idx)


# ── Palette ──────────────────────────────────────────────────────────
BG = (22, 22, 38)          # dark navy
BG2 = (34, 34, 54)         # lighter navy (gradient target)
RED = (234, 67, 53)        # Gmail red
WHITE = (255, 255, 255)
GRAY = (155, 155, 180)


# ── Helpers ──────────────────────────────────────────────────────────
def make_gradient(size):
    """Horizontal BG→BG2 gradient, returns RGB Image."""
    w, h = size
    img = Image.new("RGB", size)
    draw = ImageDraw.Draw(img)
    for x in range(w):
        t = x / max(w - 1, 1)
        r = int(BG[0] + (BG2[0] - BG[0]) * t)
        g = int(BG[1] + (BG2[1] - BG[1]) * t)
        b = int(BG[2] + (BG2[2] - BG[2]) * t)
        draw.line([(x, 0), (x, h - 1)], fill=(r, g, b))
    return img


def rounded_mask(size, radius):
    mask = Image.new("L", size, 0)
    ImageDraw.Draw(mask).rounded_rectangle(
        [0, 0, size[0] - 1, size[1] - 1], radius=radius, fill=255
    )
    return mask


def paste_shadowed(canvas, img, pos, radius=12, blur=14, offset=(5, 8), opacity=130):
    """Paste img (RGB) onto canvas (RGB) with drop shadow and rounded corners."""
    w, h = img.size
    pad = blur * 2
    shadow = Image.new("RGBA", (w + pad, h + pad), (0, 0, 0, 0))
    ImageDraw.Draw(shadow).rounded_rectangle(
        [blur, blur, w + blur, h + blur], radius=radius, fill=(0, 0, 0, opacity)
    )
    shadow = shadow.filter(ImageFilter.GaussianBlur(blur // 2))
    canvas.paste(
        Image.new("RGB", shadow.size, (0, 0, 0)),
        (pos[0] + offset[0] - blur, pos[1] + offset[1] - blur),
        shadow,
    )
    canvas.paste(img.convert("RGB"), pos, rounded_mask(img.size, radius))


def text_height(draw, text, fnt):
    _, _, _, h = draw.textbbox((0, 0), text, font=fnt)
    return h


# ── Assets ───────────────────────────────────────────────────────────
ss = Image.open("media/ss1.png").convert("RGB")          # 1280 × 800
icon_src = Image.open("chrome/icons/icon128.png").convert("RGBA")

# Crop: remove sidebar, keep popup-visible top-right region
# Full-width minus the Gmail sidebar (≈270px) and keep interesting height
ss_wide = ss.crop((270, 55, 1280, 780))    # 1010 × 725  (marquee)
ss_tall = ss.crop((820, 55, 1280, 570))    # 460  × 515  (small tile)

os.makedirs("media", exist_ok=True)

# ════════════════════════════════════════════════════════════════════
# SMALL PROMO TILE  440 × 280
# ════════════════════════════════════════════════════════════════════
W, H = 440, 280
canvas = make_gradient((W, H))
draw = ImageDraw.Draw(canvas)

# Red accent bar on left
draw.rectangle([0, 0, 5, H], fill=RED)

# ── Icon ─────────────────────────────────────────────────────────
ICON_SZ = 44
icon = icon_src.resize((ICON_SZ, ICON_SZ), Image.LANCZOS)
lx, ty = 26, 28
canvas.paste(icon, (lx, ty), icon)

# ── Text ─────────────────────────────────────────────────────────
f_title = font(30, "bold")
f_sub   = font(12, "light")
f_tag   = font(13)

y = ty + ICON_SZ + 10
draw.text((lx, y), "Gmail", font=f_title, fill=WHITE)
th = text_height(draw, "Gmail", f_title)
y += th + 2
draw.text((lx, y), "Resizer", font=f_title, fill=RED)
th2 = text_height(draw, "Resizer", f_title)
y += th2 + 14

for line in ("Control how many emails", "appear per page.", "Choose 10 · 25 · 50 · 100."):
    draw.text((lx, y), line, font=f_tag, fill=GRAY)
    y += text_height(draw, line, f_tag) + 4

# ── Screenshot ───────────────────────────────────────────────────
rx = W // 2 + 8
rw = W - rx - 14
rh = H - 24
crop = ss_tall.copy()
crop.thumbnail((rw, rh), Image.LANCZOS)
cx = rx + (rw - crop.width) // 2
cy = (H - crop.height) // 2
paste_shadowed(canvas, crop, (cx, cy), radius=8, blur=10, offset=(4, 5), opacity=110)

canvas.save("media/small_promo.png")
print("Created media/small_promo.png  (440×280)")

# ════════════════════════════════════════════════════════════════════
# MARQUEE PROMO TILE  1400 × 560
# ════════════════════════════════════════════════════════════════════
W, H = 1400, 560
canvas = make_gradient((W, H))
draw = ImageDraw.Draw(canvas)

# Red accent bar
draw.rectangle([0, 0, 7, H], fill=RED)

# Subtle top / bottom accent lines
draw.rectangle([0, 0, W, 3], fill=RED)
draw.rectangle([0, H - 3, W, H], fill=RED)

# ── Icon ─────────────────────────────────────────────────────────
ICON_SZ = 88
icon = icon_src.resize((ICON_SZ, ICON_SZ), Image.LANCZOS)
lx, ty = 70, 72
canvas.paste(icon, (lx, ty), icon)

# ── Text ─────────────────────────────────────────────────────────
f_title  = font(62, "bold")
f_tag    = font(24, "light")
f_sub    = font(18)

y = ty + ICON_SZ + 18
draw.text((lx, y), "Gmail", font=f_title, fill=WHITE)
th = text_height(draw, "Gmail", f_title)
y += th + 4
draw.text((lx, y), "Resizer", font=f_title, fill=RED)
th2 = text_height(draw, "Resizer", f_title)
y += th2 + 22

for line in (
    "Control exactly how many emails",
    "appear per page — 10, 15, 25, 50",
    "or 100 — right from your toolbar.",
):
    draw.text((lx, y), line, font=f_tag, fill=GRAY)
    y += text_height(draw, line, f_tag) + 8

# ── Screenshot ───────────────────────────────────────────────────
rx = int(W * 0.41)
rw = W - rx - 48
rh = H - 60
crop = ss_wide.copy()
crop.thumbnail((rw, rh), Image.LANCZOS)
cx = rx + (rw - crop.width) // 2
cy = (H - crop.height) // 2
paste_shadowed(canvas, crop, (cx, cy), radius=14, blur=22, offset=(6, 10), opacity=145)

canvas.save("media/marquee_promo.png")
print("Created media/marquee_promo.png (1400×560)")
