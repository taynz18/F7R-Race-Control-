"""Flag artwork and resize geometry shared by the app and its tests."""
from functools import lru_cache
from io import BytesIO
from pathlib import Path
import sys
from PIL import Image, ImageDraw, ImageFont

TRANSPARENT = '#010203'
MIN_WIDTH, MAX_WIDTH, MIN_HEIGHT, MAX_HEIGHT = 240, 1200, 90, 480
COLORS = {
    'YELLOW': ('#ffda36', '#9c7600'), 'SAFETY CAR': ('#ffda36', '#9c7600'),
    'FCY': ('#ffda36', '#9c7600'), 'RED': ('#ff5558', '#971824'),
    'GREEN': ('#49dc8b', '#166d40'), 'BLUE': ('#579aff', '#234d94'),
    'WHITE': ('#f4f4ef', '#92958c'), 'BLACK': ('#252b30', '#080b0c'),
    'CHEQUERED': ('#efefed', '#565c60'),
}


def asset_path(name):
    return Path(getattr(sys, '_MEIPASS', Path(__file__).parent)) / 'assets' / name


def clamp(value, low, high):
    return max(low, min(high, int(value)))


def rgb(color):
    return tuple(int(color[i:i+2], 16) for i in (1, 3, 5))


def blend(first, second, amount):
    return tuple(round(a*(1-amount)+b*amount) for a, b in zip(first, second))


def close_bounds(width):
    return width-36, 9, width-10, 35


def hit_zone(x, y, width, height):
    left, top, right, bottom = close_bounds(width)
    if left <= x <= right and top <= y <= bottom:
        return 'close'
    if not 0 <= x <= width or not 0 <= y <= height:
        return 'move'
    # Larger corner targets make resizing easy without covering the flag text.
    horizontal = 'w' if x < 16 else 'e' if x > width-16 else ''
    vertical = 'n' if y < 16 else 's' if y > height-16 else ''
    return vertical+horizontal or 'move'


def resize_from_edge(rect, edge, dx, dy):
    if edge not in ('n','s','e','w','ne','nw','se','sw'):
        raise ValueError('Unknown resize edge')
    x, y, width, height = rect
    right, bottom = x+width, y+height
    if 'w' in edge:
        width = clamp(width-dx, MIN_WIDTH, MAX_WIDTH)
        x = right-width
    elif 'e' in edge:
        width = clamp(width+dx, MIN_WIDTH, MAX_WIDTH)
    if 'n' in edge:
        height = clamp(height-dy, MIN_HEIGHT, MAX_HEIGHT)
        y = bottom-height
    elif 's' in edge:
        height = clamp(height+dy, MIN_HEIGHT, MAX_HEIGHT)
    return x, y, width, height


def visible_on_monitors(rect, monitors):
    x, y, width, height = rect
    return any(min(x+width, right)-max(x, left) >= 30 and
               min(y+height, bottom)-max(y, top) >= 30
               for left, top, right, bottom in monitors)


@lru_cache(maxsize=96)
def racing_font(size):
    return ImageFont.truetype(BytesIO(font_bytes()), size)


@lru_cache(maxsize=1)
def font_bytes():
    return asset_path('RacingSansOne-Regular.ttf').read_bytes()


def render_flag(width, height, flag, hover_close=False, handles=False, demo=False):
    """Render at 2x resolution for smooth text and genuinely rounded corners."""
    width, height = int(width), int(height)
    scale = 2
    w, h = width*scale, height*scale
    fill_hex, border_hex = COLORS.get(flag, ('#263447', '#111925'))
    fill, border = rgb(fill_hex), rgb(border_hex)
    image = Image.new('RGB', (w, h), rgb(TRANSPARENT))
    draw = ImageDraw.Draw(image)
    radius = min(27*scale, h//4)
    inset = max(6, min(10, int(width*.019)))*scale
    draw.rounded_rectangle((2, 2, w-3, h-3), radius=radius, fill=border)
    mask = Image.new('L', (w, h), 0)
    ImageDraw.Draw(mask).rounded_rectangle((inset, inset, w-inset-1, h-inset-1),
        radius=max(1, radius-inset//2), fill=255)
    panel = Image.new('RGB', (w, h))
    panel_draw = ImageDraw.Draw(panel)
    top, bottom = blend(fill, (255,255,255), .11), blend(fill, (0,0,0), .09)
    for y in range(h):
        panel_draw.line((0, y, w, y), fill=blend(top, bottom, y/max(1,h-1)))
    if flag == 'CHEQUERED':
        cell = max(14, width//16)*scale
        for row, y in enumerate(range(0, h, cell)):
            for col, x in enumerate(range(0, w, cell)):
                panel_draw.rectangle((x,y,x+cell-1,y+cell-1),
                    fill='#edf1f5' if (row+col)%2 == 0 else '#222b38')
    image.paste(panel, (0,0), mask)
    draw = ImageDraw.Draw(image)
    foreground = (243,247,255) if flag in ('BLACK','CHEQUERED','OFFLINE','CONNECTING','SETUP','CLEAR') else (16,23,32)
    text = 'NO ACTIVE FLAG' if flag == 'CLEAR' else 'CONNECTING' if flag == 'SETUP' else flag
    font_size = max(16*scale, min(int(h*.45), int(w*.14)))
    available = w-88*scale
    while font_size > 12*scale and racing_font(font_size).getlength(text) > available:
        font_size -= scale
    font = racing_font(font_size)
    box = draw.textbbox((0,0), text, font=font)
    text_width, text_height = box[2]-box[0], box[3]-box[1]
    center_x, center_y = w/2-4*scale, h/2
    if flag == 'CHEQUERED':
        draw.rounded_rectangle((center_x-text_width/2-14*scale, center_y-text_height/2-11*scale,
            center_x+text_width/2+14*scale, center_y+text_height/2+11*scale),
            radius=10*scale, fill='#131b27')
    draw.text((center_x-text_width/2-box[0], center_y-text_height/2-box[1]), text,
              fill=foreground, font=font)
    x1,y1,x2,y2 = (v*scale for v in close_bounds(width))
    close_background = (35,44,58) if flag == 'CHEQUERED' else blend(fill, foreground, .22 if hover_close else .10)
    draw.rounded_rectangle((x1,y1,x2,y2), radius=8*scale, fill=close_background)
    cx, cy = (x1+x2)/2, (y1+y2)/2
    for direction in (-1,1):
        draw.line((cx-4*scale, cy-direction*4*scale, cx+4*scale, cy+direction*4*scale),
                  fill=foreground, width=2*scale)
    if handles:
        grip = blend(fill, foreground, .55)
        for offset in (0, 5*scale):
            draw.line((w-24*scale+offset, h-13*scale, w-13*scale, h-24*scale+offset),
                      fill=grip, width=scale)
    if demo:
        tiny = racing_font(8*scale)
        draw.text((w/2,h-13*scale), 'LOCAL PREVIEW', font=tiny, anchor='mm', fill=foreground)
    return image.resize((width,height), Image.Resampling.LANCZOS)
