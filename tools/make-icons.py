# -*- coding: utf-8 -*-
"""生成 PMail 的应用图标（信封 + 蓝色渐变），并输出到 fpk 打包目录。

设计要点：
  * 和 web/public/favicon.svg、登录页 logo 同一套几何与配色（#4F83FF → #0EA5C6 对角渐变）
  * 信封是描边款、线端圆头；256px 时线宽约 30px，64px 时约 3px，小图标也不会糊
  * 圆角 22%，与飞牛桌面图标的圆角风格一致

用法（需要 Pillow）：
    python tools/make-icons.py            # 写图标 + 预览
    python tools/make-icons.py --preview  # 只出预览（含 B/C 两个备选方案）

输出：
    packaging/fnos/pkg/ICON.PNG                     64x64
    packaging/fnos/pkg/ICON_256.PNG                 256x256
    packaging/fnos/pkg/app/ui/images/icon_64.png    64x64
    packaging/fnos/pkg/app/ui/images/icon_256.png   256x256
    tools/icons-preview/*.png                       预览图（不参与打包）
"""
import argparse
import os

import numpy as np
from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PKG = os.path.join(ROOT, "packaging", "fnos", "pkg")
PREVIEW = os.path.join(ROOT, "tools", "icons-preview")

S = 2048                 # 超采样画布，最后缩到目标尺寸，边缘才干净
C1 = (0x4F, 0x83, 0xFF)  # #4F83FF
C2 = (0x0E, 0xA5, 0xC6)  # #0EA5C6
RADIUS_RATIO = 0.22
WHITE = (255, 255, 255, 255)


def gradient(size):
    y, x = np.mgrid[0:size, 0:size].astype(np.float32)
    t = ((x + y) / (2.0 * (size - 1)))[..., None]
    a = np.array(C1, dtype=np.float32)
    b = np.array(C2, dtype=np.float32)
    rgb = a * (1 - t) + b * t
    return Image.fromarray(rgb.round().astype(np.uint8), "RGB")


def rounded_mask(size, radius):
    mask = Image.new("L", (size, size), 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, size - 1, size - 1], radius=radius, fill=255)
    return mask


def draw_envelope(draw, cx, cy, scale):
    """按 favicon 的 32 格几何放大：信封 19x13 r2.6 stroke1.9，封盖从顶边下方 2 格起。"""
    unit = S / 32.0 * scale
    left, top = cx - 9.5 * unit, cy - 6.5 * unit
    right, bottom = cx + 9.5 * unit, cy + 6.5 * unit
    stroke = int(round(1.9 * unit))
    draw.rounded_rectangle([left, top, right, bottom], radius=2.6 * unit,
                           outline=WHITE, width=stroke)
    p1 = (cx - 8.0 * unit, cy - 4.5 * unit)
    p2 = (cx - 2.3 * unit, cy + 0.6 * unit)
    p3 = (cx + 2.3 * unit, cy + 0.6 * unit)
    p4 = (cx + 8.0 * unit, cy - 4.5 * unit)
    draw.line([p1, p2, p3, p4], fill=WHITE, width=stroke, joint="curve")
    r = stroke / 2.0
    for p in (p1, p4):
        draw.ellipse([p[0] - r, p[1] - r, p[0] + r, p[1] + r], fill=WHITE)


def draw_lock(draw, cx, cy, size):
    """备选 B 的右下角小锁。"""
    w = size
    stroke = max(2, int(round(w * 0.16)))
    draw.arc([cx - w * 0.30, cy - w * 0.62, cx + w * 0.30, cy + w * 0.10],
             start=180, end=360, fill=WHITE, width=stroke)
    for sx in (-0.30, 0.30):
        draw.line([(cx + w * sx, cy - w * 0.26), (cx + w * sx, cy - w * 0.10)], fill=WHITE, width=stroke)
    draw.rounded_rectangle([cx - w / 2, cy - w * 0.06, cx + w / 2, cy + w * 0.66],
                           radius=w * 0.16, fill=WHITE)
    draw.rounded_rectangle([cx - w * 0.055, cy + w * 0.02, cx + w * 0.055, cy + w * 0.26],
                           radius=w * 0.055, fill=C2 + (255,))


def draw_server(draw, cx, cy, size):
    """备选 C 的右下角小服务器。"""
    w = size
    bar_h, gap = w * 0.30, w * 0.12
    for dy in (-(bar_h + gap) / 2, (bar_h + gap) / 2):
        draw.rounded_rectangle([cx - w / 2, cy + dy - bar_h / 2, cx + w / 2, cy + dy + bar_h / 2],
                               radius=bar_h * 0.35, fill=WHITE)
        dot = w * 0.075
        dx = cx + w / 2 - bar_h * 0.55
        draw.ellipse([dx - dot, cy + dy - dot, dx + dot, cy + dy + dot], fill=C2 + (255,))


def render(variant):
    img = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    img.paste(gradient(S), (0, 0), rounded_mask(S, int(S * RADIUS_RATIO)))
    draw = ImageDraw.Draw(img)
    if variant == "A":
        draw_envelope(draw, S / 2, S / 2, 1.0)
    else:
        draw_envelope(draw, S * 0.47, S * 0.45, 0.80)
        badge = S * 0.20
        (draw_lock if variant == "B" else draw_server)(draw, S * 0.74, S * 0.755, badge)
    return img


def font(size):
    # 预览图上的中文标签要能显示，优先用雅黑
    for name in ("msyh.ttc", "msyhl.ttc", "simhei.ttf", "segoeui.ttf"):
        path = os.path.join(os.environ.get("WINDIR", r"C:\Windows"), "Fonts", name)
        if os.path.exists(path):
            return ImageFont.truetype(path, size)
    return ImageFont.load_default()


def preview_sheet(images):
    pad, big, small = 40, 200, 64
    col = big + pad * 2
    width = col * len(images) + pad
    height = pad + 34 + big + 34 + small + pad + 30
    sheet = Image.new("RGBA", (width, height), (244, 246, 250, 255))
    draw = ImageDraw.Draw(sheet)
    title, sub = font(26), font(20)
    for index, (label, img) in enumerate(images):
        x = pad + index * col
        draw.text((x + big // 2, pad - 6), label, font=title, fill=(30, 36, 48, 255), anchor="ma")
        top = pad + 34
        sheet.alpha_composite(img.resize((big, big), Image.LANCZOS), (x, top))
        draw.text((x + big // 2, top + big + 12), "64 px 实际大小", font=sub,
                  fill=(110, 118, 132, 255), anchor="ma")
        sheet.alpha_composite(img.resize((small, small), Image.LANCZOS),
                              (x + big // 2 - small // 2, top + big + 40))
    return sheet


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--preview", action="store_true", help="只生成预览，不写打包目录")
    args = parser.parse_args()

    os.makedirs(PREVIEW, exist_ok=True)
    chosen = render("A")

    images = [(label, render(v)) for v, label in
              (("A", "A · 纯信封（采用）"), ("B", "B · 信封 + 小锁"), ("C", "C · 信封 + 服务器"))]
    sheet = preview_sheet(images)
    sheet_path = os.path.join(PREVIEW, "preview-sheet.png")
    sheet.save(sheet_path)
    print("preview:", sheet_path)

    if args.preview:
        return

    targets = [
        (os.path.join(PKG, "ICON.PNG"), 64),
        (os.path.join(PKG, "ICON_256.PNG"), 256),
        (os.path.join(PKG, "app", "ui", "images", "icon_64.png"), 64),
        (os.path.join(PKG, "app", "ui", "images", "icon_256.png"), 256),
    ]
    for path, size in targets:
        os.makedirs(os.path.dirname(path), exist_ok=True)
        chosen.resize((size, size), Image.LANCZOS).save(path)
        print("icon:", os.path.relpath(path, ROOT), size)


if __name__ == "__main__":
    main()
