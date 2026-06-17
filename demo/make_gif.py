#!/usr/bin/env python3
"""Render demo/demo.gif — an animated, progressive-reveal terminal card.

Pure Pillow (no VHS/ffmpeg/terminal needed). Run:
    python demo/make_gif.py
"""
from __future__ import annotations
import os
from PIL import Image, ImageDraw, ImageFont

OUT = os.path.join(os.path.dirname(__file__), "demo.gif")

# palette (GitHub-dark-ish)
BG = (13, 17, 23); CARD = (22, 27, 34); BAR = (28, 33, 40)
COL = {
    "fg": (201, 209, 217), "dim": (110, 118, 129), "green": (63, 185, 80),
    "cyan": (86, 212, 221), "yellow": (210, 153, 34), "red": (248, 81, 73),
    "tok": (121, 192, 255), "person": (188, 140, 255), "white": (240, 246, 252),
}

def font(sz, bold=False):
    p = "C:/Windows/Fonts/consolab.ttf" if bold else "C:/Windows/Fonts/consola.ttf"
    try:
        return ImageFont.truetype(p, sz)
    except OSError:
        return ImageFont.load_default()

F = font(22); FB = font(22, True); FT = font(18)

# Each row = list of (text, colorkey[, bold]) segments. [] = blank line.
def s(t, c="fg", b=False): return (t, c, b)
ROWS = [
    [s("$ ", "dim"), s("python demo/demo.py", "white")],
    [],
    [s("ClawWarden ", "white", True), s("— the model never sees real PII, and you can prove it", "dim")],
    [s("─" * 60, "dim")],
    [s("PROMPT (raw):  ", "yellow", True), s("Approve $42,500 loan for ", "fg"), s("Jane Smith", "person"), s(",", "fg")],
    [s("               ", "fg"), s("SSN ", "fg"), s("123-45-6789", "person"), s(", acct ", "fg"), s("ACC-00198234", "person"), s(". Score 742.", "fg")],
    [],
    [s("DETECTED:  ", "cyan", True), s("PERSON ", "fg"), s("'Jane Smith'", "person"), s(" · SSN · ACCOUNT       ", "fg"), s("[restricted]", "dim")],
    [],
    [s("TOKENIZED ", "green", True), s("(this is all the model sees):", "dim")],
    [s("   Approve $42,500 loan for ", "fg"), s("{{PERSON_1}}", "tok"), s(", SSN ", "fg"), s("{{SSN_1}}", "tok"), s(",", "fg")],
    [s("   acct ", "fg"), s("{{ACCT_1}}", "tok"), s(". Score 742.        ", "fg"), s("← $ and score kept", "dim")],
    [],
    [s("MODEL:  ", "cyan", True), s("{{PERSON_1}}", "tok"), s(" qualifies — score 742, approve.", "fg")],
    [],
    [s("DETOKENIZE by role:", "yellow", True)],
    [s("   junior_analyst  →  ", "dim"), s("{{PERSON_1}}", "tok"), s(" qualifies — approve.", "fg")],
    [s("   vp_risk         →  ", "dim"), s("Jane Smith", "person"), s(" qualifies — approve.", "fg")],
    [],
    [s("AUDIT (hash-chained):  ", "yellow", True), s("verify_chain() → ", "fg"), s("OK ✓", "green", True)],
    [s("   edit one record     →  ", "dim"), s("verify_chain() → ", "fg"), s("BROKEN ✗", "red", True)],
]

PAD = 26; LINE_H = 32; BAR_H = 38
# canvas size from widest row
def rowwidth(row):
    w = 0
    for t, c, b in row:
        w += (FB if b else F).getlength(t)
    return w
W = int(max((rowwidth(r) for r in ROWS), default=600)) + PAD * 2 + 20
H = BAR_H + PAD + LINE_H * len(ROWS) + PAD

def draw_frame(n_rows):
    img = Image.new("RGB", (W, H), BG)
    d = ImageDraw.Draw(img)
    d.rounded_rectangle([6, 6, W - 6, H - 6], radius=14, fill=CARD)
    d.rounded_rectangle([6, 6, W - 6, BAR_H], radius=14, fill=BAR)
    for i, col in enumerate([(255, 95, 86), (255, 189, 46), (39, 201, 63)]):
        d.ellipse([20 + i * 22, 14, 32 + i * 22, 26], fill=col)
    d.text((W // 2, BAR_H // 2), "clawwarden — demo", font=FT, fill=COL["dim"], anchor="mm")
    y = BAR_H + PAD
    for row in ROWS[:n_rows]:
        x = PAD + 6
        for t, c, b in row:
            fnt = FB if b else F
            d.text((x, y), t, font=fnt, fill=COL[c])
            x += fnt.getlength(t)
        y += LINE_H
    return img

frames, durations = [], []
for i in range(1, len(ROWS) + 1):
    frames.append(draw_frame(i))
    durations.append(90 if not ROWS[i - 1] else 460)  # blanks flash by
# hold the final frame
frames.append(draw_frame(len(ROWS))); durations.append(3200)

frames[0].save(OUT, save_all=True, append_images=frames[1:], duration=durations,
               loop=0, optimize=True, disposal=2)
print(f"wrote {OUT}  ({W}x{H}, {len(frames)} frames)")
