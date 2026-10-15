#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
把领域类图渲染成 JPG
============================================================================
为什么不用现成的转换器：
  这台机器装不了 cairosvg / svglib（无外网），也没有 Inkscape / ImageMagick，
  Edge 无头模式又被沙盒挡住，所以没法把 class-diagram.svg 直接转成位图。

做法：
  直接复用 render-class-diagram.py 里的解析器与布局结果（同一份 .mmd、同一套
  列分配与走线规则），用 Pillow 按 SVG 的配色和尺寸重画一遍。
  这样两张图**几何完全一致**，不存在"SVG 和 JPG 长得不一样"的问题。

输出（out/class-diagram-jpg/）：
  领域类图.jpg          约 2648×3768（2x 超采样，适合放大看细节）
  领域类图-适合插入文档.jpg  宽 1600（适合塞进 Word / PPT 一页）

用法：
  python tools/render-class-diagram-jpg.py
  python tools/render-class-diagram-jpg.py --scale=3
"""

from __future__ import annotations

import argparse
import importlib.util
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
MMD = ROOT / "docs" / "diagrams" / "class-diagram.mmd"
OUT_DIR = ROOT / "out" / "class-diagram-jpg"

# ---------------------------------------------------------------------------
# 载入 render-class-diagram.py，复用它的解析 + 布局 + 走线（不重复实现一遍）
# ---------------------------------------------------------------------------
_spec = importlib.util.spec_from_file_location("rcd", ROOT / "tools" / "render-class-diagram.py")
rcd = importlib.util.module_from_spec(_spec)
sys.modules["rcd"] = rcd
_spec.loader.exec_module(rcd)

# 配色（与 render-class-diagram.py 的 C 字典/样式一一对应）
C = {
    "bg": (247, 248, 252),
    "box": (255, 255, 255),
    "head": (238, 240, 251),
    "divider": (230, 233, 244),
    "text": (29, 33, 48),
    "muted": (91, 100, 120),
    "faint": (152, 161, 181),
    "accent": (255, 106, 61),
    "rel": (152, 161, 181),
    "rel_strong": (107, 116, 136),
    "enum_head": (255, 244, 232),
    "enum_line": (246, 221, 198),
    "view_head": (233, 247, 245),
    "view_line": (207, 234, 230),
    "calc_head": (241, 236, 253),
    "calc_line": (221, 210, 247),
    "white": (255, 255, 255),
    "shadow": (238, 240, 246),
}

FONT_REG = r"C:\Windows\Fonts\msyh.ttc"
FONT_BOLD = r"C:\Windows\Fonts\msyhbd.ttc"
FONT_MONO = r"C:\Windows\Fonts\consola.ttf"

_cache: dict[tuple[str, int], ImageFont.FreeTypeFont] = {}


def font(kind: str, size: int) -> ImageFont.FreeTypeFont:
    key = (kind, size)
    if key not in _cache:
        _cache[key] = ImageFont.truetype(
            {"r": FONT_REG, "b": FONT_BOLD, "m": FONT_MONO}[kind], size
        )
    return _cache[key]


def has_cjk(s: str) -> bool:
    import unicodedata

    return any(unicodedata.east_asian_width(ch) in ("W", "F") for ch in s)


def kind_for(s: str, mono_when_latin: bool = True) -> str:
    """
    选字体种类。⚠️ Consolas 没有中日韩字形，用它渲染中文会得到一串方框（乱码），
    所以含中文的文本一律回退到正文字体。
    这是踩过的坑：方法名"注册()"曾经用等宽字体渲染，结果整列都是豆腐块。
    """
    if mono_when_latin and not has_cjk(s):
        return "m"
    return "r"


def header_colors(k) -> tuple[tuple, tuple]:
    if k.stereotype == "枚举":
        return C["enum_head"], C["enum_line"]
    if k.stereotype == "投影视图":
        return C["view_head"], C["view_line"]
    if k.stereotype in ("计算结果", "值对象"):
        return C["calc_head"], C["calc_line"]
    return C["head"], C["divider"]


class Pen:
    """绘图助手：把类图里反复出现的图元（圆角框、箭头、菱形、标签片）包一层。"""

    def __init__(self, draw: ImageDraw.ImageDraw, scale: int):
        self.d = draw
        self.s = scale

    def px(self, v: float) -> int:
        return int(round(v * self.s))

    # ---- 基础 ----
    def rrect(self, x, y, w, h, fill=None, outline=None, width=1.4, radius=13):
        box = [self.px(x), self.px(y), self.px(x + w), self.px(y + h)]
        self.d.rounded_rectangle(
            box,
            radius=self.px(radius),
            fill=fill,
            outline=outline,
            width=max(1, self.px(width)) if outline else 0,
        )

    def text(self, x, y, s, size=12, color=None, kind="r", anchor="la", max_w=None):
        f = font(kind, self.px(size))
        if max_w is not None:
            s = self.ellipsize(s, f, self.px(max_w))
        self.d.text((self.px(x), self.px(y)), s, font=f, fill=color or C["text"], anchor=anchor)

    def ellipsize(self, s, f, limit):
        if self.d.textlength(s, font=f) <= limit:
            return s
        while s and self.d.textlength(s + "…", font=f) > limit:
            s = s[:-1]
        return s + "…"

    def text_w(self, s, size=12, kind="r") -> float:
        return self.d.textlength(s, font=font(kind, self.px(size))) / self.s

    def line(self, x1, y1, x2, y2, color=None, width=1.2, dash=None):
        col = color or C["divider"]
        if not dash:
            self.d.line(
                [self.px(x1), self.px(y1), self.px(x2), self.px(y2)],
                fill=col,
                width=max(1, self.px(width)),
            )
            return
        # 手动画虚线（Pillow 没有原生虚线）
        import math

        total = math.hypot(x2 - x1, y2 - y1)
        if total <= 0:
            return
        ux, uy = (x2 - x1) / total, (y2 - y1) / total
        pos, on = 0.0, True
        while pos < total:
            seg = dash[0] if on else dash[1]
            nxt = min(total, pos + seg)
            if on:
                self.d.line(
                    [self.px(x1 + ux * pos), self.px(y1 + uy * pos),
                     self.px(x1 + ux * nxt), self.px(y1 + uy * nxt)],
                    fill=col,
                    width=max(1, self.px(width)),
                )
            pos, on = nxt, not on

    def polyline(self, pts, color=None, width=1.5, dash=None):
        for i in range(len(pts) - 1):
            self.line(*pts[i], *pts[i + 1], color=color, width=width, dash=dash)

    # ---- 图元 ----
    def arrow_filled(self, x, y, direction, color):
        h, w = 9.0, 5.0
        if direction == "left":
            pts = [(x, y), (x + h, y - w), (x + h, y + w)]
        elif direction == "right":
            pts = [(x, y), (x - h, y - w), (x - h, y + w)]
        else:
            pts = [(x, y), (x - w, y + h), (x + w, y + h)]
        self.d.polygon([(self.px(a), self.px(b)) for a, b in pts], fill=color)

    def arrow_open(self, x, y, direction, color):
        h, w = 9.0, 5.0
        if direction == "right":
            pts = [(x - h, y - w), (x, y), (x - h, y + w)]
        else:
            pts = [(x + h, y - w), (x, y), (x + h, y + w)]
        self.polyline(pts, color=color, width=1.6)

    def arrow_hollow(self, x, y, direction, color):
        h, w = 10.0, 5.5
        if direction == "right":
            pts = [(x - h, y - w), (x, y), (x - h, y + w)]
        else:
            pts = [(x + h, y - w), (x, y), (x + h, y + w)]
        self.d.polygon([(self.px(a), self.px(b)) for a, b in pts],
                       fill=C["box"], outline=color, width=max(1, self.px(1.2)))

    def diamond(self, x, y, direction, color, filled):
        L, W = 13.0, 6.0
        if direction == "right":
            pts = [(x, y), (x + L / 2, y - W), (x + L, y), (x + L / 2, y + W)]
        elif direction == "left":
            pts = [(x, y), (x - L / 2, y - W), (x - L, y), (x - L / 2, y + W)]
        elif direction == "down":
            pts = [(x, y), (x - W, y + L / 2), (x, y + L), (x + W, y + L / 2)]
        else:
            pts = [(x, y), (x - W, y - L / 2), (x, y - L), (x + W, y - L / 2)]
        self.d.polygon(
            [(self.px(a), self.px(b)) for a, b in pts],
            fill=color if filled else C["box"],
            outline=color,
            width=max(1, self.px(1.2)),
        )

    def chip(self, cx, cy, label, size=11, fill=None, stroke=None, fg=None, pad=8, mono=True):
        """居中标签片（多重性 / 关系名）。"""
        f = font("m" if mono else "r", self.px(size))
        tw = self.d.textlength(label, font=f) / self.s
        w, h = tw + pad * 2, size + 9
        self.rrect(cx - w / 2, cy - h / 2, w, h, fill=fill or C["white"],
                   outline=stroke or (230, 233, 244), width=1.1, radius=6)
        self.text(cx, cy, label, size=size, color=fg or C["muted"],
                  kind="m" if mono else "r", anchor="mm")


# ============================================================================
# 绘制类框
# ============================================================================

def draw_class(p: Pen, k, ox):
    head_fill, border = header_colors(k)
    x, y, w, h = ox + k.x, k.y, k.w, k.h

    # 阴影 + 主体
    p.rrect(x, y + 3, w, h, fill=C["shadow"], radius=13)
    p.rrect(x, y, w, h, fill=C["box"], outline=border, width=1.3, radius=13)

    # 头部色带（上圆角、下直角）
    header_h = rcd.HEADER_H
    p.d.rounded_rectangle(
        [p.px(x), p.px(y), p.px(x + w), p.px(y + header_h)],
        radius=p.px(13), fill=head_fill,
    )
    p.d.rectangle([p.px(x), p.px(y + header_h - 13), p.px(x + w), p.px(y + header_h)],
                  fill=head_fill)
    # 左侧品牌色条
    p.rrect(x + 2, y, 4, h, fill=C["accent"], radius=2)

    title_y = y + (24 if not k.stereotype else 22)
    p.text(x + w / 2, title_y, k.name, size=17, color=C["text"], kind="m", anchor="mm",
           max_w=w - 24)
    if k.stereotype:
        p.text(x + w / 2, title_y + 17, f"<<{k.stereotype}>>", size=10.5, color=C["muted"],
               anchor="mm")

    top = y + header_h + (rcd.STEREO_H if k.stereotype else 0)
    p.line(x, top, x + w, top, border, 1.2)

    for idx, (ry, rh, mem) in enumerate(k.rows):
        ty = y + ry + rh * 0.68          # 文字基线：与 SVG 版同一算法
        # 统一按"文本里有没有中文"选字体（Consolas 无中日韩字形 → 会变方框）
        if mem.kind == "method":
            p.text(x + rcd.GUTTER, ty, mem.render, size=12, color=C["muted"],
                   kind=kind_for(mem.render))
        elif mem.kind == "enum":
            parts = mem.render.split(None, 1)
            key = parts[0]
            rest = parts[1] if len(parts) > 1 else ""
            p.text(x + rcd.GUTTER, ty, key, size=12, color=C["text"], kind=kind_for(key))
            if rest:
                p.text(x + w - rcd.GUTTER, ty, rest, size=11.5, color=C["faint"],
                       anchor="rm", kind=kind_for(rest))
        else:
            p.text(x + rcd.GUTTER, ty, mem.name, size=12, color=C["text"],
                   kind=kind_for(mem.name))
            if mem.type:
                p.text(x + w - rcd.GUTTER, ty, mem.type, size=11, color=C["faint"],
                       anchor="rm", kind=kind_for(mem.type))
        if idx < len(k.rows) - 1:
            p.line(x + 10, y + ry + rh, x + w - 10, y + ry + rh, C["divider"], 1)


# ============================================================================
# 绘制关系（与 SVG 版的走线规则完全一致）
# ============================================================================

def draw_relations(p: Pen, classes, relations, ox, oy):
    """ox / oy 是整体偏移：类框被下移了标题带的高度，关系线必须跟着下移，
    否则"线画在没下移的位置、框在下移后的位置"，会完全错位。"""
    by_name = {k.name: k for k in classes}
    slot_counter: dict[tuple[int, int], int] = {}
    lane_used = 0
    # 复用主渲染器里的装箱器：保证 JPG 与 SVG 的标签位置完全一致
    canvas_w = max(k.x + k.w for k in classes) + 200
    packer = rcd.LabelPacker(
        [(k.x + ox, k.y + oy, k.x + k.w + ox, k.y + k.h + oy) for k in classes], canvas_w
    )

    for rel in relations:
        src, dst = by_name.get(rel.left), by_name.get(rel.right)
        if not src or not dst:
            continue

        backward = rel.arrow in ("<--", "--*", "--o", "<..", "--|>")
        a, b = (dst, src) if backward else (src, dst)
        arrow = {"<--": "-->", "--*": "*--", "--o": "o--", "<..": "..>", "--|>": "--|>"}.get(
            rel.arrow, rel.arrow
        )

        near = (a.column, b.column)
        slot = slot_counter.get(near, 0)
        slot_counter[near] = slot + 1

        lane_index = 0
        if a.column != b.column and abs(a.column - b.column) >= 2:
            lane_index = lane_used
            lane_used += 1

        s, t, mode = rcd.anchor_points(a, b, slot, classes, lane_index)
        s = (s[0] + ox, s[1] + oy)
        t = (t[0] + ox, t[1] + oy)

        color = C["rel_strong"] if arrow in ("*--", "o--") else C["rel"]
        dashed = (4, 4) if arrow == "..>" else None

        # 走线：按 mode 复算折线点（与 rcd.path_d 的规则一一对应）
        sx, sy = s
        tx, ty = t
        if mode.startswith(("chan", "gap")):
            mx = float(mode[4:]) if mode.startswith("chan") else float(mode[3:])
            pts = [(sx, sy), (mx, sy), (mx, ty), (tx, ty)]
        elif mode.startswith("lane"):
            # 格式："lane{y}"，y 就是通道线的纵坐标
            ly = float(mode[4:])
            pts = [(sx, sy), (sx, ly), (tx, ly), (tx, ty)]
        elif abs(sy - ty) < 1.5:
            pts = [(sx, sy), (tx, ty)]
        else:
            mx = (sx + tx) / 2
            pts = [(sx, sy), (mx, sy), (mx, ty), (tx, ty)]

        p.polyline(pts, color=color, width=1.5, dash=dashed)

        # 端点方向与装饰
        if mode.startswith(("chan", "gap")):
            direction = "left"
        elif mode.startswith("lane"):
            direction = "left" if t[0] < s[0] else "right"
        else:
            direction = "left" if t[0] < s[0] else "right"

        if arrow == "*--":
            p.diamond(*t, direction, C["rel_strong"], filled=True)
        elif arrow == "o--":
            p.diamond(*t, direction, C["rel_strong"], filled=False)
        elif arrow == "--|>":
            p.arrow_hollow(*t, direction, C["rel_strong"])
        elif arrow == "..>":
            p.arrow_open(*t, direction, C["rel"])
        else:
            p.arrow_filled(*t, direction, C["rel"])

        # 多重性与关系名：交给与 SVG 版同一个装箱器，保证两张图标签位置一致
        lm = rel.left_mult if not backward else rel.right_mult
        rm = rel.right_mult if not backward else rel.left_mult
        near_mode = mode.startswith(("chan", "gap"))
        on_lane = mode.startswith("lane")

        if near_mode:
            anchors = [(s[0] + 20, s[1], lm, "mult"), (t[0] - 20, t[1], rm, "mult")]
        elif on_lane:
            anchors = [(s[0], s[1] - 12, lm, "mult"), (t[0], t[1] + 16, rm, "mult")]
        else:
            anchors = [(s[0], s[1] - 13, lm, "mult"), (t[0], t[1] - 13, rm, "mult")]

        for cx, cy, label, kind in anchors:
            if not label:
                continue
            x, y, _ok = packer.place(cx, cy, label, kind)
            p.chip(x, y, label)

        # 关系名放在折线中点（s/t 已经是下移后的坐标）
        if rel.label:
            mid = rcd.midpoint_of_path(s, t, mode)
            x, y, _ok = packer.place(mid[0], mid[1], rel.label, "name")
            p.chip(x, y, rel.label, size=11.5, fill=(255, 238, 231),
                   stroke=(255, 196, 173), fg=(226, 84, 45), mono=False, pad=9)


# ============================================================================
# 图例与标题
# ============================================================================

def draw_legend(p: Pen, x, y):
    p.text(x, y, "图例", size=13, color=C["text"], kind="b")
    # 构造型说明放最前，避免排到画布右边界之外被裁掉
    items = [
        ("<<枚举>>", "取值受限的枚举类"),
        ("1 —— 0..*", "一对多关联"),
        ("◆——", "组合（整体-部分）"),
        ("◇——", "聚合（可独立存在）"),
        ("┄┄▷", "依赖 / 使用"),
    ]
    cx = x
    for glyph, desc in items:
        gw = p.text_w(glyph, 12, "r")
        dw = p.text_w(desc, 12)
        w = gw + dw + 34
        p.rrect(cx, y + 12, w, 30, fill=C["box"], outline=(226, 230, 240), width=1.2,
                radius=9)
        p.text(cx + 12, y + 27, glyph, size=12, color=C["rel_strong"], kind="r",
               anchor="lm")
        p.text(cx + 12 + gw + 10, y + 27, desc, size=12, color=C["muted"], anchor="lm")
        cx += w + 10


def render(scale: int, width_override: int | None = None) -> Image.Image:
    text = MMD.read_text(encoding="utf-8")
    classes, relations, _notes = rcd.parse_mmd(text)
    width, height = rcd.layout(classes)          # 与 SVG 版同一套布局

    # 顶部通道带的高度要和 SVG 版算得一模一样，否则两张图会错位。
    # 规则：通道条数 = 跨 2 列以上的关系数；band 至少 TOP_BAND，且要装得下所有通道 + 副标题。
    n_lanes = sum(
        1 for r in relations
        if abs(next(k.column for k in classes if k.name == r.left)
               - next(k.column for k in classes if k.name == r.right)) >= 2
    )
    band = max(rcd.TOP_BAND, rcd.LANE_BASE + n_lanes * rcd.LANE_H + 34)
    total_h = band + height + rcd.BOTTOM_PAD

    img = Image.new("RGB", (int(width * scale), int(total_h * scale)), C["bg"])
    p = Pen(ImageDraw.Draw(img), scale)

    # 标题
    p.text(rcd.PAD, 20, "动搭 SportMate · 领域类图", size=24, color=C["text"], kind="b")
    p.text(width - rcd.PAD, 20,
           f"依据后端接口契约（19 个接口 / {len(classes)} 个类 / {len(relations)} 条关系）",
           size=12.5, color=C["faint"], anchor="ra")
    p.text(rcd.PAD, band - 14,
           f"顶部 {n_lanes} 条横向线是跨列关系的“走线通道”："
           f"通道位于所有类框之上，因此不会穿过任何类框",
           size=11.5, color=C["faint"])

    # 关系与类框画在同一坐标系：
    # 先算类框下移后的位置（+band），再按同一偏移画线与框，顺序是先线后框，
    # 这样连线端点会被框盖住，看起来就是"贴边接入"。
    for k in classes:
        k.y += band
    draw_relations(p, classes, relations, 0, 0)
    for k in classes:
        draw_class(p, k, 0)
    for k in classes:                              # 还原，便于重复调用
        k.y -= band

    draw_legend(p, rcd.PAD, band + height + 6)

    if width_override and img.width > width_override:
        ratio = width_override / img.width
        img = img.resize((width_override, int(img.height * ratio)), Image.LANCZOS)
    return img


def main() -> int:
    ap = argparse.ArgumentParser(description="把领域类图渲染成 JPG")
    ap.add_argument("--scale", type=int, default=2, help="渲染倍率（默认 2）")
    ap.add_argument("--doc-width", type=int, default=1600,
                    help="另外输出一张适合插入文档的宽度（默认 1600）")
    args = ap.parse_args()

    OUT_DIR.mkdir(parents=True, exist_ok=True)

    full = render(args.scale)
    p1 = OUT_DIR / "领域类图.jpg"
    full.save(p1, "JPEG", quality=92, optimize=True)
    print(f"  ✓ {p1.name}  {full.width}×{full.height}  {p1.stat().st_size // 1024} KB")

    if args.doc_width and full.width > args.doc_width:
        ratio = args.doc_width / full.width
        small = full.resize((args.doc_width, int(full.height * ratio)), Image.LANCZOS)
        p2 = OUT_DIR / "领域类图-适合插入文档.jpg"
        small.save(p2, "JPEG", quality=90, optimize=True)
        print(f"  ✓ {p2.name}  {small.width}×{small.height}  {p2.stat().st_size // 1024} KB")

    print(f"\n输出目录：{OUT_DIR.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
