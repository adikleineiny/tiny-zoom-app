"""Generate the Tiny Zoom app icon (1024x1024, no alpha) and launch/splash images.
Run:  python3 resources/make_icons.py   (needs Pillow)
"""
from PIL import Image, ImageDraw, ImageFont, ImageFilter
import os

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
S = 4  # supersampling
N = 1024 * S

def lerp(a, b, t):
    return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(3))

def rr(d, box, r, fill, outline=None, width=0):
    d.rounded_rectangle([int(v) for v in box], radius=int(r), fill=fill, outline=outline, width=int(width))

def draw_car(d, cx, cy, k):
    """Toy RC car, side view, centre (cx, cy), scale k (1.0 ~ 1024px icon)."""
    u = lambda v: v * k * S
    ox, oy = cx * S, cy * S
    P = lambda x, y: (ox + u(x), oy + u(y))
    ink = (24, 28, 48)
    ow = u(14)
    # shadow
    d.ellipse([*P(-360, 150), *P(360, 205)], fill=(0, 0, 0, 60))
    # antenna (RC!)
    d.line([P(150, -60), P(250, -330)], fill=ink, width=int(u(14)))
    d.ellipse([*P(232, -360), *P(272, -320)], fill=(255, 214, 10), outline=ink, width=int(u(8)))
    # rear spoiler
    d.polygon([P(-330, -130), P(-200, -130), P(-215, -95), P(-320, -95)], fill=(255, 214, 10), outline=ink, width=int(ow*0.7))
    d.line([P(-275, -100), P(-260, -30)], fill=ink, width=int(u(18)))
    # cabin / windshield
    d.polygon([P(-170, -40), P(-110, -175), P(90, -175), P(190, -40)], fill=ink)
    d.polygon([P(-135, -50), P(-90, -150), P(-5, -150), P(-5, -50)], fill=(140, 220, 255))
    d.polygon([P(15, -50), P(15, -150), P(75, -150), P(150, -50)], fill=(140, 220, 255))
    # body
    rr(d, [*P(-360, -60), *P(360, 110)], u(70), fill=(235, 45, 60), outline=ink, width=ow)
    # stripe + number
    d.rectangle([*P(-330, 0), *P(330, 30)], fill=(255, 255, 255))
    d.ellipse([*P(-60, -45), *P(40, 55)], fill=(255, 255, 255), outline=ink, width=int(u(8)))
    # headlight
    d.ellipse([*P(300, -30), *P(345, 15)], fill=(255, 240, 150), outline=ink, width=int(u(6)))
    # wheels
    for wx in (-215, 215):
        d.ellipse([*P(wx - 115, 25), *P(wx + 115, 255)], fill=ink)
        d.ellipse([*P(wx - 60, 80), *P(wx + 60, 200)], fill=(220, 225, 235))
        d.ellipse([*P(wx - 22, 118), *P(wx + 22, 162)], fill=ink)

def number_font(px):
    for f in ("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
              "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf"):
        if os.path.exists(f):
            return ImageFont.truetype(f, px)
    return ImageFont.load_default()

def background(w, h):
    img = Image.new("RGB", (w, h))
    d = ImageDraw.Draw(img)
    top, bot = (255, 196, 30), (255, 120, 40)   # bright sunny orange sky
    for y in range(h):
        d.line([(0, y), (w, y)], fill=lerp(top, bot, y / h))
    return img

def make_icon():
    img = background(N, N)  # RGB so RGBA fills blend
    d = ImageDraw.Draw(img, "RGBA")
    # sun burst rays
    import math
    c = (N * 0.5, N * 0.55)
    for i in range(16):
        a0 = i * math.pi / 8
        a1 = a0 + math.pi / 16
        R = N
        d.polygon([c, (c[0] + R * math.cos(a0), c[1] + R * math.sin(a0)),
                   (c[0] + R * math.cos(a1), c[1] + R * math.sin(a1))], fill=(255, 255, 255, 55))
    # checkered race floor
    fy = int(N * 0.76)
    sq = N // 8
    for row in range(5):
        for col in range(9):
            col_ = (255, 255, 255) if (row + col) % 2 == 0 else (30, 34, 60)
            d.rectangle([col * sq, fy + row * sq // 2, (col + 1) * sq, fy + (row + 1) * sq // 2], fill=col_)
    # speed lines
    for i, (y, x0, x1) in enumerate([(0.40, 0.02, 0.17), (0.50, 0.00, 0.12), (0.60, 0.04, 0.15)]):
        rr(d, [x0 * N, y * N, x1 * N, y * N + 22 * S], 11 * S, fill=(255, 255, 255, 230))
    draw_car(d, 540, 600, 1.05)
    # number on the car
    f = number_font(int(70 * S))
    d.text((532 * S, 608 * S), "1", font=f, fill=(24, 28, 48), anchor="mm")
    out = img.convert("RGB").resize((1024, 1024), Image.LANCZOS)
    return out

def make_splash():
    W = 2732
    img = Image.new("RGB", (W, W), (255, 160, 35))
    icon = make_icon().resize((640, 640), Image.LANCZOS)
    # rounded mask for a nicer look on the splash
    m = Image.new("L", (640, 640), 0)
    ImageDraw.Draw(m).rounded_rectangle([0, 0, 639, 639], radius=140, fill=255)
    img.paste(icon, ((W - 640) // 2, (W - 640) // 2 - 120), m)
    d = ImageDraw.Draw(img)
    d.text((W // 2, W // 2 + 330), "Tiny Zoom", font=number_font(150), fill=(255, 255, 255), anchor="mm",
           stroke_width=8, stroke_fill=(24, 28, 48))
    return img

if __name__ == "__main__":
    icon = make_icon()
    icon.save(os.path.join(HERE, "icon-1024.png"))
    ios = os.path.join(ROOT, "ios/App/App/Assets.xcassets")
    if os.path.isdir(ios):
        icon.save(os.path.join(ios, "AppIcon.appiconset/AppIcon-512@2x.png"))
        sp = make_splash()
        sp.save(os.path.join(HERE, "splash-2732.png"))
        for n in ("splash-2732x2732.png", "splash-2732x2732-1.png", "splash-2732x2732-2.png"):
            sp.save(os.path.join(ios, "Splash.imageset", n))
    # web icons too (used by the PWA manifest / apple-touch-icon)
    www = os.path.join(ROOT, "www")
    icon.resize((512, 512), Image.LANCZOS).save(os.path.join(www, "icon-512.png"))
    icon.resize((192, 192), Image.LANCZOS).save(os.path.join(www, "icon-192.png"))
    print("icons written")
