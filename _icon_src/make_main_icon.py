"""最外层（插件卡）图标：从角色原图截脸，压成 256px PNG。

原图：_icon_src/source/face-source.webp（1373x3054）
构图：以脸为中心，方形裁切（0.58 宽），保留喀秋莎头箍、耳朵和一点脖颈。
组件图标仍由 make_icons.py 生成。
"""
from pathlib import Path
from PIL import Image, ImageDraw

ROOT = Path(r"E:/DSH/plugins/dsh-persona-select-0.4.0-rc4")
SRC = ROOT / "_icon_src" / "source" / "face-source.webp"
MAIN = ROOT / "packages" / "dsh-persona-select"
PICKER = ROOT / "packages" / "dsh-persona-select-picker" / "icon.png"
SETTINGS = ROOT / "packages" / "dsh-persona-select-settings" / "icon.png"
OUT = MAIN / "icon.png"
SIZE = 256
SIDE = 0.58
CENTER_X = 0.52
CENTER_Y = 0.135
RADIUS = 0.22


def rounded_mask(size, radius_ratio=RADIUS):
    mask = Image.new("L", (size, size), 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, size - 1, size - 1], radius=int(size * radius_ratio), fill=255)
    return mask


def main_icon():
    im = Image.open(SRC).convert("RGB")
    w, h = im.size
    side = int(w * SIDE)
    cx, cy = int(w * CENTER_X), int(h * CENTER_Y)
    left = max(0, min(w - side, cx - side // 2))
    top = max(0, min(h - side, cy - side // 2))
    square = im.crop((left, top, left + side, top + side))
    icon = square.resize((SIZE, SIZE), Image.LANCZOS).convert("RGBA")
    icon.putalpha(rounded_mask(SIZE))
    return icon


def preview():
    files = [("main", OUT), ("picker", PICKER), ("settings", SETTINGS)]
    tiles = [(name, Image.open(path).convert("RGBA").resize((SIZE, SIZE), Image.LANCZOS)) for name, path in files if path.exists()]
    sheet = Image.new("RGBA", (len(tiles) * (SIZE + 12) + 12, SIZE + 24), (255, 255, 255, 255))
    for i, (name, img) in enumerate(tiles):
        sheet.alpha_composite(img, (12 + i * (SIZE + 12), 12))
    sheet.save(ROOT / "_icon_src" / "icons-preview.png")

    small = Image.new("RGBA", (len(tiles) * 58 + 10, 68), (255, 255, 255, 255))
    for i, (name, img) in enumerate(tiles):
        small.alpha_composite(img.resize((48, 48), Image.LANCZOS), (10 + i * 58, 10))
    small.save(ROOT / "_icon_src" / "icons-small-preview.png")


icon = main_icon()
MAIN.mkdir(parents=True, exist_ok=True)
icon.save(OUT, "PNG", optimize=True)
preview()
print("main icon ->", OUT, OUT.stat().st_size, "bytes")
