from PIL import Image, ImageDraw, ImageFilter
import os, math, random

ROOT = "/root/scrapletdashboard/src/skins/neon-v1"
OUT_SHARED = os.path.join(ROOT, "shared", "textures")
OUT_CRASH = os.path.join(ROOT, "crash", "textures")
os.makedirs(OUT_SHARED, exist_ok=True)
os.makedirs(OUT_CRASH, exist_ok=True)

def save(img, path):
    img.save(path, "PNG")
    print("WROTE", path)

def neon_glow(layer, radius=12, strength=2):
    # quick glow: blur then screen-ish composite
    blur = layer.filter(ImageFilter.GaussianBlur(radius))
    out = layer.copy()
    for _ in range(strength):
        out = Image.alpha_composite(out, blur)
    return out

def draw_scanlines(img, alpha=18, step=6):
    w,h = img.size
    d = ImageDraw.Draw(img)
    for y in range(0,h,step):
        d.rectangle([0,y,w,y+1], fill=(255,255,255,alpha))

def plate():
    w,h = 1920,1080
    img = Image.new("RGBA", (w,h), (0,0,0,0))

    # subtle dark wash so browser preview isn't "nothing"
    wash = Image.new("RGBA", (w,h), (10,14,25,210))
    img = Image.alpha_composite(img, wash)

    frame = Image.new("RGBA", (w,h), (0,0,0,0))
    d = ImageDraw.Draw(frame)

    # Outer frame
    pad = 36
    d.rounded_rectangle([pad,pad,w-pad,h-pad], radius=40, outline=(40,220,180,255), width=6)

    # Inner frame
    pad2 = 64
    d.rounded_rectangle([pad2,pad2,w-pad2,h-pad2], radius=34, outline=(250,200,40,220), width=3)

    # Corner ticks
    tick = 22
    for (x,y) in [(pad2,pad2),(w-pad2,pad2),(pad2,h-pad2),(w-pad2,h-pad2)]:
        # horizontal
        d.line([x, y, x+(tick if x< w/2 else -tick), y], fill=(230,230,230,180), width=3)
        # vertical
        d.line([x, y, x, y+(tick if y< h/2 else -tick)], fill=(230,230,230,180), width=3)

    # Glow
    glow = neon_glow(frame, radius=14, strength=2)
    img = Image.alpha_composite(img, glow)
    img = Image.alpha_composite(img, frame)

    # Scanlines + vignette
    draw_scanlines(img, alpha=16, step=6)
    vign = Image.new("L", (w,h), 0)
    vd = ImageDraw.Draw(vign)
    vd.ellipse([-w*0.2, -h*0.2, w*1.2, h*1.2], fill=220)
    vign = vign.filter(ImageFilter.GaussianBlur(80))
    vign_rgba = Image.new("RGBA", (w,h), (0,0,0,180))
    vign_rgba.putalpha(Image.eval(vign, lambda p: 255-p))
    img = Image.alpha_composite(img, vign_rgba)

    save(img, os.path.join(OUT_SHARED, "plate.png"))

def rocket():
    w,h = 512,512
    img = Image.new("RGBA", (w,h), (0,0,0,0))
    layer = Image.new("RGBA", (w,h), (0,0,0,0))
    d = ImageDraw.Draw(layer)

    # Rocket body (simple stylized silhouette)
    cx, cy = w//2, h//2 + 10
    body = [
        (cx-60, cy+70),
        (cx+60, cy+70),
        (cx+90, cy+10),
        (cx+30, cy-110),
        (cx,   cy-150),
        (cx-30, cy-110),
        (cx-90, cy+10),
    ]
    d.polygon(body, fill=(30, 180, 140, 220))  # teal fill

    # Window
    d.ellipse([cx-26, cy-95, cx+26, cy-43], outline=(230,230,230,220), width=4)
    d.ellipse([cx-18, cy-87, cx+18, cy-51], fill=(8,12,20,200))

    # Outline stroke
    d.line(body + [body[0]], fill=(180,255,230,255), width=6, joint="curve")

    # Side fins
    d.polygon([(cx-75, cy+60),(cx-130, cy+90),(cx-80, cy+10)], fill=(250,200,40,210))
    d.polygon([(cx+75, cy+60),(cx+130, cy+90),(cx+80, cy+10)], fill=(250,200,40,210))

    glow = neon_glow(layer, radius=10, strength=2)
    img = Image.alpha_composite(img, glow)
    img = Image.alpha_composite(img, layer)

    save(img, os.path.join(OUT_CRASH, "rocket.png"))

def flame():
    w,h = 256,512
    img = Image.new("RGBA", (w,h), (0,0,0,0))
    layer = Image.new("RGBA", (w,h), (0,0,0,0))
    d = ImageDraw.Draw(layer)

    # Flame shape (stacked teardrops)
    cx = w//2
    base_y = h-40
    for i,(r,a) in enumerate([(90,210),(70,220),(50,230),(34,240)]):
        top = 90 + i*30
        d.polygon([
            (cx, top),
            (cx-r, base_y-40),
            (cx, base_y),
            (cx+r, base_y-40),
        ], fill=(250,200,40,a))

    # Inner core
    d.polygon([(cx,140),(cx-28, base_y-70),(cx, base_y-10),(cx+28, base_y-70)], fill=(255,255,255,190))

    # Glow
    glow = neon_glow(layer, radius=14, strength=2)
    img = Image.alpha_composite(img, glow)
    img = Image.alpha_composite(img, layer)

    save(img, os.path.join(OUT_CRASH, "flame.png"))

def boom():
    w,h = 512,512
    img = Image.new("RGBA", (w,h), (0,0,0,0))
    layer = Image.new("RGBA", (w,h), (0,0,0,0))
    d = ImageDraw.Draw(layer)

    cx, cy = w//2, h//2
    # Burst spikes
    spikes = 18
    r1, r2 = 120, 200
    pts = []
    for i in range(spikes*2):
        ang = (math.pi * 2) * (i / (spikes*2))
        r = r2 if i%2==0 else r1
        x = cx + math.cos(ang)*r
        y = cy + math.sin(ang)*r
        pts.append((x,y))

    d.polygon(pts, fill=(239,68,68,180))
    d.ellipse([cx-110, cy-110, cx+110, cy+110], fill=(255,255,255,90))
    d.ellipse([cx-70, cy-70, cx+70, cy+70], fill=(250,200,40,120))

    # Ring
    d.ellipse([cx-210, cy-210, cx+210, cy+210], outline=(255,120,120,200), width=10)

    glow = neon_glow(layer, radius=18, strength=2)
    img = Image.alpha_composite(img, glow)
    img = Image.alpha_composite(img, layer)

    save(img, os.path.join(OUT_CRASH, "boom.png"))

if __name__ == "__main__":
    plate()
    rocket()
    flame()
    boom()
