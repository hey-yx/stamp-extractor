"""生成案例对比图 compare.png。

左栏输入原图，右栏透明底输出，两栏同尺寸画板：左白底、右棋盘格，1px 描边加 4px 圆角。
取色用站点 token：白 #ffffff、描边 #e8e8e8、次要文字 #666666，棋盘格 #eeeeee 与白 20px。
不放尺寸与长说明，那些交给页面的 figcaption。

用法：python3 cases/make-compare.py
"""

import json
import os

from PIL import Image, ImageDraw, ImageFont

LANCZOS = Image.Resampling.LANCZOS

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CASES = os.path.join(ROOT, "cases", "cases.json")

W, H = 768, 420
PAD = 32
GAP = 24
LABEL_TOP = 24
BOARD_TOP = 56
BOARD_BOTTOM = H - 32
BOARD_W = (W - PAD * 2 - GAP) // 2
BOARD_H = BOARD_BOTTOM - BOARD_TOP
INNER = 16
RADIUS = 4
CHECKER = 20

BG = "#ffffff"
RULE = "#e8e8e8"
TEXT = "#666666"
CHECKER_LIGHT = "#eeeeee"
CHECKER_DARK = "#ffffff"

FONT_CANDIDATES = [
    ("/System/Library/Fonts/Hiragino Sans GB.ttc", 0),
    ("/System/Library/Fonts/Hiragino Sans GB.ttc", 1),
    ("/System/Library/Fonts/STHeiti Light.ttc", 0),
    ("/Library/Fonts/Arial Unicode.ttf", 0),
]


def load_font(size):
    for path, index in FONT_CANDIDATES:
        if os.path.exists(path):
            try:
                return ImageFont.truetype(path, size, index=index)
            except OSError:
                continue
    raise SystemExit("找不到可用的中文字体")


def checkerboard(w, h):
    tile = Image.new("RGB", (CHECKER * 2, CHECKER * 2))
    draw = ImageDraw.Draw(tile)
    draw.rectangle([0, 0, CHECKER * 2, CHECKER * 2], fill=CHECKER_DARK)
    draw.rectangle([0, 0, CHECKER - 1, CHECKER - 1], fill=CHECKER_LIGHT)
    draw.rectangle([CHECKER, CHECKER, CHECKER * 2 - 1, CHECKER * 2 - 1], fill=CHECKER_LIGHT)
    board = Image.new("RGB", (w, h))
    for y in range(0, h, CHECKER * 2):
        for x in range(0, w, CHECKER * 2):
            board.paste(tile, (x, y))
    return board


def rounded_board(fill, w, h):
    board = fill(w, h)
    mask = Image.new("L", (w, h), 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, w - 1, h - 1], radius=RADIUS, fill=255)
    out = Image.new("RGB", (w, h), BG)
    out.paste(board, (0, 0), mask)
    draw = ImageDraw.Draw(out)
    draw.rounded_rectangle([0, 0, w - 1, h - 1], radius=RADIUS, outline=RULE, width=1)
    return out


def fit(im, box_w, box_h):
    im = im.convert("RGBA")
    scale = min(box_w / im.width, box_h / im.height, 1.0)
    size = (max(1, round(im.width * scale)), max(1, round(im.height * scale)))
    return im.resize(size, LANCZOS)


def crop_to_subject(im, margin=0.08):
    """按红色主体外扩一圈再裁，避免宽幅照片里章只占一小块。"""
    rgb = im.convert("RGB")
    w, h = rgb.size
    px = rgb.load()
    min_x, min_y, max_x, max_y = w, h, -1, -1
    step = max(1, min(w, h) // 400)
    for y in range(0, h, step):
        for x in range(0, w, step):
            r, g, b = px[x, y]
            if r > 140 and g < 110 and b < 110:
                min_x = min(min_x, x); max_x = max(max_x, x)
                min_y = min(min_y, y); max_y = max(max_y, y)
    if max_x < 0:
        return im
    pad_x = int((max_x - min_x) * margin)
    pad_y = int((max_y - min_y) * margin)
    box = (max(0, min_x - pad_x), max(0, min_y - pad_y), min(w, max_x + pad_x), min(h, max_y + pad_y))
    if (box[2] - box[0]) >= w * 0.9 and (box[3] - box[1]) >= h * 0.9:
        return im
    return im.crop(box)


def build(case, font):
    canvas = Image.new("RGB", (W, H), BG)

    left_x = PAD
    right_x = PAD + BOARD_W + GAP

    canvas.paste(rounded_board(lambda w, h: Image.new("RGB", (w, h), BG), BOARD_W, BOARD_H), (left_x, BOARD_TOP))
    canvas.paste(rounded_board(checkerboard, BOARD_W, BOARD_H), (right_x, BOARD_TOP))

    draw = ImageDraw.Draw(canvas)
    draw.text((left_x, LABEL_TOP), "输入", fill=TEXT, font=font)
    draw.text((right_x, LABEL_TOP), "提取结果", fill=TEXT, font=font)

    box_w, box_h = BOARD_W - INNER * 2, BOARD_H - INNER * 2

    src = fit(crop_to_subject(Image.open(os.path.join(ROOT, case["input"]))), box_w, box_h)
    out = fit(Image.open(os.path.join(ROOT, case["output"])), box_w, box_h)

    canvas.paste(src, (left_x + (BOARD_W - src.width) // 2, BOARD_TOP + (BOARD_H - src.height) // 2), src)
    canvas.paste(out, (right_x + (BOARD_W - out.width) // 2, BOARD_TOP + (BOARD_H - out.height) // 2), out)

    target = os.path.join(ROOT, case["compare"])
    canvas.save(target, optimize=True)
    print(f"{case['slug']}: {target}")


def main():
    with open(CASES, encoding="utf-8") as f:
        cases = json.load(f)
    font = load_font(15)
    for case in cases:
        build(case, font)


if __name__ == "__main__":
    main()
