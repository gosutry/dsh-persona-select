
# -*- coding: utf-8 -*-
"""dsh-persona-select icons: one plugin, three rows (core + two components)."""
import math
from pathlib import Path
from PIL import Image, ImageDraw

S = 1024
OUT = 256
TOP = (0x5F, 0x6F, 0xAF)
BOTTOM = (0x80, 0xA0, 0xD0)
RIM = (0xBB, 0xCC, 0xFF)
WHITE = (255, 255, 255, 242)

ROOT = Path(r"E:/DSH/plugins/dsh-persona-select-0.4.0-rc4")
CORE_DIR = ROOT / "packages" / "dsh-persona-select"
SETTINGS_DIR = ROOT / "packages" / "dsh-persona-select-settings"
PICKER_DIR = ROOT / "packages" / "dsh-persona-select-picker"
SRC_DIR = ROOT / "_icon_src"
SRC_DIR.mkdir(parents=True, exist_ok=True)


def catmull_rom(points, samples=18):
    out = []
    n = len(points)
    for i in range(n):
        p0 = points[(i - 1) % n]
        p1 = points[i]
        p2 = points[(i + 1) % n]
        p3 = points[(i + 2) % n]
        for s in range(samples):
            t = s / samples
            t2, t3 = t * t, t * t * t
            x = 0.5 * ((2 * p1[0]) + (-p0[0] + p2[0]) * t + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3)
            y = 0.5 * ((2 * p1[1]) + (-p0[1] + p2[1]) * t + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3)
            out.append((x, y))
    return out


def gradient():
    img = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    px = img.load()
    for y in range(S):
        t = (y / (S - 1)) ** 0.92
        c = tuple(int(TOP[i] + (BOTTOM[i] - TOP[i]) * t) for i in range(3))
        for x in range(S):
            px[x, y] = (*c, 255)
    return img


def canvas():
    img = gradient()
    mask = Image.new("L", (S, S), 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, S - 1, S - 1], radius=int(S * 0.235), fill=255)
    img.putalpha(mask)
    rim = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    inset = int(S * 0.012)
    ImageDraw.Draw(rim).rounded_rectangle([inset, inset, S - inset, S - inset], radius=int(S * 0.225), outline=(*RIM, 90), width=max(2, S // 220))
    return Image.alpha_composite(img, rim)


WHALE = [
    (-0.90, 0.00), (-0.74, -0.30), (-0.34, -0.44), (0.10, -0.36),
    (0.52, -0.16), (0.96, -0.60), (0.78, -0.02), (0.96, 0.52),
    (0.52, 0.14), (0.10, 0.30), (-0.34, 0.40), (-0.74, 0.30),
]
FIN = [(-0.30, 0.28), (-0.50, 0.62), (-0.08, 0.42)]


def draw_whale(d, cx, cy, scale, color, eye=WHITE):
    d.polygon([(cx + x * scale, cy + y * scale) for x, y in catmull_rom(WHALE, 20)], fill=color)
    d.polygon([(cx + x * scale, cy + y * scale) for x, y in catmull_rom(FIN, 10)], fill=color)
    ex, ey = cx - 0.60 * scale, cy - 0.10 * scale
    r = max(3, int(scale * 0.075))
    d.ellipse([ex - r, ey - r, ex + r, ey + r], fill=eye)


def draw_wave(d, cx, cy, half_w, amp, color, width):
    pts = []
    steps = 60
    for i in range(steps + 1):
        t = i / steps
        x = cx - half_w + 2 * half_w * t
        y = cy + math.sin(t * math.pi * 2.0) * amp
        pts.append((x, y))
    d.line(pts, fill=color, width=width, joint="curve")


def kernel_icon():
    img = canvas()
    layer = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    draw_whale(d, S * 0.50, S * 0.40, S * 0.175, (*WHITE,))
    draw_wave(d, S * 0.50, S * 0.685, S * 0.20, S * 0.022, (255, 255, 255, 190), max(6, int(S * 0.020)))
    draw_wave(d, S * 0.50, S * 0.765, S * 0.155, S * 0.018, (255, 255, 255, 130), max(5, int(S * 0.017)))
    return Image.alpha_composite(img, layer)


def settings_icon():
    img = canvas()
    layer = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    d.rounded_rectangle([int(S * 0.19), int(S * 0.17), int(S * 0.81), int(S * 0.83)], radius=int(S * 0.10), fill=WHITE)
    draw_whale(d, S * 0.50, S * 0.42, S * 0.155, (*TOP,))
    for i, w in enumerate((0.34, 0.46, 0.24)):
        y = int(S * (0.625 + i * 0.056))
        x0 = int(S * (0.50 - w / 2))
        x1 = int(S * (0.50 + w / 2))
        d.rounded_rectangle([x0, y, x1, y + max(4, int(S * 0.015))], radius=int(S * 0.008), fill=(*TOP, 100))
    return Image.alpha_composite(img, layer)


def picker_icon():
    img = canvas()
    layer = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    d.rounded_rectangle([int(S * 0.13), int(S * 0.15), int(S * 0.87), int(S * 0.76)], radius=int(S * 0.14), fill=WHITE)
    d.polygon([(int(S * 0.29), int(S * 0.745)), (int(S * 0.235), int(S * 0.905)), (int(S * 0.455), int(S * 0.755))], fill=WHITE)
    draw_whale(d, S * 0.50, S * 0.425, S * 0.165, (*TOP,))
    return Image.alpha_composite(img, layer)


def save(img, path):
    path.parent.mkdir(parents=True, exist_ok=True)
    img.resize((OUT, OUT), Image.LANCZOS).save(path, "PNG", optimize=True)


# 主包（最外层/插件卡）图标是角色原图截脸，由 make_main_icon.py 生成；
# 这里只画两个组件行图标。
icons = [
    ("settings", settings_icon(), SETTINGS_DIR / "icon.png"),
    ("picker", picker_icon(), PICKER_DIR / "icon.png"),
]
for name, img, path in icons:
    save(img, path)
    print(name, path, path.stat().st_size, "bytes")

sheet = Image.new("RGBA", (OUT * 2 + 36, OUT + 28), (255, 255, 255, 255))
for i, (name, img, _) in enumerate(icons):
    sheet.alpha_composite(img.resize((OUT, OUT), Image.LANCZOS), (12 + i * (OUT + 12), 12))
sheet.save(SRC_DIR / "components-preview.png")

small = Image.new("RGBA", (48 * 2 + 30, 68), (255, 255, 255, 255))
for i, (name, img, _) in enumerate(icons):
    small.alpha_composite(img.resize((48, 48), Image.LANCZOS), (10 + i * (48 + 10), 10))
small.save(SRC_DIR / "components-small-preview.png")
