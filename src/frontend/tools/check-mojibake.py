#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
乱码检查：确认渲染出来的类图里没有"方框/豆腐块"，也没有字体缺字
============================================================================
背景：这个坑踩过两次，所以单独做成一个校验脚本。

  坑 1：方法行被解析器误判成属性，走了"等宽字体"渲染分支；
  坑 2：Consolas 等宽字体**没有中日韩字形**，渲染中文会得到一串方框。

注意 Pillow 的 font.getmask(ch).getbbox() 不可靠：
字体缺字时会画出 .notdef 方框，getbbox() 依然返回非空，看起来"有字形"。
所以这里改用 fontTools 的 cmap 表做真实覆盖判定；没有 fontTools 时
退化为"渲染出来是否为豆腐块"的像素启发式判断。

用法：python tools/check-mojibake.py
"""

from __future__ import annotations

import importlib.util
import sys
import unicodedata
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
MMD = ROOT / "docs" / "diagrams" / "class-diagram.mmd"

FONTS = {
    "r": (r"C:\Windows\Fonts\msyh.ttc", 0, "Microsoft YaHei"),
    "b": (r"C:\Windows\Fonts\msyhbd.ttc", 0, "Microsoft YaHei Bold"),
    "m": (r"C:\Windows\Fonts\consola.ttf", 0, "Consolas"),
}

spec = importlib.util.spec_from_file_location("rcd", ROOT / "tools" / "render-class-diagram.py")
rcd = importlib.util.module_from_spec(spec)
sys.modules["rcd"] = rcd
spec.loader.exec_module(rcd)


# ---------------------------------------------------------------------------
# 真实的字形覆盖判定
# ---------------------------------------------------------------------------

def cmap_of(path: str, index: int) -> set[int] | None:
    """用 fontTools 读 cmap；装不上就返回 None（走启发式兜底）。"""
    try:
        from fontTools.ttLib import TTFont, TTCollection
    except Exception:
        return None
    try:
        if path.lower().endswith(".ttc"):
            font = TTCollection(path).fonts[index]
        else:
            font = TTFont(path)
        covered: set[int] = set()
        for table in font["cmap"].tables:
            covered.update(table.cmap.keys())
        return covered
    except Exception:
        return None


def renders_as_tofu(ch: str, font: ImageFont.FreeTypeFont) -> bool:
    """
    启发式：把字符和"\uFFFF"（几乎肯定没有字形）分别渲染，
    如果两者位图完全一样，说明这个字符也落到了 .notdef 上 → 是豆腐块。
    """
    ref = font.getmask("\uffff")
    got = font.getmask(ch)
    try:
        return bytes(ref) == bytes(got) and ref.size == got.size
    except Exception:
        return False


def main() -> int:
    problems: list[str] = []
    checks = 0

    text = MMD.read_text(encoding="utf-8")
    classes, relations, _ = rcd.parse_mmd(text)

    # 收集图里会出现的**所有**文本（成员名、类型、方法、枚举注释、构造型、关系名）
    texts: set[str] = set()
    for k in classes:
        texts.add(k.name)
        if k.stereotype:
            texts.add(k.stereotype)
        for mem in k.members:
            texts.add(mem.render)
            if mem.name:
                texts.add(mem.name)
            if mem.type:
                texts.add(mem.type)
    for r in relations:
        if r.label:
            texts.add(r.label)
        texts.add(r.left)
        texts.add(r.right)

    print(f"图中文本片段共 {len(texts)} 个\n")

    # ---- 1) 字体覆盖：每个字体是否覆盖它被分配到的所有字符 ----------------
    cmaps = {k: cmap_of(*v[:2]) for k, v in FONTS.items()}
    for kind, (path, index, name) in FONTS.items():
        cm = cmaps[kind]
        print(f"· {name:22s} cmap 覆盖检查：{'可用' if cm else '不可用（用启发式兜底）'}")

    # 判定每个文本片段"实际会用到哪个字体"（与渲染器的逻辑一致）
    assigned_bad: list[str] = []
    for s in sorted(texts):
        kind = rcd.font_for(s) if hasattr(rcd, "font_for") else "r"
        chosen = "m" if kind.endswith("MONO") or kind == "m" else "r"
        cm = cmaps.get(chosen)
        if cm is None:
            continue
        missing = [c for c in s if ord(c) > 127 and ord(c) not in cm]
        if missing:
            assigned_bad.append(f"{s!r} 用的字体={FONTS[chosen][2]} 缺字 {''.join(missing)}")
    if assigned_bad:
        problems.append(
            "以下文本被分配到了没有对应字形的字体（渲染出来是方框）：\n      "
            + "\n      ".join(assigned_bad[:12])
        )
    else:
        checks += 1
        print("✓ 每段文本分配到的字体都覆盖它自己的字符")

    # ---- 2) 关键字体对全部字符的覆盖（正文/粗体必须覆盖所有中文）---------
    allchars = sorted({c for s in texts for c in s if ord(c) > 127})
    for kind, name in (("r", "Microsoft YaHei"), ("b", "Microsoft YaHei Bold")):
        cm = cmaps.get(kind)
        if cm is None:
            continue
        missing = [c for c in allchars if ord(c) not in cm]
        if missing:
            problems.append(f"{name} 缺 {len(missing)} 个字：{''.join(missing[:20])}")
        else:
            checks += 1
            print(f"✓ {name} 覆盖图中全部 {len(allchars)} 个非 ASCII 字符")

    # ---- 3) 方法行必须被识别为 method ------------------------------------
    methods = [(k.name, m) for k in classes for m in k.members if m.kind == "method"]
    enum_like = [
        (k.name, m) for k in classes for m in k.members
        if m.kind == "attr" and "(" in m.name
    ]
    if enum_like:
        problems.append(
            f"有 {len(enum_like)} 行含括号却被当成属性（会走等宽字体 → 中文变方框）："
            + ", ".join(f"{c}.{m.name}" for c, m in enum_like[:6])
        )
    else:
        checks += 1
        print(f"✓ 含括号的成员都识别为方法（共 {len(methods)} 个），不会误走等宽字体分支")

    # ---- 4) 像素兜底：把每个中文字渲染一遍，看是否为豆腐块 --------------
    f_reg = ImageFont.truetype(FONTS["r"][0], 28, index=FONTS["r"][1])
    tofu = [c for c in allchars if renders_as_tofu(c, f_reg)]
    if tofu:
        problems.append(f"正文字体渲染成豆腐块的字符：{''.join(tofu[:20])}")
    else:
        checks += 1
        print(f"✓ 正文字体渲染 {len(allchars)} 个字符都不是豆腐块")

    # 明确验证：等宽字体确实不能渲染中文（这就是当初的 bug 来源）
    f_mono = ImageFont.truetype(FONTS["m"][0], 28, index=FONTS["m"][1])
    sample = "注册取消"
    mono_tofu = [c for c in sample if renders_as_tofu(c, f_mono)]
    if mono_tofu:
        print(f"· 提醒：Consolas 渲染中文会变方框（实测 {''.join(mono_tofu)}），"
              f"因此渲染器必须对这些文本回退到正文字体")

    print()
    if problems:
        print(f"发现 {len(problems)} 个问题：")
        for p in problems:
            print(f"  · {p}")
        return 1
    print(f"全部通过：{checks} 项检查，未发现乱码风险")
    return 0


if __name__ == "__main__":
    sys.exit(main())
