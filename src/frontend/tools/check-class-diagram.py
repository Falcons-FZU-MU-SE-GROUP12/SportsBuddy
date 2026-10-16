#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
校验渲染出来的 SVG 类图（程序化的"看图"）
============================================================================
没有可用的无头浏览器，所以用几何方式检查这张图有没有画坏：

  1. XML 是否合法；
  2. 类框数量 / 名称是否与 .mmd 一致；
  3. 每个类框内的文本是否都在框内（不溢出、不重叠）；
  4. 连线是否穿过任何类框（正交走线的经典错误）；
  5. 画布是否把所有内容包住（不会截断）。

用法：python tools/check-class-diagram.py [--svg path]
"""

from __future__ import annotations

import argparse
import re
import sys
import xml.etree.ElementTree as ET
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SVG = ROOT / "docs" / "diagrams" / "class-diagram.svg"
MMD = ROOT / "docs" / "diagrams" / "class-diagram.mmd"

NS = "{http://www.w3.org/2000/svg}"
F = float


def parse_classes_from_mmd() -> list[str]:
    names = []
    for line in MMD.read_text(encoding="utf-8").splitlines():
        m = re.match(r"^\s*class\s+([A-Za-z_]\w*)", line)
        if m:
            names.append(m.group(1))
    return names


def segments_of_path(d: str) -> list[tuple[float, float, float, float]]:
    """把 M/H/V 组成的正交路径拆成线段。"""
    tokens = d.replace(",", " ").split()
    segs = []
    x = y = 0.0
    start = None
    i = 0
    while i < len(tokens):
        cmd = tokens[i]
        if cmd in "MHVL":
            if cmd == "M":
                x, y = F(tokens[i + 1]), F(tokens[i + 2])
                start = (x, y)
                i += 3
            elif cmd == "H":
                nx = F(tokens[i + 1])
                segs.append((x, y, nx, y))
                x = nx
                i += 2
            elif cmd == "V":
                ny = F(tokens[i + 1])
                segs.append((x, y, x, ny))
                y = ny
                i += 2
            elif cmd == "L":
                nx, ny = F(tokens[i + 1]), F(tokens[i + 2])
                segs.append((x, y, nx, ny))
                x, y = nx, ny
                i += 3
        else:
            i += 1
    return segs


def seg_intersects_rect(s, r, pad=1.5) -> bool:
    x1, y1, x2, y2 = s
    rx1, ry1, rx2, ry2 = r
    rx1 -= pad
    ry1 -= pad
    rx2 += pad
    ry2 += pad
    if abs(y1 - y2) < 0.01:      # 水平线
        if not (ry1 <= y1 <= ry2):
            return False
        lo, hi = sorted((x1, x2))
        return hi > rx1 and lo < rx2
    if abs(x1 - x2) < 0.01:      # 垂直线
        if not (rx1 <= x1 <= rx2):
            return False
        lo, hi = sorted((y1, y2))
        return hi > ry1 and lo < ry2
    return False


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--svg", default=str(SVG))
    args = ap.parse_args()

    svg_path = Path(args.svg)
    if not svg_path.exists():
        print(f"[错误] 找不到 {svg_path}", file=sys.stderr)
        return 1

    problems: list[str] = []
    ok_count = 0

    # 1) XML 合法性
    try:
        tree = ET.parse(svg_path)
        root = tree.getroot()
        ok_count += 1
        print("✓ SVG 是合法 XML")
    except ET.ParseError as e:
        print(f"✗ SVG 解析失败：{e}", file=sys.stderr)
        return 1

    vb = root.get("viewBox", "").split()
    canvas = (F(vb[0]), F(vb[1]), F(vb[2]), F(vb[3])) if len(vb) == 4 else None

    # 2) 类框
    # 类框分组带 translate(x,y)，框内矩形与文字都写在**该类的局部坐标系**里，
    # 所以这里准备两套坐标：
    #   boxes_local —— 局部坐标，用于"文字是否超出类框"（文字也是局部坐标）
    #   boxes       —— 画布绝对坐标（加分组位移），用于包围盒
    #   shifted     —— 绝对坐标 + 顶部通道位移，与连线同坐标系，用于穿框判定
    boxes_local = {}
    boxes = {}
    shifted = {}
    top_band = 0.0
    for g in root.iter(f"{NS}g"):
        if g.get("class") == "cls":
            name = g.get("data-name")
            rects = [r for r in g.iter(f"{NS}rect")]
            body = rects[1] if len(rects) > 1 else rects[0]
            bx, by = F(body.get("x")), F(body.get("y"))
            bw, bh = F(body.get("width")), F(body.get("height"))
            boxes_local[name] = (bx, by, bx + bw, by + bh)
            tr = g.get("transform") or ""
            tm = re.match(r"translate\(\s*([\d.+-]+)\s*,\s*([\d.+-]+)\s*\)", tr)
            ox, oy = (F(tm.group(1)), F(tm.group(2))) if tm else (0.0, 0.0)
            boxes[name] = (bx + ox, by + oy, bx + bw + ox, by + bh + oy)
        # 找到"包住所有类框的那个分组"的 translate(0,TOP_BAND) 位移。
        # 用 findall 只找直接子元素：类框分组自己也是带 translate 的 g，
        # 用 iter 会把自身算进去，导致把所有类框再加一遍位移。
        tr2 = g.get("transform") or ""
        m = re.match(r"translate\(\s*[\d.+-]+\s*,\s*([\d.+-]+)\s*\)", tr2)
        if m and len([x for x in g.findall(f"{NS}g") if x.get("class") == "cls"]) >= 2:
            top_band = F(m.group(1))

    if top_band:
        for k, b in boxes.items():
            shifted[k] = (b[0], b[1] + top_band, b[2], b[3] + top_band)
        print(f"· 类框整体下移 {top_band:.0f}px（让出顶部走线通道）")

    expected = parse_classes_from_mmd()
    missing = [n for n in expected if n not in boxes]
    extra = [n for n in boxes if n not in expected]
    if missing:
        problems.append(f"缺少类框：{missing}")
    if extra:
        problems.append(f"多出类框：{extra}")
    if not missing and not extra:
        ok_count += 1
        print(f"✓ 类框数量与 .mmd 一致（{len(expected)} 个）")

    # 3) 文本是否在框内（文字与类框同为"类内局部坐标"，直接比较）
    overflow = []
    for name, box in boxes_local.items():
        g = next((x for x in root.iter(f"{NS}g") if x.get("data-name") == name), None)
        if g is None:
            continue
        # 类内文字写在该类分组的局部坐标系里，而 boxes 已经把分组位移算进去了，
        # 所以这里直接用文字自身坐标即可。
        for t in g.iter(f"{NS}text"):
            tx = F(t.get("x"))
            ty = F(t.get("y"))
            anchor = t.get("text-anchor", "start")
            size = F(t.get("font-size", "12"))
            content = "".join(t.itertext())
            w = 0.0
            for ch in content:
                import unicodedata
                w += 1.0 if unicodedata.east_asian_width(ch) in ("W", "F") else 0.55
            w *= size
            if anchor == "middle":
                x1, x2 = tx - w / 2, tx + w / 2
            elif anchor == "end":
                x1, x2 = tx - w, tx
            else:
                x1, x2 = tx, tx + w
            if x1 < box[0] + 1 or x2 > box[2] - 1 or ty > box[3] - 2 or ty - size < box[1] - 1:
                overflow.append(
                    f"{name}: 「{content[:26]}」 x=[{x1:.0f},{x2:.0f}] 框=[{box[0]:.0f},{box[2]:.0f}] y={ty:.0f}"
                )
    if overflow:
        problems.append("文本超出类框：\n      " + "\n      ".join(overflow[:10]))
    else:
        ok_count += 1
        print("✓ 所有类框内文本都在框内（无溢出）")

    # 4) 连线是否穿过类框（用下移后的坐标，与路径同坐标系）
    crossings = []
    rects_for_check = shifted or boxes
    for p in root.iter(f"{NS}path"):
        d = p.get("d") or ""
        if not d.startswith("M") or ("V" not in d and "H" not in d):
            continue
        segs = segments_of_path(d)
        for s in segs:
            for name, box in rects_for_check.items():
                # 端点落在框边（正交走线的终点就在框上），所以要把框往里收缩 7px
                # 再判定，避免把"正常贴边接入"误报成"穿过类框"。
                if seg_intersects_rect(s, box, pad=-7.0):
                    crossings.append(f"连线 {d[:46]}… 穿过 {name}")
                    break
    if crossings:
        problems.append("连线穿过类框：\n      " + "\n      ".join(sorted(set(crossings))[:8]))
    else:
        ok_count += 1
        print("✓ 没有连线穿过类框")

    # 5) 画布包围盒（用连线坐标系 = 下移后的类框坐标）
    if canvas:
        rects_final = shifted or boxes
        max_x = max(b[2] for b in rects_final.values())
        max_y = max(b[3] for b in rects_final.values()) + 90   # 预留图例高度
        if max_x > canvas[2] or max_y > canvas[3]:
            problems.append(
                f"画布装不下内容：内容右下角 ({max_x:.0f},{max_y:.0f}) > 画布 ({canvas[2]:.0f},{canvas[3]:.0f})"
            )
        else:
            ok_count += 1
            print(f"✓ 画布 {canvas[2]:.0f}×{canvas[3]:.0f} 完整包住内容（含图例，右下角 {max_x:.0f},{max_y:.0f}）")

    print()
    if problems:
        print(f"发现 {len(problems)} 个问题：")
        for pr in problems:
            print(f"  · {pr}")
        return 1
    print(f"全部通过：{ok_count} 项检查")
    return 0


if __name__ == "__main__":
    sys.exit(main())
