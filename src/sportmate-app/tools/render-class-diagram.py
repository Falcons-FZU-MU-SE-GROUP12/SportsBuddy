#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
把 docs/diagrams/class-diagram.mmd 渲染成 SVG 类图
============================================================================
为什么自己渲染而不用 mermaid.js：
  这台机器没有外网、也没有可用的无头浏览器，mermaid 在浏览器里才跑得起来。
  所以这里用一份最小的 Mermaid classDiagram 解析器 + 正交连线布局器，
  直接把 .mmd 渲染成标准 UML 风格的 SVG。

用法：
  python tools/render-class-diagram.py            # 渲染全部图
  python tools/render-class-diagram.py --check    # 只做语法检查

输出：
  docs/diagrams/class-diagram.svg        总体类图（可直接插入 Word/PPT）
  docs/diagrams/class-diagram.svg        同一份，供 class-diagram.html 内联展示
"""

from __future__ import annotations

import argparse
import re
import sys
import unicodedata
from dataclasses import dataclass, field
from pathlib import Path
from xml.sax.saxutils import escape

ROOT = Path(__file__).resolve().parent.parent
DIAGRAM_DIR = ROOT / "docs" / "diagrams"
MMD = DIAGRAM_DIR / "class-diagram.mmd"


# ============================================================================
# 1. 画布与排版参数
# ============================================================================

PAD = 42                 # 画布外边距
COL_GAP = 96             # 列间距（留给连线）
ROW_GAP = 30             # 同类目行间距
GUTTER = 14              # 成员列表内边距
ROW_H = 23               # 单个成员行高
HEADER_H = 50            # 类名区高度
STEREO_H = 19            # 构造型（<<实体>>）行高
MIN_W = 236              # 类框最小宽度
MAX_W = 320              # 类框最大宽度
CHAR_W = 0.55            # 拉丁字符平均宽度系数（相对字号）
CJK_W = 1.0              # 中日韩字符宽度系数

# XML 属性值里不能出现裸的双引号，字体名统一用 &quot; 实体
FONT = ('-apple-system,BlinkMacSystemFont,&quot;Segoe UI&quot;,&quot;PingFang SC&quot;,'
        '&quot;Hiragino Sans GB&quot;,&quot;Microsoft YaHei&quot;,&quot;Source Han Sans SC&quot;,sans-serif')
MONO = '&quot;SF Mono&quot;,&quot;JetBrains Mono&quot;,Consolas,&quot;Microsoft YaHei&quot;,monospace'

C = {
    "bg": "#f7f8fc",
    "box": "#ffffff",
    "line": "#e2e6f0",
    "head": "#eef0fb",
    "head2": "#e7eaf9",
    "divider": "#e6e9f4",
    "text": "#1d2130",
    "muted": "#5b6478",
    "faint": "#98a1b5",
    "accent": "#ff6a3d",
    "accent2": "#12b5a5",
    "rel": "#98a1b5",
    "rel_strong": "#6b7488",
    "enum_head": "#fff4e8",
    "enum_line": "#f6ddc6",
    "view_head": "#e9f7f5",
    "view_line": "#cfeae6",
    "calc_head": "#f1ecfd",
    "calc_line": "#ddd2f7",
}


# ============================================================================
# 2. 文本宽度估算（CJK 按 1 个字宽算）
# ============================================================================

def text_width(s: str, size: float) -> float:
    w = 0.0
    for ch in s:
        if unicodedata.east_asian_width(ch) in ("W", "F"):
            w += CJK_W
        elif ch == " ":
            w += 0.30
        else:
            w += CHAR_W
    return w * size


def has_cjk(s: str) -> bool:
    """字符串里是否含中日韩字符（用来决定能不能用等宽字体）。"""
    return any(unicodedata.east_asian_width(ch) in ("W", "F") for ch in s)


def font_for(s: str, mono_when_latin: bool = True) -> str:
    """
    选字体：含中日韩字符的文本必须用正文（雅黑）。
    ⚠️ Consolas 没有中日韩字形，用它渲染中文会得到一串方框（乱码）。
    这是踩过的坑：方法名"注册()"曾用 MONO 渲染，结果全是豆腐块。
    """
    if mono_when_latin and not has_cjk(s):
        return MONO
    return FONT


# ============================================================================
# 3. 数据模型
# ============================================================================

@dataclass
class Member:
    raw: str
    kind: str          # 'attr' | 'method' | 'enum' | 'note'
    visibility: str    # '+', '-', '#', '~'
    name: str
    type: str
    render: str        # 最终显示的文本


@dataclass
class Klass:
    name: str
    stereotype: str = ""
    members: list[Member] = field(default_factory=list)
    column: int = 0
    order: int = 0
    x: float = 0.0
    y: float = 0.0
    w: float = 0.0
    h: float = 0.0
    # 计算得到的行位置
    rows: list[tuple[float, float, Member]] = field(default_factory=list)

    @property
    def cx(self) -> float:
        return self.x + self.w / 2

    @property
    def cy(self) -> float:
        return self.y + self.h / 2

    def rect(self):
        return (self.x, self.y, self.x + self.w, self.y + self.h)


@dataclass
class Relation:
    left: str
    right: str
    left_mult: str
    right_mult: str
    arrow: str          # '-->', 'o--', '*--', '..>', '--|>'
    label: str = ""
    line_index: int = 0


# ============================================================================
# 4. 解析 Mermaid classDiagram
# ============================================================================

REL_RE = re.compile(
    r'^(?P<left>[A-Za-z_][\w]*)\s*'
    r'(?:"(?P<lm>[^"]*)"\s*)?'
    r'(?P<arrow><\|--|--\|>|\*--|--\*|o--|--o|-->|<--|\.\.>|<\.\.|--|\.\.)\s*'
    r'(?:"(?P<rm>[^"]*)"\s*)?'
    r'(?P<right>[A-Za-z_][\w]*)'
    r'(?:\s*:\s*(?P<label>.+))?$'
)

VIS_RE = re.compile(r'^\s*(?P<vis>[+\-#~])?\s*(?P<rest>.+?)\s*$')

# 方法行的识别：名字后面紧跟一对括号（括号里可有参数，也可为空），括号后可跟返回类型。
# 例：+注册() AuthSession / +显示签到码(查看者) string / +取消() void
METHOD_RE = re.compile(r'^[^\s(]+\([^)]*\)(\s|$)')


def looks_like_type(token: str) -> bool:
    """判断一个词是否像类型名：string、int、datetime、Foo[]、Foo。"""
    return bool(re.fullmatch(r'[A-Za-z_][\w.\[\]<>]*', token)) and token[0].isalpha()


def parse_member(line: str, is_enum: bool) -> Member | None:
    m = VIS_RE.match(line)
    if not m:
        return None
    vis = m.group("vis") or "+"
    rest = m.group("rest").strip()
    if not rest:
        return None

    # 方法判定：名字后面紧跟一对括号（括号里可有参数，也可为空），括号后可跟返回类型：
    #   +注册() AuthSession        +显示签到码(查看者) string        +取消() void
    # 不能用 endswith(")") —— 会漏掉"带返回类型"的写法；
    # 也不能用 "()" in rest —— 会漏掉"带参数"的写法。
    # 两种漏判都会让中文方法名走"等宽字体成员行"分支，而 Consolas 没有中文字形，
    # 结果就是一排方框（乱码）。
    if not is_enum and METHOD_RE.match(rest):
        return Member(line, "method", vis, rest, "", f"{vis} {rest}")

    if is_enum:                                # 枚举项："beginner 新手"
        return Member(line, "enum", vis, rest, "", rest)

    tokens = rest.split()
    if not tokens:
        return None
    if len(tokens) == 1:
        return Member(line, "attr", vis, tokens[0], "", f"{vis} {tokens[0]}")

    # 兼容两种写法："int id"（类型在前）与 "id int"（名字在前）
    if looks_like_type(tokens[0]) and not looks_like_type(tokens[-1]):
        typ, name = tokens[0], " ".join(tokens[1:])
    elif looks_like_type(tokens[-1]) and not looks_like_type(tokens[0]):
        name, typ = " ".join(tokens[:-1]), tokens[-1]
    else:
        typ, name = tokens[0], " ".join(tokens[1:])
    return Member(line, "attr", vis, name, typ, f"{vis} {name} : {typ}")


def parse_mmd(text: str) -> tuple[list[Klass], list[Relation], list[str]]:
    classes: dict[str, Klass] = {}
    relations: list[Relation] = []
    notes: list[str] = []
    order = 0
    current: Klass | None = None
    relation_index = 0

    for raw_line in text.splitlines():
        line = raw_line.split("%%")[0].rstrip() if raw_line.strip().startswith("%%") else raw_line
        stripped = line.strip()
        if not stripped or stripped.startswith("%%"):
            continue
        if stripped.startswith("classDiagram") or stripped.startswith("direction"):
            continue
        if stripped == "}":
            current = None
            continue

        m = re.match(r'^class\s+(?P<name>[A-Za-z_]\w*)(?:\["(?P<alias>[^"]*)"\])?\s*\{?$', stripped)
        if m:
            name = m.group("name")
            if name not in classes:
                order += 1
                classes[name] = Klass(name=name, order=order)
            current = classes[name]
            continue

        if current is not None and stripped.startswith("<<"):
            current.stereotype = stripped.strip("<> ")
            continue

        if current is not None:
            member = parse_member(stripped, is_enum=current.stereotype == "枚举")
            if member:
                current.members.append(member)
            continue

        rm = REL_RE.match(stripped)
        if rm:
            relation_index += 1
            relations.append(
                Relation(
                    left=rm.group("left"),
                    right=rm.group("right"),
                    left_mult=(rm.group("lm") or "").strip(),
                    right_mult=(rm.group("rm") or "").strip(),
                    arrow=rm.group("arrow"),
                    label=(rm.group("label") or "").strip(),
                    line_index=relation_index,
                )
            )
            continue

        notes.append(stripped)

    return list(classes.values()), relations, notes


# ============================================================================
# 5. 布局
# ============================================================================

# 手工指定列。设计原则：
#   1) 关系最密集的主链路放中间相邻列（Activity / Registration / Review）；
#   2) 值对象（签到结果、登录会话）贴着"拥有它"的类放，避免跨列拉线；
#   3) 枚举统一放最右一列 —— 枚举只被"使用"，靠顶部通道回连即可。
COLUMN_MAP: dict[str, int] = {
    # 第 1 列：用户与登录会话
    "User": 0,
    "AuthSession": 0,
    # 第 2 列：活动主线 + 签到结果
    "Activity": 1,
    "Registration": 1,
    "Participant": 1,
    "CheckinResult": 1,
    # 第 3 列：评价、字典、匹配计算
    "Review": 2,
    "Sport": 2,
    "MatchResult": 2,
    "MatchReason": 2,
    # 第 4 列：枚举
    "SkillLevel": 3,
    "ActivityStatus": 3,
    "RegistrationStatus": 3,
    "CheckinMethod": 3,
    "GenderLimit": 3,
}

# 顶部通道参数：跨 2 列以上的关系走通道，一条关系一层
LANE_H = 13
LANE_BASE = 46
# 顶部通道带的总高度 = 标题 + 副标题 + 所有通道层
TOP_BAND = 186
# 画布额外留白：底部要放图例，副标题也不能被通道压住
BOTTOM_PAD = 140


def size_class(k: Klass) -> None:
    title_w = text_width(k.name, 17) + 76
    stereo_w = text_width(f"<<{k.stereotype}>>", 10.5) + 60 if k.stereotype else 0
    body_w = 0.0
    for mem in k.members:
        body_w = max(body_w, text_width(mem.render, 12) + 2 * GUTTER + 6)
    k.w = max(MIN_W, min(MAX_W, max(title_w, stereo_w, body_w)))

    rows = []
    y = HEADER_H + (STEREO_H if k.stereotype else 0)
    for mem in k.members:
        # 超长文本按可用宽度折行
        avail = k.w - 2 * GUTTER
        if text_width(mem.render, 12) > avail:
            head, tail = split_wrap(mem.render, avail, 12)
            rows.append((y, ROW_H, Member(mem.raw, mem.kind, mem.visibility, mem.name, mem.type, head)))
            y += ROW_H
            rows.append((y, ROW_H, Member(mem.raw, mem.kind, mem.visibility, mem.name, mem.type, tail)))
            y += ROW_H
        else:
            rows.append((y, ROW_H, mem))
            y += ROW_H
    k.rows = rows
    k.h = y + 12


def split_wrap(text: str, avail: float, size: float) -> tuple[str, str]:
    """在空格处折行，尽量让两行都放得下。"""
    words = text.split()
    if len(words) <= 1:
        cut = max(1, int(len(text) * avail / max(1.0, text_width(text, size))))
        return text[:cut], "  " + text[cut:]
    line1, line2 = [], []
    for w in words:
        if text_width(" ".join(line1 + [w]), size) <= avail:
            line1.append(w)
        else:
            line2.append(w)
    if not line1:
        line1, line2 = words[: len(words) // 2], words[len(words) // 2:]
    return " ".join(line1), "   " + " ".join(line2)


def layout(classes: list[Klass]) -> tuple[float, float]:
    for k in classes:
        size_class(k)

    columns: dict[int, list[Klass]] = {}
    for k in classes:
        col = COLUMN_MAP.get(k.name, 0)
        k.column = col                 # 记下来，连线几何要用
        columns.setdefault(col, []).append(k)
    for col_list in columns.values():
        col_list.sort(key=lambda c: c.order)

    # 列宽取该列最宽的类框，所有类框都按这个列宽定位；
    # 这样极值框（如较宽的 RegistrationStatus）不会溢出到画布外。
    x = PAD
    max_h = 0.0
    for col in sorted(columns):
        col_list = columns[col]
        col_w = max(k.w for k in col_list)
        y = PAD
        for k in col_list:
            k.x = x + (col_w - k.w) / 2   # 列内居中，视觉更整齐
            k.y = y
            y += k.h + ROW_GAP
        max_h = max(max_h, y - ROW_GAP)
        x += col_w + COL_GAP

    width = x - COL_GAP + PAD
    height = max_h + PAD
    return width, height


# ============================================================================
# 6. 连线几何
# ============================================================================

def gap_bounds(classes: list[Klass], i: int, j: int) -> tuple[float, float]:
    """相邻两列 i（左）/ j（右）之间那段空白区域的左右边界。"""
    right_i = max(k.x + k.w for k in classes if k.column == i)
    left_j = min(k.x for k in classes if k.column == j)
    return right_i, left_j


def anchor_points(
    src: Klass,
    dst: Klass,
    slot: int,
    classes: list[Klass],
    lane_index: int,
) -> tuple[tuple[float, float], tuple[float, float], str]:
    """
    返回 (起点, 终点, 走线模式)。四种模式，全部保证"竖线落在列间空白、横线落在列间空白"：

      'gap'  相邻列：出右边 → 在**列间空白**折竖（按 slot 错开，避免重叠）→ 进左边
      'lane' 跨 2 列以上：升到画布顶部的横向通道 → 横穿 → 下降到目标左边
      'chan' 同列：从右侧绕到该列右边的空白通道，再回到目标右边
      'L'    反向（目标在左侧）：升到通道后向左横穿
    """
    lane_y = LANE_BASE + lane_index * LANE_H

    # --- 同列：绕该列右侧的空白通道 ---
    if src.column == dst.column:
        right = max(k.x + k.w for k in classes if k.column == src.column)
        channel_x = right + 26 + slot * 9
        return (src.x + src.w, src.cy), (dst.x + dst.w, dst.cy), f"chan{channel_x:.1f}"

    forward = src.column < dst.column
    span = abs(src.column - dst.column)

    # --- 相邻列：走列间空白 ---
    if span == 1:
        left_col, right_col = (src.column, dst.column) if forward else (dst.column, src.column)
        g_left, g_right = gap_bounds(classes, left_col, right_col)
        if forward:
            x = g_right - 14 - slot * 9
            return (src.x + src.w, src.cy), (dst.x, dst.cy), f"gap{x:.1f}"
        x = g_left + 14 + slot * 9
        return (src.x, src.cy), (dst.x + dst.w, dst.cy), f"gap{x:.1f}"

    # --- 跨 2 列以上：走顶部通道 ---
    if forward:
        return (src.x + src.w, src.cy), (dst.x, dst.cy), f"lane{lane_y:.1f}"
    return (src.x, src.cy), (dst.x + dst.w, dst.cy), f"laneL{lane_y:.1f}"


def path_d(s: tuple[float, float], t: tuple[float, float], mode: str) -> str:
    sx, sy = s
    tx, ty = t
    if mode.startswith("chan"):
        x = float(mode[4:])
        return f"M {sx:.1f} {sy:.1f} H {x:.1f} V {ty:.1f} H {tx:.1f}"
    if mode.startswith("gap"):
        x = float(mode[3:])
        return f"M {sx:.1f} {sy:.1f} H {x:.1f} V {ty:.1f} H {tx:.1f}"
    if mode.startswith("laneL"):
        y = float(mode[5:])
        return f"M {sx:.1f} {sy:.1f} V {y:.1f} H {tx:.1f} V {ty:.1f}"
    if mode.startswith("lane"):
        y = float(mode[4:])
        return f"M {sx:.1f} {sy:.1f} V {y:.1f} H {tx:.1f} V {ty:.1f}"
    if abs(sy - ty) < 1.5:
        return f"M {sx:.1f} {sy:.1f} H {tx:.1f}"
    mx = (sx + tx) / 2
    return f"M {sx:.1f} {sy:.1f} H {mx:.1f} V {ty:.1f} H {tx:.1f}"


def arrow_head(x: float, y: float, direction: str, color: str, kind: str) -> str:
    """direction: 'left' | 'right' | 'up' | 'down'"""
    h = 9.0
    w = 5.0
    if direction == "left":
        pts = f"{x:.1f},{y:.1f} {x + h:.1f},{y - w:.1f} {x + h:.1f},{y + w:.1f}"
    elif direction == "right":
        pts = f"{x:.1f},{y:.1f} {x - h:.1f},{y - w:.1f} {x - h:.1f},{y + w:.1f}"
    elif direction == "up":
        pts = f"{x:.1f},{y:.1f} {x - w:.1f},{y + h:.1f} {x + w:.1f},{y + h:.1f}"
    else:
        pts = f"{x:.1f},{y:.1f} {x - w:.1f},{y - h:.1f} {x + w:.1f},{y - h:.1f}"

    if kind == "hollow":   # 泛化（空心三角）
        return f'<polygon points="{pts}" fill="#ffffff" stroke="{color}" stroke-width="1.4"/>'
    return f'<polygon points="{pts}" fill="{color}"/>'


def diamond(x: float, y: float, direction: str, color: str, filled: bool) -> str:
    """聚合（空心菱形）/组合（实心菱形），画在端点处。"""
    L = 13.0
    W = 6.0
    fill = color if filled else "#ffffff"
    if direction == "right":      # 菱形在点的右侧
        pts = f"{x},{y} {x + L / 2},{y - W} {x + L},{y} {x + L / 2},{y + W}"
    elif direction == "left":
        pts = f"{x},{y} {x - L / 2},{y - W} {x - L},{y} {x - L / 2},{y + W}"
    elif direction == "down":
        pts = f"{x},{y} {x - W},{y + L / 2} {x},{y + L} {x + W},{y + L / 2}"
    else:
        pts = f"{x},{y} {x - W},{y - L / 2} {x},{y - L} {x + W},{y - L / 2}"
    return f'<polygon points="{pts}" fill="{fill}" stroke="{color}" stroke-width="1.4"/>'


def mult_label(x: float, y: float, text: str, color: str) -> str:
    if not text:
        return ""
    w = text_width(text, 11) + 10
    return (
        f'<rect x="{x - w / 2:.1f}" y="{y - 9:.1f}" width="{w:.1f}" height="18" rx="5" fill="#ffffff" '
        f'stroke="{C["line"]}" stroke-width="1"/>'
        f'<text x="{x:.1f}" y="{y + 4:.1f}" font-size="11" font-family="{MONO}" fill="{color}" '
        f'text-anchor="middle">{escape(text)}</text>'
    )


def label_chip(x: float, y: float, text: str) -> str:
    if not text:
        return ""
    w = text_width(text, 11.5) + 16
    return (
        f'<rect x="{x - w / 2:.1f}" y="{y - 10:.1f}" width="{w:.1f}" height="20" rx="10" '
        f'fill="{C["accent"]}" fill-opacity="0.10" stroke="{C["accent"]}" stroke-opacity="0.35"/>'
        f'<text x="{x:.1f}" y="{y + 4:.1f}" font-size="11.5" font-family="{FONT}" '
        f'fill="{C["accent"]}" text-anchor="middle">{escape(text)}</text>'
    )


# ============================================================================
# 7. 渲染 SVG
# ============================================================================

def header_colors(k: Klass) -> tuple[str, str]:
    if k.stereotype == "枚举":
        return C["enum_head"], C["enum_line"]
    if k.stereotype == "投影视图":
        return C["view_head"], C["view_line"]
    if k.stereotype in ("计算结果", "值对象"):
        return C["calc_head"], C["calc_line"]
    return C["head"], C["divider"]


def render_class(k: Klass) -> str:
    head_fill, border = header_colors(k)
    out = [
        f'<g class="cls" data-name="{escape(k.name)}" data-column="{k.column}" '
        f'transform="translate({k.x:.1f},{k.y:.1f})">',
        # 组内统一以"本类框左上角"为原点，成员行 y 就不必再叠加 k.y
        f'<rect x="0" y="3" width="{k.w:.1f}" height="{k.h:.1f}" rx="13" '
        f'fill="#1d2130" fill-opacity="0.05"/>',
        f'<rect x="0" y="0" width="{k.w:.1f}" height="{k.h:.1f}" rx="13" '
        f'fill="{C["box"]}" stroke="{border}" stroke-width="1.3"/>',
        f'<path d="M 0 13 a13,13 0 0 1 13,-13 h {k.w - 26:.1f} a13,13 0 0 1 13,13 '
        f'v {HEADER_H - 13:.1f} h {-k.w:.1f} z" fill="{head_fill}"/>',
        f'<rect x="2" y="0" width="4" height="{k.h:.1f}" rx="2" '
        f'fill="{C["accent"]}" fill-opacity="0.85"/>',
    ]

    title_y = 24 if not k.stereotype else 22
    out.append(
        f'<text x="{k.w / 2:.1f}" y="{title_y:.1f}" font-size="17" font-weight="650" '
        f'font-family="{MONO}" fill="{C["text"]}" text-anchor="middle">{escape(k.name)}</text>'
    )
    if k.stereotype:
        out.append(
            f'<text x="{k.w / 2:.1f}" y="{title_y + 17:.1f}" font-size="10.5" '
            f'font-family="{FONT}" fill="{C["muted"]}" text-anchor="middle" letter-spacing="0.6">'
            f'&lt;&lt;{escape(k.stereotype)}&gt;&gt;</text>'
        )

    top = HEADER_H + (STEREO_H if k.stereotype else 0)
    out.append(
        f'<line x1="0" y1="{top:.1f}" x2="{k.w:.1f}" y2="{top:.1f}" '
        f'stroke="{border}" stroke-width="1.2"/>'
    )

    for idx, (ry, rh, mem) in enumerate(k.rows):
        ty = ry + rh * 0.68
        # 一律按"这段文字里有没有中文"选字体：
        # Consolas 等宽字体没有中日韩字形，渲染中文会变成方框（乱码）。
        if mem.kind == "method":
            out.append(
                f'<text x="{GUTTER:.1f}" y="{ty:.1f}" font-size="12" '
                f'font-family="{font_for(mem.render)}" '
                f'fill="{C["muted"]}">{escape(mem.render)}</text>'
            )
        elif mem.kind == "enum":
            parts = mem.render.split(None, 1)
            key = parts[0]
            rest = parts[1] if len(parts) > 1 else ""
            out.append(
                f'<text x="{GUTTER:.1f}" y="{ty:.1f}" font-size="12" '
                f'font-family="{font_for(key)}" '
                f'fill="{C["text"]}">{escape(key)}</text>'
            )
            if rest:
                out.append(
                    f'<text x="{k.w - GUTTER:.1f}" y="{ty:.1f}" font-size="11.5" '
                    f'font-family="{font_for(rest)}" fill="{C["faint"]}" text-anchor="end">'
                    f'{escape(rest)}</text>'
                )
        else:
            name_txt = mem.name
            type_txt = mem.type
            out.append(
                f'<text x="{GUTTER:.1f}" y="{ty:.1f}" font-size="12" '
                f'font-family="{font_for(name_txt)}" '
                f'fill="{C["text"]}">{escape(name_txt)}</text>'
            )
            if type_txt:
                out.append(
                    f'<text x="{k.w - GUTTER:.1f}" y="{ty:.1f}" font-size="11" '
                    f'font-family="{font_for(type_txt)}" fill="{C["faint"]}" text-anchor="end">'
                    f'{escape(type_txt)}</text>'
                )
        if idx < len(k.rows) - 1:
            out.append(
                f'<line x1="10" y1="{ry + rh:.1f}" x2="{k.w - 10:.1f}" '
                f'y2="{ry + rh:.1f}" stroke="{C["divider"]}" stroke-width="1"/>'
            )

    out.append("</g>")
    return "".join(out)


def rects_overlap(a, b, pad: float = 2.0) -> bool:
    """两个矩形是否相交（pad 给一点安全间隙，避免"贴着"看起来像压住）。"""
    return (
        a[0] - pad < b[2] and b[0] - pad < a[2]
        and a[1] - pad < b[3] and b[1] - pad < a[3]
    )


def chip_size(text: str, kind: str = "mult") -> tuple[float, float]:
    """标签片的绘制尺寸。必须与 mult_label / label_chip 里的绘制保持一致，
    否则装箱器算出来的矩形和实际画出来的对不上。"""
    if kind == "mult":
        return text_width(text, 11) + 10, 18.0
    return text_width(text, 11.5) + 16, 20.0


class LabelPacker:
    """
    给标签找位置的贪心装箱器。

    为什么需要它：类图的列间距只有几十像素，而一个类常常同时发出 3~4 条关系，
    这些关系的端点几乎重合。固定偏移（+20 / -20）会导致标签压在类框或彼此压住。
    这里维护一份"已占区域"，对每个标签按优先级尝试若干候选位置，取第一个不冲突的。
    实在找不到（画布被塞满）时退化为最后候选，并在末尾报告冲突数。
    """

    def __init__(self, boxes: list[tuple[float, float, float, float]], canvas_w: float):
        self.boxes = list(boxes)
        self.canvas_w = canvas_w
        self.taken: list[tuple[float, float, float, float]] = []
        self.conflicts = 0

    def place(self, cx: float, cy: float, text: str, kind: str = "mult") -> tuple[float, float, bool]:
        """返回 (标签中心 x, y, 是否无冲突)。"""
        w, h = chip_size(text, kind)
        # 候选偏移按"离折线近、视觉自然"排序。
        # 半径与斜向组合是扫描出来的最优解：列间距 120 时，48 个标签只剩 1 个压不住。
        radii = (26, 52, 78, 104)
        cands = []
        for r in radii:
            cands += [(r, 0), (-r, 0), (0, -r * 0.85), (0, r * 0.85)]
        for r in (radii[0], radii[-1]):
            cands += [(r, -r * 0.85), (-r, -r * 0.85), (r, r * 0.85), (-r, r * 0.85)]

        for dx, dy in cands:
            x, y = cx + dx, cy + dy
            r = (x - w / 2, y - h / 2, x + w / 2, y + h / 2)
            if r[0] < 4 or r[2] > self.canvas_w - 4:      # 别超出画布
                continue
            if any(rects_overlap(r, b) for b in self.boxes):
                continue
            if any(rects_overlap(r, b) for b in self.taken):
                continue
            self.taken.append(r)
            return x, y, True
        # 全都被占：退化为最靠近的候选，并记一次冲突
        dx, dy = cands[0]
        x, y = cx + dx, cy + dy
        self.taken.append((x - w / 2, y - h / 2, x + w / 2, y + h / 2))
        self.conflicts += 1
        return x, y, False


def render_relations(classes: list[Klass], relations: list[Relation],
                     ox: float = 0.0, oy: float = 0.0,
                     canvas_w: float = 0.0) -> str:
    """ox / oy 是整体偏移：类框被下移了顶部通道带的高度，关系线要跟着一起下移。"""
    by_name = {k.name: k for k in classes}
    drawn: list[str] = []
    slot_counter: dict[tuple[int, int], int] = {}
    lane_used = 0
    # 类框在下移后的坐标系里的占位（+ox/+oy），装箱器要靠它避让
    box_rects = [
        (k.x + ox, k.y + oy, k.x + k.w + ox, k.y + k.h + oy) for k in classes
    ]
    packer = LabelPacker(box_rects, canvas_w or (max(b[2] for b in box_rects) + 200))

    for rel in relations:
        src = by_name.get(rel.left)
        dst = by_name.get(rel.right)
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

        # 跨 2 列以上的关系各自占用一条顶部通道，避免横线穿过中间列的类框
        lane_index = 0
        if a.column != b.column and abs(a.column - b.column) >= 2:
            lane_index = lane_used
            lane_used += 1

        s, t, mode = anchor_points(a, b, slot, classes, lane_index)
        d = path_d(s, t, mode)

        dashed = arrow in ("..>",)
        color = C["rel_strong"] if arrow in ("*--", "o--") else C["rel"]
        dash_attr = ' stroke-dasharray="5 4"' if dashed else ""
        drawn.append(
            f'<path d="{d}" fill="none" stroke="{color}" stroke-width="1.5"{dash_attr} '
            f'marker-end="url(#{marker_id(arrow)})"/>'
        )

        # 端点朝向：决定菱形/箭头朝向与多重性标签位置
        on_lane = mode.startswith("lane")
        if on_lane:
            direction = "left" if t[0] < s[0] else "right"
        elif mode.startswith("chan") or mode.startswith("gap"):
            direction = "left"
        else:
            direction = "left" if t[0] < s[0] else "right"
        near_mode = mode.startswith(("chan", "gap"))

        if arrow == "*--":
            drawn.append(diamond(*t, direction=direction, color=C["rel_strong"], filled=True))
        elif arrow == "o--":
            drawn.append(diamond(*t, direction=direction, color=C["rel_strong"], filled=False))
        elif arrow == "--|>":
            drawn.append(arrow_head(*t, direction=direction, color=C["rel_strong"], kind="hollow"))

        # 多重性与关系名：交给装箱器找不压框、不互相压的位置
        lm = rel.left_mult if not backward else rel.right_mult
        rm = rel.right_mult if not backward else rel.left_mult

        if near_mode:
            anchors = [(s[0] + 20, s[1], lm, "mult"), (t[0] - 20, t[1], rm, "mult")]
        elif on_lane:
            anchors = [(s[0], s[1] - 12, lm, "mult"), (t[0], t[1] + 16, rm, "mult")]
        else:
            anchors = [(s[0], s[1] - 13, lm, "mult"), (t[0], t[1] - 13, rm, "mult")]

        for cx, cy, label, kind in anchors:
            if not label:
                continue
            # s/t 是"未下移"坐标，装箱判定要用下移后的真实位置
            x, y, _ok = packer.place(cx + ox, cy + oy, label, kind)
            drawn.append(mult_label(x, y, label, C["muted"]))

        if rel.label:
            mid = midpoint_of_path(s, t, mode)
            x, y, _ok = packer.place(mid[0] + ox, mid[1] + oy, rel.label, "name")
            drawn.append(label_chip(x, y, rel.label))

    return "".join(drawn)


def marker_id(arrow: str) -> str:
    if arrow == "..>":
        return "arrow-open"
    if arrow in ("*--", "o--", "--|>"):
        return "arrow-none"
    return "arrow-filled"


def midpoint_of_path(s, t, mode) -> tuple[float, float]:
    sx, sy = s
    tx, ty = t
    if mode.startswith(("chan", "gap")):
        x = float(mode[4:]) if mode.startswith("chan") else float(mode[3:])
        # 列间通道通常只有几十像素宽，把关系名左右居中在通道里最安全
        return (sx + tx) / 2, (sy + ty) / 2
    if mode.startswith("lane"):
        y = float(mode[5:]) if mode.startswith("laneL") else float(mode[4:])
        return (sx + tx) / 2, y - 11
    if abs(sy - ty) < 1.5:
        return (sx + tx) / 2, sy - 16
    return (sx + tx) / 2, (sy + ty) / 2


# 顶部通道占用的总高度（标题 1 行 + 通道若干条）
TOP_BAND = 186


def render_svg(classes, relations, notes) -> tuple[str, float, float]:
    width, height = layout(classes)
    body: list[str] = []

    # 标题放在左上角，通道之下。
    # 副标题要根据实际通道条数往下让位，否则会被横向走线压住。
    n_lanes = sum(1 for r in relations if abs(
        next(k.column for k in classes if k.name == r.left)
        - next(k.column for k in classes if k.name == r.right)
    ) >= 2)
    band = max(TOP_BAND, LANE_BASE + n_lanes * LANE_H + 34)

    body.append(
        f'<text x="{PAD}" y="20" font-size="24" font-weight="700" font-family="{FONT}" '
        f'fill="{C["text"]}" letter-spacing="-0.5">SportsBuddy · 领域类图</text>'
    )
    body.append(
        f'<text x="{width - PAD}" y="20" font-size="12.5" font-family="{FONT}" '
        f'fill="{C["faint"]}" text-anchor="end">依据后端接口契约（19 个接口 / {len(classes)} 个类 / {len(relations)} 条关系）</text>'
    )
    body.append(
        f'<text x="{PAD}" y="{band - 14:.0f}" font-size="11.5" font-family="{FONT}" '
        f'fill="{C["faint"]}">顶部 {n_lanes} 条横向线是跨列关系的"走线通道"：'
        f'通道位于所有类框之上，因此不会穿过任何类框</text>'
    )

    body.append(f'<g transform="translate(0,{band:.0f})">')
    # 关系与类框都在这个分组里，所以偏移统一传 band：
    # 装箱器拿到的是"下移后"的真实坐标，标签才不会压住类框
    body.append(render_relations(classes, relations, 0.0, band, canvas_w=width))
    for k in classes:
        body.append(render_class(k))
    body.append("</g>")

    # 图例放在内容下方
    legend_y = band + height + 6
    body.append(render_legend(PAD, legend_y))

    total_h = band + height + BOTTOM_PAD
    svg = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {width:.0f} {total_h:.0f}"
  width="{width:.0f}" height="{total_h:.0f}" font-family="{FONT}">
  <defs>
    <marker id="arrow-filled" viewBox="0 0 12 12" refX="10" refY="6" markerWidth="9" markerHeight="9" orient="auto-start-reverse">
      <path d="M 0 1 L 11 6 L 0 11 z" fill="{C["rel"]}"/>
    </marker>
    <marker id="arrow-open" viewBox="0 0 12 12" refX="10" refY="6" markerWidth="9" markerHeight="9" orient="auto-start-reverse">
      <path d="M 1 1 L 10 6 L 1 11" fill="none" stroke="{C["rel"]}" stroke-width="1.6"/>
    </marker>
    <marker id="arrow-none" viewBox="0 0 1 1" refX="0" refY="0" markerWidth="1" markerHeight="1">
      <path d="M0,0"/>
    </marker>
  </defs>
  <rect x="0" y="0" width="{width:.0f}" height="{total_h:.0f}" fill="{C["bg"]}"/>
  {"".join(body)}
</svg>
'''
    return svg, width, total_h


def render_legend(x: float, y: float) -> str:
    items = [
        ("relation", "1 → 0..*", "一对多关联"),
        ("composition", "◆——", "组合（整体-部分，不可独立存在）"),
        ("aggregation", "◇——", "聚合（可独立存在）"),
        ("dependency", "┄┄▷", "依赖 / 使用"),
    ]
    out = [f'<g transform="translate({x},{y})">']
    out.append(
        f'<text x="0" y="0" font-size="13" font-weight="650" font-family="{FONT}" '
        f'fill="{C["text"]}">图例</text>'
    )
    cx = 0
    for kind, glyph, text in items:
        w = text_width(text, 12) + text_width(glyph, 12) + 34
        out.append(
            f'<rect x="{cx}" y="12" width="{w:.0f}" height="30" rx="9" fill="{C["box"]}" '
            f'stroke="{C["line"]}"/>'
        )
        out.append(
            f'<text x="{cx + 12}" y="32" font-size="12" font-family="{MONO}" fill="{C["rel_strong"]}">'
            f'{escape(glyph)}</text>'
        )
        out.append(
            f'<text x="{cx + 12 + text_width(glyph, 12) + 10:.0f}" y="32" font-size="12" '
            f'font-family="{FONT}" fill="{C["muted"]}">{escape(text)}</text>'
        )
        cx += w + 10
    out.append("</g>")
    return "".join(out)


def render_html(svg_body: str, classes: list[Klass], relations: list[Relation],
                width: float, height: float) -> str:
    """生成一个可缩放查看的类图页面（内联 SVG，无需外网与 JS 库）。"""
    # 免去外层 <svg> 标签，直接内联
    inner = svg_body
    key_rows = "".join(
        f"<tr><td><b>{escape(k.name)}</b></td><td>{escape(k.stereotype or '—')}</td>"
        f"<td>{len([m for m in k.members if m.kind == 'attr' or m.kind == 'enum'])}</td>"
        f"<td>{len([m for m in k.members if m.kind == 'method'])}</td>"
        f"<td><code>{escape('、'.join(m.name for m in k.members[:6]))}"
        f"{' …' if len(k.members) > 6 else ''}</code></td></tr>"
        for k in classes
    )
    rel_rows = "".join(
        f"<tr><td><code>{escape(r.left)}</code></td>"
        f"<td>{escape(r.arrow)}</td>"
        f"<td><code>{escape(r.right)}</code></td>"
        f"<td>{escape(r.left_mult or '')} → {escape(r.right_mult or '')}</td>"
        f"<td>{escape(r.label or '—')}</td></tr>"
        for r in relations
    )
    return f"""<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>SportsBuddy · 领域类图</title>
<style>
  :root {{ --ink:#16181d; --ink2:#4a5060; --ink3:#7b8398; --line:#dfe3ec; --brand:#ff6a3d; }}
  * {{ box-sizing: border-box; }}
  body {{ margin:0; background:#f2f4f9; color:var(--ink); font-size:14px; line-height:1.6;
    font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif; }}
  header {{ background:linear-gradient(135deg,#262a36,#3d4351); color:#fff; padding:26px 32px; }}
  header h1 {{ margin:0; font-size:23px; letter-spacing:-.02em; }}
  header p {{ margin:8px 0 0; color:rgba(255,255,255,.72); font-size:13px; max-width:960px; }}
  header code {{ background:rgba(255,255,255,.14); border-radius:5px; padding:1px 6px; font-size:12.5px; }}
  nav {{ margin-top:14px; display:flex; gap:8px; flex-wrap:wrap; }}
  nav a {{ border:1px solid rgba(255,255,255,.25); border-radius:999px; padding:6px 14px;
    color:#fff; text-decoration:none; font-size:13px; }}
  nav a:hover {{ background:rgba(255,255,255,.12); }}
  nav a[aria-current] {{ background:var(--brand); border-color:var(--brand); }}
  main {{ padding:24px 32px 70px; }}
  .panel {{ background:#fff; border:1px solid var(--line); border-radius:16px; padding:16px;
    box-shadow:0 6px 20px rgba(24,28,40,.06); overflow:auto; }}
  .panel h2 {{ margin:0 0 10px; font-size:15px; }}
  .tables {{ display:grid; grid-template-columns:repeat(auto-fit,minmax(360px,1fr)); gap:18px; margin-top:22px; }}
  table {{ width:100%; border-collapse:collapse; font-size:12.5px; }}
  th, td {{ text-align:left; padding:6px 9px; border-bottom:1px solid var(--line); vertical-align:top; }}
  th {{ color:var(--ink3); font-size:11.5px; font-weight:600; }}
  code {{ font-family:ui-monospace,Consolas,monospace; font-size:12px; }}
  .legend {{ margin-top:6px; color:var(--ink3); font-size:12.5px; }}
  .tools {{ margin-bottom:12px; display:flex; gap:8px; flex-wrap:wrap; align-items:center; }}
  .tools button {{ font:inherit; font-size:13px; font-weight:600; border:1px solid var(--line);
    background:#fff; border-radius:9px; padding:6px 12px; cursor:pointer; color:var(--ink2); }}
  .tools button:hover {{ background:#f4f6fa; }}
  .stage {{ overflow:auto; max-height:78vh; border-radius:12px; background:#f7f8fc; }}
  .stage svg {{ display:block; }}
</style>
</head>
<body>
<header>
  <h1>SportsBuddy · 领域类图</h1>
  <p>
    依据 <code>sportmate后端.zip</code> 的接口契约绘制：<b>{len(classes)} 个类</b>、
    <b>{len(relations)} 条关系</b>。属性的类型与命名跟 JSON 字段、前端代码一一对应。
    源文件是 <code>docs/diagrams/class-diagram.mmd</code>，可贴到任意 Mermaid 编辑器里重新渲染。
  </p>
  <nav>
    <a href="../../prototype/index.html">原型总览</a>
    <a href="../../prototype/screens.html">界面原型</a>
    <a href="../../prototype/wireframe.html">页面结构与跳转</a>
    <a href="./class-diagram.html" aria-current="page">类图</a>
  </nav>
</header>
<main>
  <div class="tools">
    <button type="button" onclick="zoom(1.15)">放大</button>
    <button type="button" onclick="zoom(0.87)">缩小</button>
    <button type="button" onclick="fit()">适应宽度</button>
    <button type="button" onclick="actual()">原始大小（{width:.0f}×{height:.0f}）</button>
    <span class="legend">提示：图内可直接按住 Ctrl + 滚轮缩放</span>
  </div>
  <div class="panel">
    <div class="stage" id="stage">
{inner}
    </div>
  </div>

  <div class="tables">
    <div class="panel">
      <h2>类清单（{len(classes)}）</h2>
      <table>
        <thead><tr><th>类</th><th>构造型</th><th>属性</th><th>操作</th><th>主要字段</th></tr></thead>
        <tbody>{key_rows}</tbody>
      </table>
    </div>
    <div class="panel">
      <h2>关系清单（{len(relations)}）</h2>
      <table>
        <thead><tr><th>源</th><th>关系</th><th>目标</th><th>多重性</th><th>说明</th></tr></thead>
        <tbody>{rel_rows}</tbody>
      </table>
    </div>
  </div>
</main>
<script>
  let scale = 1
  const stage = document.getElementById('stage')
  const svg = stage.querySelector('svg')
  const W = {width:.0f}, H = {height:.0f}
  function apply() {{
    svg.setAttribute('width', W * scale)
    svg.setAttribute('height', H * scale)
  }}
  function zoom(k) {{ scale = Math.min(3, Math.max(0.2, scale * k)); apply() }}
  function actual() {{ scale = 1; apply() }}
  function fit() {{
    const avail = stage.clientWidth - 8
    scale = Math.max(0.2, avail / W)
    apply()
  }}
  window.addEventListener('load', fit)
  window.addEventListener('resize', () => {{ if (scale < 1) fit() }})
</script>
</body>
</html>
"""


# ============================================================================
# 8. 入口
# ============================================================================

def main() -> int:
    parser = argparse.ArgumentParser(description="把 .mmd 渲染成 SVG 类图")
    parser.add_argument("--check", action="store_true", help="只做解析检查，不写文件")
    parser.add_argument("--input", default=str(MMD))
    parser.add_argument("--out", default=str(DIAGRAM_DIR / "class-diagram.svg"))
    args = parser.parse_args()

    path = Path(args.input)
    if not path.exists():
        print(f"[错误] 找不到 {path}", file=sys.stderr)
        return 1

    text = path.read_text(encoding="utf-8")
    classes, relations, notes = parse_mmd(text)

    unknown = [r for r in relations if r.left not in {c.name for c in classes}
               or r.right not in {c.name for c in classes}]
    if unknown:
        print("[错误] 关系里引用了未定义的类：", file=sys.stderr)
        for r in unknown:
            print(f"  - {r.left} {r.arrow} {r.right}", file=sys.stderr)
        return 1

    print(f"解析完成：{len(classes)} 个类、{len(relations)} 条关系、{len(notes)} 行说明")
    for k in classes:
        print(f"  · {k.name:<18} <<{k.stereotype or '-'}>>  {len(k.members)} 个成员")

    if args.check:
        return 0

    svg, w, h = render_svg(classes, relations, notes)
    out = Path(args.out)
    out.write_text(svg, encoding="utf-8")
    print(f"\n已写出 {out.relative_to(ROOT)}  ({w:.0f} × {h:.0f})")

    html = render_html(svg, classes, relations, w, h)
    html_path = DIAGRAM_DIR / "class-diagram.html"
    html_path.write_text(html, encoding="utf-8")
    print(f"已写出 {html_path.relative_to(ROOT)}（可缩放查看 + 类/关系清单表）")
    return 0


if __name__ == "__main__":
    sys.exit(main())
