#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
把界面原型渲染成 JPG
============================================================================
为什么需要这个脚本：
  这台机器的沙盒禁止 Chromium 的进程间通信（platform_channel.cc: Check failed），
  Edge 无头模式起不来，所以没法"给网页截图"。这里改用 Pillow 按同一套设计令牌
  和 CSS 尺寸，把 prototype/screens.html 里的 12 个画面逐像素重画成 JPG。

输出（out/prototype-jpg/）：
  P-01..P-12 的单屏 JPG     —— 每张就是一台手机的一屏，可直接贴进报告/PPT
  00-总览.jpg               —— 12 屏拼版总览
  字号/间距/配色与 frontend/assets/css/app.css 保持一致，改样式时请同步这里。

用法：
  python tools/render-prototype-jpg.py                # 全部渲染
  python tools/render-prototype-jpg.py --only=P-02    # 只渲染指定屏
  python tools/render-prototype-jpg.py --scale=3      # 提高分辨率（默认 2x）
"""

from __future__ import annotations

import argparse
import math
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
OUT_DIR = ROOT / "out" / "prototype-jpg"

# ============================================================================
# 1. 设计令牌（与 frontend/assets/css/app.css 的 :root 一一对应）
# ============================================================================

C = {
    "brand": (255, 106, 61),
    "brand_600": (242, 84, 45),
    "brand_100": (255, 241, 235),
    "accent": (18, 181, 165),
    "accent_100": (230, 248, 246),
    "ink": (22, 24, 29),
    "ink2": (74, 80, 96),
    "ink3": (123, 131, 152),
    "ink4": (169, 176, 192),
    "line": (237, 239, 244),
    "line2": (224, 228, 236),
    "surface": (255, 255, 255),
    "surface2": (246, 247, 251),
    "bg": (242, 244, 249),
    "ok": (16, 163, 127),
    "ok_bg": (232, 248, 242),
    "warn": (192, 120, 0),
    "warn_bg": (255, 246, 224),
    "danger": (217, 45, 75),
    "danger_bg": (253, 236, 239),
    "info": (47, 111, 208),
    "info_bg": (234, 242, 254),
    "star": (255, 176, 32),
    "star_off": (217, 221, 231),
    "nlp_bg1": (43, 47, 58),
    "nlp_bg2": (69, 75, 92),
    "white": (255, 255, 255),
    "credit_warn": (243, 201, 141),
}

FONT_REG = r"C:\Windows\Fonts\msyh.ttc"
FONT_BOLD = r"C:\Windows\Fonts\msyhbd.ttc"
FONT_MONO = r"C:\Windows\Fonts\consola.ttf"
FONT_EMOJI = r"C:\Windows\Fonts\seguiemj.ttf"

# 画布逻辑尺寸（等于 CSS 里的 390×844，再乘 scale 得到实际像素）
PHONE_W, PHONE_H = 390, 844
STATUS_H = 30
APPBAR_H = 52
TABBAR_H = 58

_font_cache: dict[tuple[str, int], ImageFont.FreeTypeFont] = {}


def font(kind: str, size: int) -> ImageFont.FreeTypeFont:
    key = (kind, size)
    if key not in _font_cache:
        path = {"r": FONT_REG, "b": FONT_BOLD, "m": FONT_MONO}[kind]
        _font_cache[key] = ImageFont.truetype(path, size)
    return _font_cache[key]


# ============================================================================
# 2. 绘图助手
# ============================================================================

class Pen:
    """把常用绘制动作（卡片、标签、进度条…）包一层，屏幕定义写起来就接近 CSS。"""

    def __init__(self, draw: ImageDraw.ImageDraw, scale: int):
        self.d = draw
        self.s = scale

    # ---------- 基础 ----------
    def px(self, v: float) -> int:
        return int(round(v * self.s))

    def rect(self, x, y, w, h, fill=None, outline=None, width=1, radius=0):
        box = [self.px(x), self.px(y), self.px(x + w), self.px(y + h)]
        r = self.px(radius) if radius else 0
        kw = {}
        if fill is not None:
            kw["fill"] = fill
        if outline is not None:
            kw["outline"] = outline
            kw["width"] = max(1, self.px(width))
        if r:
            self.d.rounded_rectangle(box, radius=r, **kw)
        else:
            self.d.rectangle(box, **kw)
        return y + h

    def text(self, x, y, s, size=14, color=C["ink"], kind="r", anchor="la", max_w=None):
        """max_w 给定时会自动按宽度缩略（超过就省略号）。"""
        f = font(kind, self.px(size))
        if max_w is not None:
            s = self._ellipsize(s, f, self.px(max_w))
        self.d.text((self.px(x), self.px(y)), s, font=f, fill=color, anchor=anchor)
        return y

    def _ellipsize(self, s: str, f, limit: int) -> str:
        if self.d.textlength(s, font=f) <= limit:
            return s
        while s and self.d.textlength(s + "…", font=f) > limit:
            s = s[:-1]
        return s + "…"

    def tw(self, s: str, size=14, kind="r") -> float:
        """文本宽度（逻辑像素）。"""
        return self.d.textlength(s, font=font(kind, self.px(size))) / self.s

    def emoji(self, x, y, ch, size=20):
        f = ImageFont.truetype(FONT_EMOJI, self.px(size))
        self.d.text((self.px(x), self.px(y)), ch, font=f, embedded_color=True)

    def line(self, x1, y1, x2, y2, color=C["line"], width=1):
        self.d.line(
            [self.px(x1), self.px(y1), self.px(x2), self.px(y2)],
            fill=color,
            width=max(1, self.px(width)),
        )

    def vgrad(self, x, y, w, h, c1, c2):
        """竖向渐变（用于深色的一句话找局卡片与头像底色）。"""
        X, Y, W, H = self.px(x), self.px(y), self.px(w), self.px(h)
        for i in range(H):
            t = i / max(1, H - 1)
            col = tuple(int(c1[k] + (c2[k] - c1[k]) * t) for k in range(3))
            self.d.line([(X, Y + i), (X + W, Y + i)], fill=col)

    # ---------- 组件 ----------
    def card(self, x, y, w, h, fill=C["surface"], border=C["line"], radius=14):
        """带 1px 边框的卡片。返回卡片内容区起点 (x+pad, y+pad)。"""
        self.rect(x, y, w, h, fill=fill, outline=border, width=1, radius=radius)
        return x + 14, y + 14

    def tag(self, x, y, label, bg=C["surface2"], fg=C["ink2"], size=11, pad=7):
        w = self.tw(label, size) + pad * 2
        h = size + 8
        self.rect(x, y, w, h, fill=bg, radius=6)
        self.text(x + pad, y + h / 2, label, size=size, color=fg, anchor="lm")
        return x + w

    def tag_row(self, x, y, tags, gap=6):
        """一行标签，自动换行（返回结束后的 y）。"""
        cx, cy = x, y
        h = 0
        for label, bg, fg in tags:
            w = self.tw(label, 11) + 14
            if cx + w > x + 348:          # 超出右边界就换行
                cx, cy = x, cy + 19
            self.tag(cx, cy, label, bg, fg)
            cx += w + gap
            h = max(h, 19)
        return cy + h

    def pill_btn(self, x, y, w, h, label, bg, fg, size=14, radius=10, border=None):
        self.rect(x, y, w, h, fill=bg, outline=border, width=1, radius=radius)
        self.text(x + w / 2, y + h / 2, label, size=size, color=fg, anchor="mm", kind="b")
        return y + h

    def seats(self, x, y, w, joined, total, full=False):
        """名额进度条。"""
        self.rect(x, y, w, 6, fill=C["surface2"], radius=3)
        pct = min(1.0, joined / max(1, total))
        if pct > 0:
            self.rect(x, y, max(3, w * pct), 6, fill=(240, 165, 0) if full else C["accent"], radius=3)
        self.text(x, y + 10, f"已报名 {joined}/{total}", size=11, color=C["ink3"])
        self.text(x + w, y + 10, "名额已满" if full else f"还差 {total - joined} 人",
                  size=11, color=C["ink3"], anchor="ra")
        return y + 26

    def avatar(self, x, y, d, initial, size=11):
        self.rect(x, y, d, d, fill=C["surface2"], outline=C["line2"], width=1, radius=d / 2)
        self.text(x + d / 2, y + d / 2, initial, size=size, color=C["ink3"], anchor="mm", kind="b")

    def stars(self, x, y, score, size=20, gap=4):
        for i in range(5):
            col = C["star"] if i < score else C["star_off"]
            self.text(x + i * (size + gap), y, "★", size=size, color=col)
        return x + 5 * (size + gap)

    def close_x(self, cx, cy, arm=6, color=C["ink2"], width=2):
        """画一个 ×（字体里没有合适的叉号字形，直接画线更稳）。"""
        self.line(cx - arm, cy - arm, cx + arm, cy + arm, color, width)
        self.line(cx - arm, cy + arm, cx + arm, cy - arm, color, width)

    def pin(self, cx, cy, color=C["ink2"], size=14):
        """画一个定位图钉。
        注意：📍 在 Segoe UI Emoji 里没有字形，直接写会变成豆腐块，所以用几何图形画。
        """
        r = size * 0.36
        cy = cy - size * 0.12
        self.d.ellipse(
            [self.px(cx - r), self.px(cy - r), self.px(cx + r), self.px(cy + r)], fill=color
        )
        self.d.polygon(
            [self.px(cx - r * 0.85), self.px(cy + r * 0.5),
             self.px(cx + r * 0.85), self.px(cy + r * 0.5),
             self.px(cx), self.px(cy + r * 2.1)],
            fill=color,
        )

    def back_arrow(self, cx, cy, w=8, color=C["ink2"], width=2):
        self.line(cx + w / 2, cy - w, cx - w / 2, cy, color, width)
        self.line(cx - w / 2, cy, cx + w / 2, cy + w, color, width)


# ============================================================================
# 3. 手机外壳
# ============================================================================

def new_phone(scale: int):
    im = Image.new("RGB", (PHONE_W * scale, PHONE_H * scale), C["bg"])
    return im, Pen(ImageDraw.Draw(im), scale)


def status_bar(p: Pen, time_text="14:14", dark=False):
    fg = C["white"] if dark else C["ink"]
    p.text(20, STATUS_H / 2, time_text, size=12, color=fg, anchor="lm", kind="b")
    # 右侧：信号 / 电量（用简单几何图形画，避免字形缺失）
    x = PHONE_W - 22
    p.rect(x - 3, 12, 18, 9, outline=fg, width=1, radius=2)
    p.rect(x - 1, 14, 12, 5, fill=fg, radius=1)
    for i in range(3):
        p.rect(x - 30 + i * 5, 19 - i * 3, 3, 4 + i * 3, fill=fg, radius=1)


def appbar(p: Pen, title, sub=None, back=False, right=None, brand=False):
    y0 = STATUS_H
    p.rect(0, y0, PHONE_W, APPBAR_H, fill=C["white"])
    p.line(0, y0 + APPBAR_H, PHONE_W, y0 + APPBAR_H, C["line"])
    cy = y0 + APPBAR_H / 2
    x = 16
    if back:
        p.rect(16, cy - 16, 32, 32, fill=C["white"], outline=C["line2"], width=1, radius=9)
        p.back_arrow(32, cy)
        x = 58
    elif brand:
        p.rect(16, cy - 15, 30, 30, fill=C["brand"], radius=9)
        p.emoji(21, cy - 12, "🏸", size=16)
        p.text(54, cy, "SportsBuddy", size=15, color=C["ink"], anchor="lm", kind="b")
        x = 108
    if title:
        if sub:
            p.text(x, cy - 9, title, size=14, color=C["ink"], anchor="lm", kind="b")
            p.text(x, cy + 8, sub, size=10.5, color=C["ink3"], anchor="lm")
        else:
            p.text(x, cy, title, size=14, color=C["ink"], anchor="lm", kind="b")
    if right:
        label, right_kind = right
        w = p.tw(label, 12.5, "b") + 24
        if right_kind == "brand":
            p.pill_btn(PHONE_W - 16 - w, cy - 15, w, 30, label, C["brand"], C["white"], size=12.5, radius=9)
        else:
            p.pill_btn(PHONE_W - 16 - w, cy - 15, w, 30, label, C["white"], C["ink"], size=12.5, radius=9,
                       border=C["line2"])
    return y0 + APPBAR_H


TABS = [("🔍", "找局"), ("📋", "活动"), ("🎯", "我的局"), ("👤", "我的")]


def tabbar(p: Pen, active_index):
    y0 = PHONE_H - TABBAR_H
    p.rect(0, y0, PHONE_W, TABBAR_H, fill=C["white"])
    p.line(0, y0, PHONE_W, y0, C["line"])
    cw = PHONE_W / 4
    for i, (icon, label) in enumerate(TABS):
        cx = cw * (i + 0.5)
        on = i == active_index
        p.emoji(cx - 10, y0 + 11, icon, size=17)
        p.text(cx, y0 + 38, label, size=10.5,
               color=C["brand_600"] if on else C["ink3"], anchor="mm",
               kind="b" if on else "r")
    return y0


# ============================================================================
# 4. 复用的业务片段
# ============================================================================

SPORT_EMOJI = {
    "篮球": "🏀", "足球": "⚽", "羽毛球": "🏸", "乒乓球": "🏓", "网球": "🎾",
    "排球": "🏐", "跑步": "🏃", "游泳": "🏊", "健身": "🏋️", "骑行": "🚴",
}


def act_card(p: Pen, x, y, w, data, score=None, reasons=None, show_bar=True):
    """活动卡片。data 字段与后端 Activity 一致。"""
    pad = 14
    inner_x = x + pad
    inner_w = w - pad * 2
    head_h = 46
    tags_h = 26
    reason_h = 22 if reasons else 0
    bar_h = 40 if show_bar else 0
    foot_h = 44
    h = pad + head_h + 8 + tags_h + reason_h + bar_h + foot_h

    p.card(x, y, w, h)
    p.rect(x + 2, y, 4, h, fill=C["brand"], radius=2)   # 左侧色条

    # 头部：项目图标 + 标题 + 时间地点
    p.rect(inner_x, y + pad, 42, 42, fill=C["brand_100"], radius=12)
    p.emoji(inner_x + 10, y + pad + 9, SPORT_EMOJI.get(data["sport"], "🤸"), size=21)
    tx = inner_x + 52
    title_w = inner_w - 52 - (46 if score is not None else 0)
    p.text(tx, y + pad + 4, data["title"], size=14.5, color=C["ink"], kind="b", max_w=title_w)
    if p.tw(data["title"], 14.5, "b") > title_w:
        p.text(tx, y + pad + 23, data["title"][len(data["title"]) // 2:], size=14.5,
               color=C["ink"], kind="b", max_w=title_w)
    p.text(tx, y + pad + 26, f"{data['time']} · {data['campus']} {data['place']}",
           size=11, color=C["ink3"], max_w=inner_w - 52)
    if score is not None:
        # 分数取整（后端可能返回 100.0，界面上不要显示小数点）
        label = f"{score:g} 分"
        sw = p.tw(label, 11, "b") + 16
        p.rect(x + w - pad - sw, y + pad, sw, 19, fill=C["brand_100"], radius=99)
        p.text(x + w - pad - sw / 2, y + pad + 9.5, label, size=11, color=C["brand_600"],
               anchor="mm", kind="b")

    # 标签行
    ty = y + pad + head_h + 4
    tags = [(data["sport"], C["brand_100"], C["brand_600"])]
    tags.append((data["level"], C["info_bg"], C["info"]))
    st_bg, st_fg = data.get("status_colors", (C["ok_bg"], C["ok"]))
    tags.append((data["status"], st_bg, st_fg))
    tags.append((data["fee"], C["ok_bg"], C["ok"]))
    if data.get("gender"):
        tags.append((data["gender"], C["warn_bg"], C["warn"]))
    p.tag_row(inner_x, ty, tags)

    # 推荐理由
    cy = ty + tags_h
    if reasons:
        rx = inner_x
        for label in reasons:
            wd = p.tw(label, 11) + 14
            p.tag(rx, cy, label, C["ok_bg"], C["ok"])
            rx += wd + 6
        cy += reason_h

    # 名额进度
    if show_bar:
        p.seats(inner_x, cy + 4, inner_w, data["joined"], data["capacity"], full=data["joined"] >= data["capacity"])
        cy += bar_h

    # 底部：发起人 + 按钮
    p.line(inner_x, cy + 2, x + w - pad, cy + 2, C["line2"])
    p.avatar(inner_x, cy + 12, 22, data["org"][0])
    p.text(inner_x + 30, cy + 23, data["org"], size=11.5, color=C["ink2"], anchor="lm", kind="b")
    p.text(inner_x + 30 + p.tw(data["org"], 11.5, "b") + 8, cy + 23,
           f"信用 {data['credit']}", size=11, color=C["ink3"], anchor="lm")
    bw = 62
    if data["joined"] >= data["capacity"] or data["status"] != "可报名":
        p.pill_btn(x + w - pad - bw, cy + 9, bw, 28, "已满员" if data["joined"] >= data["capacity"] else data["status"],
                   C["surface2"], C["ink4"], size=12, radius=9)
    else:
        p.pill_btn(x + w - pad - bw, cy + 9, bw, 28, "报名", C["brand"], C["white"], size=12, radius=9)
    return y + h


# ============================================================================
# 5. 12 个画面
# ============================================================================

def screen_login(p: Pen):
    status_bar(p)
    top = STATUS_H
    p.rect(0, top, PHONE_W, PHONE_H - top, fill=(250, 245, 243))
    # logo
    p.rect(PHONE_W / 2 - 30, top + 40, 60, 60, fill=C["brand"], radius=19)
    p.emoji(PHONE_W / 2 - 15, top + 55, "🏸", size=30)
    p.text(PHONE_W / 2, top + 116, "SportsBuddy", size=21, color=C["ink"], anchor="mm", kind="b")
    p.text(PHONE_W / 2, top + 142, "校园运动组局 · 找到合适的搭子", size=11.5,
           color=C["ink3"], anchor="mm")

    x, y, w = 20, top + 170, PHONE_W - 40
    p.card(x, y, w, 392)
    # 分段开关
    p.rect(x + 14, y + 14, w - 28, 34, fill=C["surface2"], radius=99)
    p.rect(x + 15, y + 15, (w - 30) / 2, 32, fill=C["white"], radius=99,
           outline=C["line2"], width=1)
    p.text(x + 14 + (w - 28) / 4, y + 31, "登录", size=13, color=C["ink"], anchor="mm", kind="b")
    p.text(x + 14 + (w - 28) * 0.75, y + 31, "注册", size=13, color=C["ink3"], anchor="mm")
    # 输入框
    cy = y + 64
    for label, ph in [("用户名", "字母、数字、下划线，至少 3 位"), ("密码", "至少 6 位")]:
        p.text(x + 14, cy, label, size=11, color=C["ink2"], kind="b")
        p.rect(x + 14, cy + 18, w - 28, 40, fill=C["white"], outline=C["line2"], width=1, radius=10)
        p.text(x + 26, cy + 38, ph, size=12, color=C["ink4"], anchor="lm")
        cy += 70
    p.pill_btn(x + 14, cy + 2, w - 28, 44, "登录", C["brand"], C["white"], size=15, radius=12)
    p.pill_btn(x + 14, cy + 54, w - 28, 40, "用演示账号体验（林浩）", C["surface2"], C["ink2"],
               size=12.5, radius=10)
    p.text(PHONE_W / 2, y + 366, "新账号默认信用分 100 分，低于 60 分无法报名", size=10.5,
           color=C["ink3"], anchor="mm")
    # 底部三条价值说明（对应登录页"为什么需要登录"）
    fy = y + 418
    for title, desc in [("实名到人", "报名、签到都记在账号上，发起人核名单更省事"),
                        ("信用分跟人走", "按时到场累积完成次数，爽约才会扣分"),
                        ("组局更放心", "临期取消与爽约都会被记录，大家心里有数")]:
        p.rect(x, fy, w, 54, fill=C["white"], radius=12)
        p.rect(x + 14, fy + 15, 24, 24, fill=C["ok_bg"], radius=8)
        p.line(x + 20, fy + 27, x + 24, fy + 31, C["ok"], 2)
        p.line(x + 24, fy + 31, x + 33, fy + 21, C["ok"], 2)
        p.text(x + 48, fy + 17, title, size=12, color=C["ink"], kind="b")
        p.text(x + 48, fy + 34, desc, size=10, color=C["ink3"], max_w=w - 62)
        fy += 60
    return


def screen_discover(p: Pen):
    status_bar(p)
    appbar(p, None, brand=True, right=("＋ 发起", "brand"))
    m = 14                       # 左右外边距
    x, w = m, PHONE_W - m * 2
    y = STATUS_H + APPBAR_H + 14

    # 信用分卡片
    p.card(x, y, w, 96)
    ring_x, ring_y, d = x + 16, y + 12, 72
    r = d / 2 - 4
    p.d.ellipse([p.px(ring_x + 4 - r + 4), p.px(ring_y + 4 - r + 4),
                 p.px(ring_x + d - 4 + 4), p.px(ring_y + d - 4 + 4)],
                outline=C["surface2"], width=p.px(6))
    p.d.arc([p.px(ring_x + 4), p.px(ring_y + 4), p.px(ring_x + d - 4), p.px(ring_y + d - 4)],
            start=-90, end=-90 + 360 * 0.96, fill=C["accent"], width=p.px(6))
    p.text(ring_x + d / 2, ring_y + d / 2 - 4, "96", size=22, color=C["accent"], anchor="mm", kind="b")
    p.text(ring_x + d / 2, ring_y + d / 2 + 14, "信用分", size=9, color=C["ink3"], anchor="mm")
    stats = [("23", "完成次数"), ("0", "爽约次数"), ("4.8", "评价均分")]
    sx = ring_x + d + 18
    sw = (x + w - 16 - sx - 16) / 3
    for i, (num, label) in enumerate(stats):
        bx = sx + i * (sw + 8)
        p.rect(bx, y + 22, sw, 52, fill=C["surface2"], radius=12)
        p.text(bx + sw / 2, y + 38, num, size=16, color=C["ink"], anchor="mm", kind="b")
        p.text(bx + sw / 2, y + 58, label, size=9, color=C["ink3"], anchor="mm")
    y += 96 + 12

    # 一句话找局（深色卡）
    h = 116
    p.vgrad(x, y, w, h, C["nlp_bg1"], C["nlp_bg2"])
    p.rect(x, y, w, h, fill=None, radius=14)
    p.emoji(x + 14, y + 12, "✨", size=12)
    p.text(x + 34, y + 18, "一句话找局 · 自动识别项目 / 校区 / 水平", size=10.5,
           color=(196, 200, 210), anchor="lm")
    # 输入行
    iy = y + 36
    p.rect(x + 14, iy, w - 28 - 66, 38, fill=(70, 75, 88), radius=10)
    p.text(x + 26, iy + 19, "今晚想在旗山校区打篮球，新手可以吗", size=11.5,
           color=(226, 229, 236), anchor="lm", max_w=w - 28 - 66 - 24)
    p.pill_btn(x + w - 14 - 60, iy, 60, 38, "找局", C["brand"], C["white"], size=12.5, radius=10)
    # 示例 chips
    cx = x + 14
    for label in ["明早铜盘校区有跑步的吗", "这周末羽毛球"]:
        wd = p.tw(label, 10.5) + 18
        p.rect(cx, y + 82, wd, 22, fill=(58, 63, 76), outline=(96, 102, 116), width=1, radius=99)
        p.text(cx + wd / 2, y + 93, label, size=10.5, color=(210, 214, 222), anchor="mm")
        cx += wd + 8
    y += h + 12

    # 识别结果
    p.text(x, y + 4, "已识别：项目「篮球」、校区「旗山校区」、水平「新手」", size=10.5, color=C["ink3"])
    y += 22
    p.text(x, y, "为你找到 3 个", size=14, color=C["ink"], kind="b")
    p.text(x + w, y + 2, "清空结果", size=10.5, color=C["ink3"], anchor="ra")
    y += 24

    cards = [
        dict(title="周三晚篮球 3v3，缺两人", sport="篮球", time="10-16 周四 20:14", campus="旗山校区",
             place="风雨操场 3 号场", level="不限", status="可报名", fee="免费", joined=3, capacity=6,
             org="王妍", credit=100, status_colors=(C["ok_bg"], C["ok"])),
        dict(title="足球 5v5，还差 3 人", sport="足球", time="10-19 周日 14:14", campus="旗山校区",
             place="人工草皮足球场", level="不限", status="可报名", fee="¥5/人", joined=3, capacity=10,
             org="孙琦", credit=74, status_colors=(C["ok_bg"], C["ok"])),
    ]
    for data in cards:
        reasons = ["项目匹配", "水平合适", "同校区", "距离 0.01 km"] if data["sport"] == "篮球" \
            else ["校园内", "还有 7 位"]
        y = act_card(p, x, y, w, data,
                     score=100.0 if data["sport"] == "篮球" else 78.5,
                     reasons=reasons) + 12
    # 卡片底部提示（滚到底时看到）
    p.text(PHONE_W / 2, y + 6, "已经到底了 · 下拉可刷新", size=10.5, color=C["ink4"], anchor="mm")
    return


def screen_activities(p: Pen):
    status_bar(p)
    appBar_bottom = appbar(p, "活动列表", sub="共 8 条+", right=("＋ 发起", "brand"))
    m = 14
    x, w = m, PHONE_W - m * 2
    y = appBar_bottom + 12
    # 筛选 chips（横向滚动，右侧做渐隐示意）
    rows = [
        [("全部项目", False), ("🏀 篮球", True), ("⚽ 足球", False), ("🏸 羽毛球", False), ("🏓 乒乓", False)],
        [("不限状态", False), ("可报名", True), ("已满员", False), ("进行中", False)],
        [("不限时间", False), ("今天", False), ("明天", True), ("近 7 天", False)],
    ]
    for row in rows:
        cx = x
        for label, on in row:
            wd = p.tw(label, 12) + 26
            if on:
                p.pill_btn(cx, y, wd, 32, label, C["ink"], C["white"], size=12, radius=99)
            else:
                p.pill_btn(cx, y, wd, 32, label, C["white"], C["ink2"], size=12, radius=99,
                           border=C["line2"])
            cx += wd + 8
        y += 40
    p.rect(x, y - 4, w, 1, fill=C["bg"])
    # 只看还有空位
    p.rect(x, y + 2, 16, 16, fill=C["brand"], radius=5)
    p.line(x + 4, y + 10, x + 7, y + 13, C["white"], 2)
    p.line(x + 7, y + 13, x + 12, y + 5, C["white"], 2)
    p.text(x + 24, y + 10, "只看还有空位", size=12, color=C["ink2"], anchor="lm")
    p.text(x + w, y + 10, "重置筛选", size=11.5, color=C["ink3"], anchor="rm")
    y += 30

    cards = [
        dict(title="晨跑 5 公里 · 旗山环校", sport="跑步", time="10-17 周五 15:14", campus="旗山校区",
             place="田径场东门", level="新手", status="可报名", fee="免费", joined=3, capacity=8,
             org="赵琳", credit=100, status_colors=(C["ok_bg"], C["ok"])),
        dict(title="羽毛球双打，水平一般即可", sport="羽毛球", time="10-18 周六 17:14", campus="旗山校区",
             place="体育馆 2 号场", level="一般", status="已满员", fee="¥15/人", joined=4, capacity=4,
             org="何静", credit=92, status_colors=(C["warn_bg"], C["warn"])),
        dict(title="足球 5v5，还差 3 人", sport="足球", time="10-19 周日 14:14", campus="旗山校区",
             place="人工草皮足球场", level="不限", status="可报名", fee="¥5/人", joined=3, capacity=10,
             org="孙琦", credit=74, status_colors=(C["ok_bg"], C["ok"])),
    ]
    for data in cards:
        y = act_card(p, x, y, w, data) + 12
    tabbar(p, 1)


def screen_activity(p: Pen):
    """P-04 活动详情（参与者视角）。"""
    status_bar(p)
    appbar(p, "活动详情", back=True, right=("林浩", "ghost"))
    m = 14
    x, w = m, PHONE_W - m * 2
    y = STATUS_H + APPBAR_H

    # hero
    p.rect(0, y, PHONE_W, 96, fill=C["white"])
    p.line(0, y + 96, PHONE_W, y + 96, C["line"])
    tx = x
    for label, bg, fg in [("可报名", C["ok_bg"], C["ok"]), ("篮球", C["brand_100"], C["brand_600"]),
                          ("不限", C["surface2"], C["ink2"]), ("免费", C["ok_bg"], C["ok"])]:
        tx = p.tag(tx, y + 14, label, bg, fg) + 6
    p.text(x, y + 44, "周三晚篮球 3v3，缺两人", size=17, color=C["ink"], kind="b")
    p.text(x, y + 72, "6 小时后开始 · 10-16 周四 20:14 - 22:14", size=11, color=C["ink3"])
    y += 96 + 12

    # 事实卡
    facts = [("时间", "2026-10-16 20:14 起"), ("地点", "旗山校区 · 风雨操场 3 号场"),
             ("人数", "3/6 人 · 还差 3 人"), ("费用", "免费"),
             ("发起人", "王妍 · 信用分 100"),
             ("说明", "半场 3v3。新手也欢迎，自带水。")]
    fh = 20 + len(facts) * 26 + 10
    p.card(x, y, w, fh)
    fy = y + 14
    for k, v in facts:
        p.text(x + 14, fy + 8, k, size=12, color=C["ink3"], anchor="lm")
        p.text(x + 82, fy + 8, v, size=12.5, color=C["ink"], anchor="lm", kind="b",
               max_w=w - 96)
        fy += 26
    y += fh + 12

    # 我的参与状态
    p.card(x, y, w, 104)
    p.text(x + 14, y + 26, "我的参与状态", size=13.5, color=C["ink"], anchor="lm", kind="b")
    p.tag(x + w - 14 - 52, y + 14, "已报名", C["surface2"], C["ink2"])
    by = y + 50
    p.pill_btn(x + 14, by, 78, 32, "去签到", C["brand"], C["white"], size=12.5, radius=10)
    p.pill_btn(x + 100, by, 78, 32, "取消报名", C["white"], C["danger"], size=12.5, radius=10,
               border=(246, 201, 210))
    p.text(x + 14, y + 96, "距开始不足 2 小时取消会扣 5 分信用分", size=10, color=C["danger"])
    y += 104 + 12

    # 参与者名单
    people = [("王妍", "熟练 · 信用分 100", "已报名", C["surface2"], C["ink2"], "王"),
              ("陈默", "新手 · 信用分 88", "已签到", C["ok_bg"], C["ok"], "陈"),
              ("孙琦", "熟练 · 信用分 74", "已报名", C["surface2"], C["ink2"], "孙"),
              ("林浩", "一般 · 信用分 96", "已报名", C["surface2"], C["ink2"], "林")]
    ph = 24 + len(people) * 44
    p.card(x, y, w, ph)
    p.text(x + 14, y + 24, f"参与者（{len(people)}/6）", size=13.5, color=C["ink"], anchor="lm", kind="b")
    py = y + 40
    for name, sub, st, bg, fg, ini in people:
        p.avatar(x + 14, py + 4, 26, ini, size=12)
        p.text(x + 48, py + 12, name, size=12.5, color=C["ink"], kind="b")
        p.text(x + 48, py + 28, sub, size=10.5, color=C["ink3"])
        tw_ = p.tw(st, 10.5) + 14
        p.tag(x + w - 14 - tw_, py + 10, st, bg, fg, size=10.5)
        if name != people[-1][0]:
            p.line(x + 14, py + 40, x + w - 14, py + 40, C["line"])
        py += 44
    y += ph + 12

    # 小提示
    p.card(x, y, w, 132)
    p.text(x + 14, y + 24, "关于这场局", size=13.5, color=C["ink"], anchor="lm", kind="b")
    ty = y + 38
    for line in ["报名后可以在开始前随时取消；",
                 "距开始不足 2 小时内取消会扣 5 分信用分；",
                 "活动结束后，被确认到场的同学可以互相评价；",
                 "爽约一次扣 15 分，低于 60 分无法报名新活动。"]:
        p.text(x + 14, ty, "·", size=11, color=C["ink3"])
        p.text(x + 24, ty, line, size=11, color=C["ink2"], max_w=w - 40)
        ty += 22
    return


def screen_activity_organizer(p: Pen):
    """P-05 活动详情（发起人视角，能看到签到码）。"""
    status_bar(p)
    appbar(p, "活动详情", back=True, right=("王妍", "ghost"))
    m = 14
    x, w = m, PHONE_W - m * 2
    y = STATUS_H + APPBAR_H

    p.rect(0, y, PHONE_W, 96, fill=C["white"])
    p.line(0, y + 96, PHONE_W, y + 96, C["line"])
    tx = x
    for label, bg, fg in [("已满员", C["warn_bg"], C["warn"]), ("羽毛球", C["brand_100"], C["brand_600"]),
                          ("一般", C["info_bg"], C["info"]), ("¥15/人", C["surface2"], C["ink2"])]:
        tx = p.tag(tx, y + 14, label, bg, fg) + 6
    p.text(x, y + 44, "羽毛球双打，水平一般即可", size=17, color=C["ink"], kind="b")
    p.text(x, y + 72, "2 天后开始 · 10-18 周六 17:14 - 19:14", size=11, color=C["ink3"])
    y += 96 + 12

    # 发起人专属：签到码
    ch = 118
    p.card(x, y, w, ch, fill=(255, 247, 243), border=(255, 217, 201))
    p.text(x + 14, y + 24, "签到码", size=13.5, color=C["ink"], anchor="lm", kind="b")
    cx = x + 14
    for ch_ in "6088":
        p.rect(cx, y + 38, 74, 46, fill=C["ink"], radius=12)
        p.text(cx + 37, y + 61, ch_, size=24, color=C["white"], anchor="mm", kind="m")
        cx += 82
    p.text(x + 14, y + 96, "念给到场的人，签到码只有发起人能看到", size=10.5, color=C["ink3"])
    y += ch + 12

    # 参与者名单（发起人视角也看得到名单状态）
    people0 = [("王妍", "熟练 · 信用分 100", "已签到", C["ok_bg"], C["ok"], "王"),
               ("何静", "一般 · 信用分 92", "已签到", C["ok_bg"], C["ok"], "何"),
               ("周雨", "新手 · 信用分 100", "已报名", C["surface2"], C["ink2"], "周"),
               ("林浩", "一般 · 信用分 96", "已报名", C["surface2"], C["ink2"], "林")]
    ph0 = 24 + len(people0) * 44
    p.card(x, y, w, ph0)
    p.text(x + 14, y + 24, f"参与者（{len(people0)}/4）", size=13.5, color=C["ink"],
           anchor="lm", kind="b")
    py0 = y + 40
    for name, sub, st, bg, fg, ini in people0:
        p.avatar(x + 14, py0 + 4, 26, ini, size=12)
        p.text(x + 48, py0 + 12, name, size=12.5, color=C["ink"], kind="b")
        p.text(x + 48, py0 + 28, sub, size=10.5, color=C["ink3"])
        tw_ = p.tw(st, 10.5) + 14
        p.tag(x + w - 14 - tw_, py0 + 10, st, bg, fg, size=10.5)
        if name != people0[-1][0]:
            p.line(x + 14, py0 + 40, x + w - 14, py0 + 40, C["line"])
        py0 += 44
    y += ph0 + 12

    # 到场情况（发起人勾选：已签到的预先勾上）
    people = [("王妍", "熟练 · 信用分 100", True),
              ("何静", "一般 · 信用分 92", True),
              ("周雨", "新手 · 信用分 100", False),
              ("林浩", "一般 · 信用分 96", False)]
    checked_n = sum(1 for _, _, c in people if c)
    ph = 112 + len(people) * 40
    p.card(x, y, w, ph)
    p.text(x + 14, y + 24, "到场情况", size=13.5, color=C["ink"], anchor="lm", kind="b")
    p.text(x + w - 14, y + 24, f"已签到 {checked_n} · 待签到 {len(people) - checked_n}",
           size=10.5, color=C["ink3"], anchor="rm")
    py = y + 40
    for name, sub, checked in people:
        p.rect(x + 14, py + 8, 18, 18, fill=C["brand"] if checked else C["white"],
               outline=C["brand"] if checked else C["line2"], width=1, radius=5)
        if checked:
            p.line(x + 18, py + 17, x + 21, py + 20, C["white"], 2)
            p.line(x + 21, py + 20, x + 27, py + 12, C["white"], 2)
        p.text(x + 42, py + 12, name, size=12.5, color=C["ink"], kind="b")
        p.text(x + 42, py + 27, sub, size=10.5, color=C["ink3"])
        if name != people[-1][0]:
            p.line(x + 14, py + 38, x + w - 14, py + 38, C["line"])
        py += 40
    by = py + 8
    p.pill_btn(x + 14, by, 96, 32, "全选到场", C["surface2"], C["ink2"], size=11.5, radius=9)
    p.pill_btn(x + 118, by, 84, 32, "全不选", C["surface2"], C["ink2"], size=11.5, radius=9)
    p.pill_btn(x + w - 14 - 150, by, 150, 32, f"确认考勤（{checked_n} 人到场）",
               C["brand"], C["white"], size=11.5, radius=9)
    p.text(x + 14, y + ph - 10, "未勾选的人会被记为爽约并扣 15 分信用分。", size=10, color=C["ink3"])
    y += ph + 12

    # 小提示
    p.card(x, y, w, 108)
    p.text(x + 14, y + 24, "小提示", size=13.5, color=C["ink"], anchor="lm", kind="b")
    ty = y + 40
    for line in ["报名人数达到上限后，活动状态会自动变成「已满员」；",
                 "距开始 2 小时内取消报名的同学会被扣 5 分，界面已提示；",
                 "活动结束后记得回来记录考勤，否则无法结算信用分。"]:
        p.text(x + 14, ty, "·", size=11, color=C["ink3"])
        p.text(x + 24, ty, line, size=11, color=C["ink2"], max_w=w - 40)
        ty += 22
    return


def screen_activity_new(p: Pen):
    status_bar(p)
    appbar(p, "发起活动", back=True)
    m = 14
    x, w = m, PHONE_W - m * 2
    y = STATUS_H + APPBAR_H + 12

    # 卡片 1
    p.card(x, y, w, 168)
    p.text(x + 14, y + 24, "这场局是什么", size=13.5, color=C["ink"], anchor="lm", kind="b")
    p.text(x + 14, y + 44, "标题", size=11, color=C["ink2"], kind="b")
    p.rect(x + 14, y + 58, w - 28, 38, fill=C["white"], outline=C["line2"], width=1, radius=10)
    p.text(x + 26, y + 77, "周三晚篮球 3v3，缺两人", size=12.5, color=C["ink"], anchor="lm")
    p.text(x + 14, y + 108, "运动项目", size=11, color=C["ink2"], kind="b")
    p.rect(x + 14, y + 122, w - 28, 38, fill=C["white"], outline=C["line2"], width=1, radius=10)
    p.emoji(x + 26, y + 131, "🏀", size=15)
    p.text(x + 48, y + 141, "篮球", size=12.5, color=C["ink"], anchor="lm")
    p.back_arrow(x + w - 30, y + 145, w=4, color=C["ink3"], width=2)
    y += 168 + 12

    # 卡片 2：水平（分段开关）
    p.card(x, y, w, 76)
    p.text(x + 14, y + 22, "水平要求", size=11, color=C["ink2"], kind="b")
    p.rect(x + 14, y + 34, w - 28, 34, fill=C["surface2"], radius=99)
    labels = ["不限", "新手", "一般", "熟练"]
    seg = (w - 30) / 4
    for i, label in enumerate(labels):
        bx = x + 15 + i * seg
        if i == 1:
            p.rect(bx, y + 35, seg, 32, fill=C["white"], radius=99, outline=C["line2"], width=1)
            p.text(bx + seg / 2, y + 51, label, size=12, color=C["ink"], anchor="mm", kind="b")
        else:
            p.text(bx + seg / 2, y + 51, label, size=12, color=C["ink3"], anchor="mm")
    y += 76 + 12

    # 卡片 3：时间地点
    p.card(x, y, w, 214)
    p.text(x + 14, y + 24, "什么时候 · 在哪里", size=13.5, color=C["ink"], anchor="lm", kind="b")
    for i, (label, value) in enumerate([("开始时间", "2026-10-16T20:00"), ("结束时间", "2026-10-16T22:00")]):
        bx = x + 14 + i * ((w - 28) / 2 + 6)
        bw = (w - 28 - 6) / 2
        p.text(bx, y + 44, label, size=11, color=C["ink2"], kind="b")
        p.rect(bx, y + 58, bw, 38, fill=C["white"], outline=C["line2"], width=1, radius=10)
        p.text(bx + 10, y + 77, value, size=10.5, color=C["ink"], anchor="lm", kind="m")
    # 时长快捷按钮
    bxx = x + 14
    for label in ["1 小时", "90 分钟", "2 小时", "3 小时"]:
        wd = p.tw(label, 11) + 20
        on = label == "2 小时"
        p.pill_btn(bxx, y + 106, wd, 26, label,
                   C["surface2"] if not on else C["brand_100"],
                   C["ink2"] if not on else C["brand_600"], size=11, radius=8)
        bxx += wd + 6
    p.text(x + 14, y + 146, "校区", size=11, color=C["ink2"], kind="b")
    p.text(x + 14 + (w - 28) / 2 + 6, y + 146, "具体地点", size=11, color=C["ink2"], kind="b")
    p.rect(x + 14, y + 160, (w - 34) / 2, 38, fill=C["white"], outline=C["line2"], width=1, radius=10)
    p.text(x + 24, y + 179, "旗山校区", size=12, color=C["ink"], anchor="lm")
    p.rect(x + 14 + (w - 28) / 2 + 6, y + 160, (w - 34) / 2, 38, fill=C["white"],
           outline=C["line2"], width=1, radius=10)
    p.text(x + 24 + (w - 28) / 2 + 6, y + 179, "风雨操场 3 号场", size=11,
           color=C["ink"], anchor="lm")
    y += 214 + 12

    # 卡片 4：人数费用（只露头部）
    p.card(x, y, w, 118)
    p.text(x + 14, y + 24, "人数 · 费用", size=13.5, color=C["ink"], anchor="lm", kind="b")
    p.text(x + 14, y + 44, "人数上限", size=11, color=C["ink2"], kind="b")
    p.rect(x + 14, y + 58, (w - 34) / 2, 38, fill=C["white"], outline=C["line2"], width=1, radius=10)
    p.text(x + 24, y + 77, "6", size=12, color=C["ink"], anchor="lm", kind="m")
    p.text(x + 14 + (w - 28) / 2 + 6, y + 44, "人均费用（元）", size=11, color=C["ink2"], kind="b")
    p.rect(x + 14 + (w - 28) / 2 + 6, y + 58, (w - 34) / 2, 38, fill=C["white"],
           outline=C["line2"], width=1, radius=10)
    p.text(x + 24 + (w - 28) / 2 + 6, y + 77, "0", size=12, color=C["ink"], anchor="lm", kind="m")
    p.text(x + 14, y + 108, "免费填 0；场地费 AA 就写摊到每人的金额", size=10, color=C["ink3"])
    y += 118 + 12

    # 补充说明（textarea）
    p.card(x, y, w, 116)
    p.text(x + 14, y + 24, "补充说明（可选）", size=13.5, color=C["ink"], anchor="lm", kind="b")
    p.rect(x + 14, y + 38, w - 28, 62, fill=C["white"], outline=C["line2"], width=1, radius=10)
    p.text(x + 26, y + 50, "缺几人、水平要求、要带什么、注意事项…", size=11, color=C["ink4"])
    y += 116 + 12

    # 提交前说明 + 按钮
    p.card(x, y, w, 74, fill=C["surface2"], border=C["surface2"])
    p.text(x + 14, y + 24, "发布后会自动生成 4 位签到码（只有你能看到）；", size=10.5, color=C["ink3"])
    p.text(x + 14, y + 40, "活动结束后记得记录考勤，未勾选到场的人会被记为爽约。", size=10.5, color=C["ink3"])
    p.text(x + 14, y + 56, "时间会按你所在时区提交（本项目自动转成 UTC）。", size=10.5, color=C["ink3"])
    y += 74 + 12
    p.pill_btn(x, y, w, 46, "发布活动", C["brand"], C["white"], size=15.5, radius=13)
    return


def screen_checkin(p: Pen):
    status_bar(p)
    appbar(p, "签到", back=True)
    m = 14
    x, w = m, PHONE_W - m * 2
    y = STATUS_H + APPBAR_H + 12

    p.card(x, y, w, 84)
    p.text(x + 14, y + 24, "周三晚篮球 3v3，缺两人", size=13.5, color=C["ink"], anchor="lm", kind="b")
    p.tag(x + w - 14 - 44, y + 14, "不限", C["surface2"], C["ink2"])
    p.text(x + 14, y + 48, "10-16 周四 20:14 - 22:14 · 旗山校区 风雨操场 3 号场",
           size=10.5, color=C["ink3"], max_w=w - 28)
    p.line(x + 14, y + 62, x + w - 14, y + 62, C["line"])
    p.text(x + 14, y + 74, "我的状态", size=10.5, color=C["ink3"], anchor="lm")
    p.tag(x + w - 14 - 44, y + 64, "已报名", C["surface2"], C["ink2"], size=10.5)
    y += 84 + 12

    # 方式一：签到码
    p.card(x, y, w, 186)
    p.text(x + 14, y + 24, "方式一 · 输入签到码", size=13.5, color=C["ink"], anchor="lm", kind="b")
    p.text(x + 14, y + 44, "找发起人要 4 位数字，输入即可。", size=11, color=C["ink3"])
    p.rect(x + 14, y + 62, w - 28, 58, fill=C["white"], outline=C["brand"], width=2, radius=12)
    p.text(x + w / 2, y + 91, "9 5 7 2", size=26, color=C["ink"], anchor="mm", kind="m")
    p.pill_btn(x + 14, y + 132, w - 28, 42, "确认签到", C["brand"], C["white"], size=14.5, radius=12)
    y += 186 + 12

    # 方式二：定位
    p.card(x, y, w, 122)
    p.text(x + 14, y + 24, "方式二 · 定位签到", size=13.5, color=C["ink"], anchor="lm", kind="b")
    p.text(x + 14, y + 46, "需要你在活动地点 300 米以内。超出范围", size=11, color=C["ink3"])
    p.text(x + 14, y + 62, "后端会返回具体距离，按提示挪近再试。", size=11, color=C["ink3"])
    # 按钮文字居中，所以"图钉 + 文字"整体要靠左让位：先算整体宽度再定起点
    label = "用当前位置签到"
    text_w = p.tw(label, 13, "b")
    icon_w = 16
    gap = 8
    group_x = x + 14 + ((w - 28) - (text_w + icon_w + gap)) / 2
    p.pill_btn(x + 14, y + 76, w - 28, 38, "", C["white"], C["ink"], size=13,
               radius=10, border=C["line2"])
    p.pin(group_x + icon_w / 2, y + 95, C["brand_600"], size=14)
    p.text(group_x + icon_w + gap, y + 95, label, size=13, color=C["ink"], anchor="lm", kind="b")
    y += 122 + 12

    # 失败态说明：后端按状态码给不同反馈
    p.card(x, y, w, 150)
    p.text(x + 14, y + 24, "签到失败时会发生什么", size=13.5, color=C["ink"], anchor="lm", kind="b")
    ty = y + 42
    for code, desc, col in [("403", "签到码不对，或距离超过 300 米（会提示具体米数）", C["danger"]),
                            ("409", "你已经签到过了，不用重复签到", C["warn"]),
                            ("403", "你没有报名这场活动，无法签到", C["danger"]),
                            ("400", "活动已取消，签到通道关闭", C["ink3"])]:
        p.rect(x + 14, ty, 40, 22, fill=C["surface2"], radius=6)
        p.text(x + 34, ty + 11, code, size=11, color=col, anchor="mm", kind="m")
        p.text(x + 62, ty + 11, desc, size=10.5, color=C["ink2"], anchor="lm", max_w=w - 78)
        ty += 26
    y += 150 + 12

    p.card(x, y, w, 76, fill=C["surface2"], border=C["surface2"])
    p.text(x + 14, y + 24, "签到成功后状态会变成「已签到」。", size=11, color=C["ink2"])
    p.text(x + 14, y + 42, "若长时间无法签到，先把情况告诉发起人，避免被记为爽约", size=10.5,
           color=C["ink3"], max_w=w - 28)
    p.text(x + 14, y + 58, "（爽约一次扣 15 分信用分）。", size=10.5, color=C["ink3"])
    return


def screen_manage_activity(p: Pen):
    status_bar(p)
    appbar(p, "管理活动", back=True)
    m = 14
    x, w = m, PHONE_W - m * 2
    y = STATUS_H + APPBAR_H + 12

    # 活动摘要
    p.card(x, y, w, 128)
    tx = x + 14
    for label, bg, fg in [("已满员", C["warn_bg"], C["warn"]), ("羽毛球", C["brand_100"], C["brand_600"])]:
        tx = p.tag(tx, y + 14, label, bg, fg) + 6
    p.text(x + 14, y + 46, "羽毛球双打，水平一般即可", size=15, color=C["ink"], kind="b")
    p.text(x + 14, y + 70, "10-18 周六 17:14 - 19:14 · 旗山校区 体育馆 2 号场",
           size=10.5, color=C["ink3"], max_w=w - 28)
    by = y + 88
    p.pill_btn(x + 14, by, 84, 30, "查看详情页", C["white"], C["ink"], size=11.5, radius=9, border=C["line2"])
    p.pill_btn(x + 104, by, 76, 30, "编辑活动", C["white"], C["ink"], size=11.5, radius=9, border=C["line2"])
    p.pill_btn(x + 186, by, 76, 30, "取消活动", C["white"], C["danger"], size=11.5, radius=9,
               border=(246, 201, 210))
    y += 128 + 12

    # 签到码
    p.card(x, y, w, 118, fill=(255, 247, 243), border=(255, 217, 201))
    p.text(x + 14, y + 24, "签到码", size=13.5, color=C["ink"], anchor="lm", kind="b")
    cx = x + 14
    for digit in "6088":
        p.rect(cx, y + 38, 74, 46, fill=C["ink"], radius=12)
        p.text(cx + 37, y + 61, digit, size=24, color=C["white"], anchor="mm", kind="m")
        cx += 82
    p.text(x + 14, y + 96, "念给到场的人，他们自己输入即可签到。", size=10.5, color=C["ink3"])
    y += 118 + 12

    # 到场情况
    rows = [("王妍", "已签到", True), ("何静", "已签到", True),
            ("周雨", "已报名", False), ("林浩", "已签到", True)]
    ph = 120 + len(rows) * 40
    p.card(x, y, w, ph)
    p.text(x + 14, y + 24, "到场情况", size=13.5, color=C["ink"], anchor="lm", kind="b")
    p.text(x + w - 14, y + 24, "已签到 3 · 待签到 1", size=10.5, color=C["ink3"], anchor="rm")
    py = y + 40
    for name, st, checked in rows:
        p.rect(x + 14, py + 8, 18, 18, fill=C["brand"] if checked else C["white"],
               outline=C["brand"] if checked else C["line2"], width=1, radius=5)
        if checked:
            p.line(x + 18, py + 17, x + 21, py + 20, C["white"], 2)
            p.line(x + 21, py + 20, x + 27, py + 12, C["white"], 2)
        p.text(x + 42, py + 17, name, size=12.5, color=C["ink"], anchor="lm", kind="b")
        tw_ = p.tw(st, 10.5) + 14
        p.tag(x + w - 14 - tw_, py + 8, st, C["ok_bg"] if "签到" in st else C["surface2"],
              C["ok"] if "签到" in st else C["ink2"], size=10.5)
        if name != rows[-1][0]:
            p.line(x + 14, py + 38, x + w - 14, py + 38, C["line"])
        py += 40
    p.pill_btn(x + 14, y + ph - 46, w - 28, 34, "确认考勤（3 人到场）", C["brand"], C["white"],
               size=12.5, radius=10)
    p.text(x + 14, y + ph - 8, "未勾选的人会被记为爽约并扣 15 分信用分。", size=10, color=C["ink3"])
    y += ph + 12

    # 小提示
    p.card(x, y, w, 108)
    p.text(x + 14, y + 24, "小提示", size=13.5, color=C["ink"], anchor="lm", kind="b")
    ty = y + 40
    for line in ["报名人数达到上限后，活动状态会自动变成「已满员」；",
                 "距开始 2 小时内取消报名的同学会被扣 5 分，界面已提示；",
                 "活动结束后，被确认到场的同学可以互相评价。"]:
        p.text(x + 14, ty, "·", size=11, color=C["ink3"])
        p.text(x + 24, ty, line, size=11, color=C["ink2"], max_w=w - 40)
        ty += 22
    return


def screen_my_activities(p: Pen):
    status_bar(p)
    appbar(p, "我的局", sub="我发起 2 · 我报名 3", right=("＋ 发起", "brand"))
    m = 14
    x, w = m, PHONE_W - m * 2
    y = STATUS_H + APPBAR_H + 12

    # 分段切换
    p.rect(x, y, w, 34, fill=C["surface2"], radius=99)
    p.rect(x + 1, y + 1, w / 2 - 2, 32, fill=C["white"], radius=99, outline=C["line2"], width=1)
    p.text(x + w / 4, y + 17, "我发起的（2）", size=12, color=C["ink"], anchor="mm", kind="b")
    p.text(x + w * 0.75, y + 17, "我报名的（3）", size=12, color=C["ink3"], anchor="mm")
    y += 34 + 12

    # 我发起的：一张卡
    p.card(x, y, w, 158)
    p.rect(x + 14, y + 14, 38, 38, fill=C["brand_100"], radius=11)
    p.emoji(x + 23, y + 22, "🏀", size=19)
    p.text(x + 62, y + 20, "周三晚篮球 3v3，缺两人", size=13.5, color=C["ink"], kind="b",
           max_w=w - 76)
    p.text(x + 62, y + 42, "10-16 周四 20:14 · 旗山校区 风雨操场", size=10.5,
           color=C["ink3"], max_w=w - 76)
    ty = y + 62
    for label, bg, fg in [("可报名", C["ok_bg"], C["ok"]), ("3/6 人", C["surface2"], C["ink2"]),
                          ("不限", C["surface2"], C["ink2"])]:
        ty = p.tag(ty, y + 62, label, bg, fg) + 6
    by = y + 90
    p.pill_btn(x + 14, by, 92, 32, "看签到码", C["brand"], C["white"], size=12, radius=10)
    p.pill_btn(x + 112, by, 62, 32, "详情", C["white"], C["ink"], size=12, radius=10, border=C["line2"])
    p.pill_btn(x + 180, by, 76, 32, "取消活动", C["white"], C["danger"], size=12, radius=10,
               border=(246, 201, 210))
    p.line(x + 14, y + 132, x + w - 14, y + 132, C["line"])
    p.text(x + 14, y + 146, "已签到 3 人 · 待签到 1 人 · 名额还剩 1", size=10.5, color=C["ink3"])
    y += 158 + 12

    # 我报名的：一张卡
    p.card(x, y, w, 132)
    p.rect(x + 14, y + 14, 38, 38, fill=C["brand_100"], radius=11)
    p.emoji(x + 23, y + 22, "🏸", size=19)
    p.text(x + 62, y + 20, "羽毛球双打，水平一般即可", size=13.5, color=C["ink"], kind="b",
           max_w=w - 76)
    p.text(x + 62, y + 42, "10-18 周六 17:14 · 体育馆 2 号场", size=10.5, color=C["ink3"],
           max_w=w - 76)
    tx = x + 14
    for label, bg, fg in [("已满员", C["warn_bg"], C["warn"]), ("发起人 何静", C["surface2"], C["ink2"]),
                          ("临近开始", C["danger_bg"], C["danger"])]:
        tx = p.tag(tx, y + 62, label, bg, fg) + 6
    by = y + 90
    p.pill_btn(x + 14, by, 72, 30, "去签到", C["brand"], C["white"], size=11.5, radius=9)
    p.pill_btn(x + 92, by, 56, 30, "详情", C["white"], C["ink"], size=11.5, radius=9, border=C["line2"])
    p.pill_btn(x + 154, by, 82, 30, "取消报名", C["white"], C["danger"], size=11.5, radius=9,
               border=(246, 201, 210))
    tabbar(p, 2)
    return


def screen_me(p: Pen):
    status_bar(p)
    appbar(p, "我的", sub="旗山校区 · GMT+8", right=("编辑", "ghost"))
    m = 14
    x, w = m, PHONE_W - m * 2
    y = STATUS_H + APPBAR_H + 12

    # 资料
    p.card(x, y, w, 88)
    p.avatar(x + 14, y + 16, 46, "林", size=20)
    p.text(x + 72, y + 28, "林浩", size=17, color=C["ink"], kind="b")
    p.text(x + 72, y + 50, "@linhao · 旗山校区", size=11, color=C["ink3"])
    tx = x + 72
    tx = p.tag(tx, y + 62, "一般", C["brand_100"], C["brand_600"]) + 6
    tx = p.tag(tx, y + 62, "篮球", C["surface2"], C["ink2"]) + 6
    p.tag(tx, y + 62, "跑步", C["surface2"], C["ink2"])
    y += 88 + 12

    # 信用分
    p.card(x, y, w, 96)
    ring_x, ring_y, d = x + 16, y + 12, 72
    r = d / 2 - 4
    p.d.ellipse([p.px(ring_x + 4), p.px(ring_y + 4), p.px(ring_x + d - 4), p.px(ring_y + d - 4)],
                outline=C["surface2"], width=p.px(6))
    p.d.arc([p.px(ring_x + 4), p.px(ring_y + 4), p.px(ring_x + d - 4), p.px(ring_y + d - 4)],
            start=-90, end=-90 + 360 * 0.96, fill=C["accent"], width=p.px(6))
    p.text(ring_x + d / 2, ring_y + d / 2 - 4, "96", size=22, color=C["accent"], anchor="mm", kind="b")
    p.text(ring_x + d / 2, ring_y + d / 2 + 14, "信用分", size=9, color=C["ink3"], anchor="mm")
    sx = ring_x + d + 18
    sw = (x + w - 16 - sx - 16) / 3
    for i, (num, label) in enumerate([("23", "完成次数"), ("0", "爽约次数"), ("4.8", "评价均分")]):
        bx = sx + i * (sw + 8)
        p.rect(bx, y + 22, sw, 52, fill=C["surface2"], radius=12)
        p.text(bx + sw / 2, y + 38, num, size=16, color=C["ink"], anchor="mm", kind="b")
        p.text(bx + sw / 2, y + 58, label, size=9, color=C["ink3"], anchor="mm")
    y += 96 + 12

    # 列表入口
    items = [("🎯", "我的局", "我发起 2 · 我报名 3"),
             ("👤", "我的主页（别人看到的样子）", "信用分、评价与印象标签"),
             ("🔍", "去找局", "一句话匹配适合你的活动"),
             ("➕", "发起活动", "发布后会生成只有你能看到的签到码")]
    p.card(x, y, w, len(items) * 46 + 8, radius=14)
    py = y + 4
    for icon_ch, title, desc in items:
        p.rect(x + 14, py + 8, 32, 32, fill=C["surface2"], radius=10)
        p.emoji(x + 20, py + 14, icon_ch, size=15)
        p.text(x + 56, py + 16, title, size=12.5, color=C["ink"], kind="b", max_w=w - 96)
        p.text(x + 56, py + 32, desc, size=10.5, color=C["ink3"], max_w=w - 96)
        p.text(x + w - 18, py + 23, "›", size=16, color=(194, 200, 214), anchor="rm")
        if title != items[-1][1]:
            p.line(x + 14, py + 46, x + w - 14, py + 46, C["line"])
        py += 46
    y += len(items) * 46 + 8 + 12

    # 收到的评价
    p.card(x, y, w, 138)
    p.text(x + 14, y + 24, "我收到的评价（3）", size=13.5, color=C["ink"], anchor="lm", kind="b")
    p.text(x + w - 14, y + 24, "4.8 分", size=11.5, color=C["brand_600"], anchor="rm", kind="b")
    ry = y + 40
    for name, score, tags_, comment in [
        ("陈默", 5, ["准时", "组织得力"], "组织得挺好，场地和时间都提前说清楚了。"),
        ("孙琦", 4, ["水平匹配"], "打得不错，下次再来。"),
    ]:
        p.text(x + 14, ry + 10, name, size=12, color=C["ink"], kind="b")
        p.stars(x + w - 14 - 5 * 20 - 16, ry + 2, score, size=16, gap=4)
        ty = ry + 24
        for label in tags_:
            ty = p.tag(ty, ry + 22, label, C["ok_bg"], C["ok"], size=10) + 6
        p.text(x + 14, ry + 48, comment, size=11, color=C["ink2"], max_w=w - 28)
        p.line(x + 14, ry + 62, x + w - 14, ry + 62, C["line"])
        ry += 66
    tabbar(p, 3)
    return


def screen_user(p: Pen):
    status_bar(p)
    appbar(p, "陈默", back=True)
    m = 14
    x, w = m, PHONE_W - m * 2
    y = STATUS_H + APPBAR_H + 12

    # 资料 + 信用分
    p.card(x, y, w, 168)
    p.avatar(x + 14, y + 16, 46, "陈", size=20)
    p.text(x + 72, y + 28, "陈默", size=17, color=C["ink"], kind="b")
    p.text(x + 72, y + 50, "旗山校区 · 新手", size=11, color=C["ink3"])
    tx = x + 72
    tx = p.tag(tx, y + 62, "篮球", C["brand_100"], C["brand_600"]) + 6
    p.line(x + 14, y + 88, x + w - 14, y + 88, C["line"])
    sw = (w - 44) / 3
    for i, (num, label, col) in enumerate([("88", "信用分", C["brand"]), ("9", "完成次数", C["ink"]),
                                           ("1", "爽约次数", C["ink"])]):
        bx = x + 14 + i * (sw + 8)
        p.rect(bx, y + 100, sw, 52, fill=C["surface2"], radius=12)
        p.text(bx + sw / 2, y + 116, num, size=16, color=col, anchor="mm", kind="b")
        p.text(bx + sw / 2, y + 136, label, size=9, color=C["ink3"], anchor="mm")
    y += 168 + 12

    # 评价分布
    p.card(x, y, w, 130)
    p.text(x + 14, y + 24, "收到的评价（6）", size=13.5, color=C["ink"], anchor="lm", kind="b")
    p.text(x + w - 14, y + 24, "4.5 分", size=11.5, color=C["brand_600"], anchor="rm", kind="b")
    by = y + 40
    for stars_, count in [(5, 3), (4, 3), (3, 0), (2, 0), (1, 0)]:
        p.text(x + 14, by, f"{stars_} 星", size=10.5, color=C["ink3"], anchor="lm")
        p.rect(x + 48, by - 3, w - 48 - 40, 6, fill=C["surface2"], radius=3)
        if count:
            p.rect(x + 48, by - 3, (w - 48 - 40) * (count / 6), 6, fill=C["star"], radius=3)
        p.text(x + w - 14, by, str(count), size=10.5, color=C["ink2"], anchor="rm", kind="m")
        by += 16
    tx = x + 14
    for label in ["准时 ×3", "氛围好 ×2", "球风好 ×1"]:
        tx = p.tag(tx, y + 104, label, C["ok_bg"], C["ok"], size=10) + 6
    y += 130 + 12

    # 一条评价
    p.card(x, y, w, 118)
    p.avatar(x + 14, y + 14, 22, "王", size=11)
    p.text(x + 44, y + 20, "王妍", size=12.5, color=C["ink"], kind="b")
    p.stars(x + w - 14 - 5 * 14 - 12, y + 16, 4, size=12, gap=3)
    tx = x + 14
    for label in ["氛围好"]:
        tx = p.tag(tx, y + 44, label, C["ok_bg"], C["ok"], size=10) + 6
    p.text(x + 14, y + 70, "新手也挺积极，下次可以再来一局。", size=11.5, color=C["ink2"])
    p.text(x + 14, y + 90, "2026-10-11 14:14", size=10, color=C["ink3"])
    y += 118 + 12

    # 第二条评价
    p.card(x, y, w, 92)
    p.avatar(x + 14, y + 14, 22, "何", size=11)
    p.text(x + 44, y + 20, "何静", size=12.5, color=C["ink"], kind="b")
    p.stars(x + w - 14 - 5 * 14 - 12, y + 16, 5, size=12, gap=3)
    tx = x + 14
    for label in ["准时", "乐于配合"]:
        tx = p.tag(tx, y + 44, label, C["ok_bg"], C["ok"], size=10) + 6
    p.text(x + 14, y + 70, "提前到了十分钟，人也很随和。", size=11.5, color=C["ink2"])
    y += 92 + 12

    # 参与过但还没被评价的活动
    p.card(x, y, w, 92, fill=C["surface2"], border=C["surface2"])
    p.text(x + 14, y + 24, "还有 2 场活动待评价", size=12.5, color=C["ink"], anchor="lm", kind="b")
    p.text(x + 14, y + 44, "活动结束后 72 小时内可以评价同场伙伴，超时就关闭入口。",
           size=10.5, color=C["ink3"], max_w=w - 28)
    p.pill_btn(x + 14, y + 60, 108, 26, "看看是哪两场", C["white"], C["ink"], size=11, radius=8,
               border=C["line2"])
    return


def screen_review(p: Pen):
    status_bar(p)
    appbar(p, "评价同场伙伴", back=True)
    m = 14
    x, w = m, PHONE_W - m * 2
    y = STATUS_H + APPBAR_H + 12

    # 活动摘要
    p.card(x, y, w, 86)
    p.text(x + 14, y + 24, "昨天那场篮球（已结束）", size=13.5, color=C["ink"], anchor="lm", kind="b")
    p.text(x + 14, y + 46, "旗山校区 · 风雨操场 1 号场 · 2026-10-15 14:14", size=10.5,
           color=C["ink3"], max_w=w - 28)
    p.line(x + 14, y + 62, x + w - 14, y + 62, C["line"])
    p.text(x + 14, y + 74, "我的到场状态：已确认到场 ✅", size=11, color=C["ok"], anchor="lm", kind="b")
    y += 86 + 12

    # 评价卡
    p.card(x, y, w, 300)
    p.avatar(x + 14, y + 14, 46, "陈", size=20)
    p.text(x + 72, y + 28, "陈默", size=14.5, color=C["ink"], kind="b")
    p.text(x + 72, y + 50, "新手 · 信用分 88 · 签到于 10-15 14:20", size=10.5, color=C["ink3"])
    p.tag(x + w - 14 - 52, y + 14, "已评价", C["ok_bg"], C["ok"], size=10.5)

    p.text(x + 14, y + 76, "这次一起玩的体验", size=11, color=C["ink2"], kind="b")
    p.stars(x + 14, y + 92, 5, size=26, gap=6)
    p.text(x + 14 + 5 * 32 + 8, y + 106, "5 分", size=11, color=C["ink3"], anchor="lm")

    p.text(x + 14, y + 136, "印象标签（可多选）", size=11, color=C["ink2"], kind="b")
    tx = x + 14
    for i, label in enumerate(["准时", "球风好", "水平匹配", "氛围好"]):
        on = i < 2
        wd = p.tw(label, 12) + 26
        if tx + wd > x + w - 14:
            tx, _ = x + 14, None
        p.pill_btn(tx, y + 150, wd, 32, label,
                   C["brand_100"] if on else C["white"],
                   C["brand_600"] if on else C["ink2"], size=12, radius=99,
                   border=None if on else C["line2"])
        tx += wd + 8
    tx = x + 14
    for i, label in enumerate(["乐于配合", "下次还想一起"]):
        wd = p.tw(label, 12) + 26
        p.pill_btn(tx, y + 188, wd, 32, label, C["white"], C["ink2"], size=12, radius=99,
                   border=C["line2"])
        tx += wd + 8

    p.text(x + 14, y + 232, "补充一句（可选）", size=11, color=C["ink2"], kind="b")
    p.rect(x + 14, y + 246, w - 28, 40, fill=C["white"], outline=C["line2"], width=1, radius=10)
    p.text(x + 26, y + 258, "例如：很准时，配合也好。", size=11, color=C["ink4"])
    y += 300 + 12
    p.pill_btn(x + 14, y, w - 28, 44, "提交评价", C["brand"], C["white"], size=15, radius=12)
    y += 44 + 12

    # 还有谁可以评
    p.card(x, y, w, 108)
    p.text(x + 14, y + 24, "同场还有 2 人可以评价", size=13.5, color=C["ink"], anchor="lm", kind="b")
    ty = y + 40
    for name, sub in [("孙琦", "熟练 · 信用分 74 · 已确认到场"),
                      ("高飞", "熟练 · 信用分 58 · 已确认到场")]:
        p.avatar(x + 14, ty, 22, name[0], size=11)
        p.text(x + 44, ty + 4, name, size=12, color=C["ink"], kind="b")
        p.text(x + 44, ty + 19, sub, size=10, color=C["ink3"])
        p.pill_btn(x + w - 14 - 56, ty + 1, 56, 24, "评价", C["surface2"], C["ink2"], size=10.5,
                   radius=8)
        ty += 32
    y += 108 + 12

    p.card(x, y, w, 80, fill=C["surface2"], border=C["surface2"])
    p.text(x + 14, y + 24, "评价规则", size=12, color=C["ink"], anchor="lm", kind="b")
    p.text(x + 14, y + 42, "只有被发起人确认到场的参与者可以评价；不能评价自己，", size=10.5,
           color=C["ink3"], max_w=w - 28)
    p.text(x + 14, y + 58, "同一场对同一个人只能评价一次。", size=10.5, color=C["ink3"])
    return


SCREENS = [
    ("P-01", "登录注册", "登录 / 注册", screen_login),
    ("P-02", "找局首页", "推荐理由", screen_discover),
    ("P-03", "活动列表", "筛选与分页", screen_activities),
    ("P-04", "活动详情（参与者）", "报名签到", screen_activity),
    ("P-05", "活动详情（发起人）", "签到码与考勤", screen_activity_organizer),
    ("P-06", "发起活动", "表单与校验", screen_activity_new),
    ("P-07", "签到", "签到码 / 定位", screen_checkin),
    ("P-08", "管理活动", "考勤结算", screen_manage_activity),
    ("P-09", "我的局", "发起 / 报名", screen_my_activities),
    ("P-10", "我的", "信用分与资料", screen_me),
    ("P-11", "个人主页（他人）", "评价与标签", screen_user),
    ("P-12", "评价同场伙伴", "星级与标签", screen_review),
]


# ============================================================================
# 6. 输出
# ============================================================================

def render_one(no, title, desc, fn, scale):
    im, p = new_phone(scale)
    fn(p)
    return im


def build_contact_sheet(images, scale):
    """把所有屏拼成一张总览图（3 列 × 4 行），顶部带标题栏。"""
    cols = 3
    rows = math.ceil(len(images) / cols)
    ratio = 0.72
    thumb_w = int(PHONE_W * ratio)
    thumb_h = int(PHONE_H * ratio)
    gap = 20
    cap_h = 34                      # 每屏标题条高度
    head_h = 112
    W = cols * thumb_w + (cols + 1) * gap
    H = head_h + rows * (thumb_h + cap_h) + (rows + 1) * gap
    sheet = Image.new("RGB", (W, H), (238, 241, 247))
    d = ImageDraw.Draw(sheet)

    f_head = font("b", 34)
    f_sub = font("r", 16)
    f_no = font("b", 18)
    f_title = font("b", 17)
    f_desc = font("r", 12)

    d.text((gap + 6, 26), "SportsBuddy · 界面原型总览", font=f_head, fill=(22, 24, 29))
    d.text((gap + 6, 72),
           "12 个画面 · 与前端代码同源（同一套设计令牌与页面结构）· 覆盖后端全部 19 个接口",
           font=f_sub, fill=(123, 131, 152))

    def fit(s, f, limit):
        if d.textlength(s, font=f) <= limit:
            return s
        while s and d.textlength(s + "…", font=f) > limit:
            s = s[:-1]
        return s + "…"

    for i, (im, (no, title, desc, _)) in enumerate(zip(images, SCREENS)):
        c, r = i % cols, i // cols
        x = gap + c * (thumb_w + gap)
        y = head_h + gap + r * (thumb_h + cap_h + gap)
        d.rounded_rectangle([x - 8, y - 6, x + thumb_w + 8, y + thumb_h + cap_h + 6],
                            radius=14, fill=(255, 255, 255), outline=(224, 228, 236))
        # 标题条：编号 + 标题 左对齐，说明右对齐；两者各自限宽，绝不重叠
        d.text((x, y + 4), no, font=f_no, fill=(255, 106, 61))
        no_w = d.textlength(no, font=f_no)
        desc_w = d.textlength(desc, font=f_desc)
        title_limit = thumb_w - no_w - desc_w - 22
        d.text((x + no_w + 8, y + 5), fit(title, f_title, title_limit), font=f_title,
               fill=(22, 24, 29))
        d.text((x + thumb_w, y + 8), desc, font=f_desc, fill=(146, 154, 172), anchor="ra")
        thumb = im.resize((thumb_w, thumb_h), Image.LANCZOS)
        sheet.paste(thumb, (x, y + cap_h - 8))
        d.rectangle([x, y + cap_h - 8, x + thumb_w, y + thumb_h + cap_h - 8],
                    outline=(224, 228, 236))
    return sheet


def main() -> int:
    ap = argparse.ArgumentParser(description="把界面原型渲染成 JPG")
    ap.add_argument("--scale", type=int, default=2, help="渲染倍率（默认 2，即 780×1688）")
    ap.add_argument("--only", default=None, help="只渲染某一屏，例如 --only=P-02")
    ap.add_argument("--quality", type=int, default=92, help="JPG 质量（默认 92）")
    args = ap.parse_args()

    OUT_DIR.mkdir(parents=True, exist_ok=True)

    targets = [s for s in SCREENS if not args.only or s[0] == args.only]
    if not targets:
        print(f"[错误] 没有匹配 --only={args.only} 的画面", file=sys.stderr)
        return 1

    images = []
    for no, title, desc, fn in SCREENS:
        if no not in [t[0] for t in targets]:
            continue
        im = render_one(no, title, desc, fn, args.scale)
        path = OUT_DIR / f"{no}_{title.replace('/', '-')}.jpg"
        im.convert("RGB").save(path, "JPEG", quality=args.quality, optimize=True)
        images.append(im)
        print(f"  ✓ {path.name}  {im.width}×{im.height}  {path.stat().st_size // 1024} KB")

    if not args.only:
        sheet = build_contact_sheet(images, args.scale)
        sheet_path = OUT_DIR / "00-总览.jpg"
        sheet.convert("RGB").save(sheet_path, "JPEG", quality=90, optimize=True)
        print(f"  ✓ {sheet_path.name}  {sheet.width}×{sheet.height}  "
              f"{sheet_path.stat().st_size // 1024} KB")

    print(f"\n输出目录：{OUT_DIR.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
