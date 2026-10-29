"""F7R Windows driver overlay and compact local controls."""
import asyncio
import json
from io import BytesIO
import os
from pathlib import Path
import queue
import sys
import threading
import time
import math
import webbrowser
from types import SimpleNamespace
import tkinter as tk
from tkinter import ttk
from PIL import Image, ImageTk

from connection import FLAGS, receive_flags, validate_config
from radio_audio import RadioAudio
from overlay_ui import (COLORS, TRANSPARENT, MIN_WIDTH, MAX_WIDTH, MIN_HEIGHT, MAX_HEIGHT,
                        clamp, hit_zone, resize_from_edge, visible_on_monitors, render_flag)

from controls_ui import (BG, PANEL, INK, MUTED, ACCENT, RoundedPanel,
    RoundedButton, Toggle, SizeSlider, enable_dpi_awareness, ui_scale, font as ui_font)


def application_version():
    folder=Path(getattr(sys,'_MEIPASS',Path(__file__).parent))
    try:
        return str(json.loads((folder/'app-version.json').read_text(encoding='utf-8-sig'))['version'])
    except (OSError,ValueError,KeyError,TypeError):
        return 'development'


APP_VERSION=application_version()
FLAG_WEBSITE='https://taynz18.github.io/F7R-Race-Control-/admin.html'


def bundled_config():
    folder = Path(getattr(sys, '_MEIPASS', Path(__file__).parent))
    try:
        return json.loads((folder / 'config.json').read_text(encoding='utf-8-sig'))
    except (OSError, ValueError):
        return {}


def connection_config(settings):
    # A new release's configuration takes precedence over an old saved key.
    for config in (bundled_config(), settings.get('config', {})):
        try:
            validate_config(config)
            return config
        except (ValueError, AttributeError, TypeError):
            pass
    return None


def monitor_rectangles(root):
    if sys.platform == 'win32':
        import ctypes
        from ctypes import wintypes
        rectangles = []
        callback_type = ctypes.WINFUNCTYPE(wintypes.BOOL, wintypes.HANDLE, wintypes.HDC,
                                           ctypes.POINTER(wintypes.RECT), wintypes.LPARAM)
        def collect(monitor, dc, rect, data):
            r = rect.contents
            rectangles.append((r.left,r.top,r.right,r.bottom))
            return True
        callback = callback_type(collect)
        ctypes.windll.user32.EnumDisplayMonitors(None,None,callback,0)
        if rectangles:
            return rectangles
    return [(0,0,root.winfo_screenwidth(),root.winfo_screenheight())]


class DriverApp:
    def __init__(self, root, demo=False):
        self.root, self.demo = root, demo
        self.events, self.stop = queue.Queue(), threading.Event()
        self.worker, self.gesture, self.draw_job, self.save_job = None, None, None, None
        self.hover_close, self.show_handles, self.closed = False, False, False
        self.flag = 'YELLOW' if demo else 'CONNECTING'
        self.custom_message, self.countdown_ends_at, self.clock_offset = '', None, 0.0
        self.countdown_display = None
        self.signal_started = None
        self.settings_file = Path(os.environ.get('LOCALAPPDATA', str(Path.home()))) / 'RaceFlags' / 'settings.json'
        try:
            self.settings = json.loads(self.settings_file.read_text(encoding='utf-8'))
            if not isinstance(self.settings,dict): self.settings = {}
        except (OSError,ValueError):
            self.settings = {}
        def number(name, default):
            try: return int(self.settings.get(name,default))
            except (ValueError,TypeError): return default
        # Older releases were DPI-virtualized by Windows. Convert saved logical
        # placement once so a DPI-aware update preserves the on-screen footprint.
        if self.settings and number('geometry_version',1)<2:
            ratio=root.winfo_fpixels('1i')/96 if sys.platform=='win32' else 1
            for key in ('width','height','x','y'):
                if key in self.settings:self.settings[key]=round(number(key,0)*ratio)
        self.settings['geometry_version']=2
        self.width = clamp(number('width',380),MIN_WIDTH,MAX_WIDTH)
        self.height = clamp(number('height',int(self.width*.33)),MIN_HEIGHT,MAX_HEIGHT)
        self.hide_clear = tk.BooleanVar(value=bool(self.settings.get('hide_clear',True)))
        self.size = tk.DoubleVar(value=self.width)
        self.size_text = tk.StringVar()
        self.volume=tk.DoubleVar(value=clamp(number('audio_volume',65),0,100))
        self.audio_enabled=tk.BooleanVar(value=not bool(self.settings.get('audio_muted',False)))
        self.volume_text=tk.StringVar()
        self.audio=RadioAudio(volume=self.volume.get(),muted=not self.audio_enabled.get(),enabled=not demo)
        self.status = tk.StringVar(value='Local preview · not connected' if demo else 'Connecting to race control…')
        self.config = connection_config(self.settings)
        self.ui_scale=ui_scale(root)
        u=lambda value: max(1,round(value*self.ui_scale))
        f=lambda pixels,weight='normal':ui_font(self.ui_scale,pixels,weight)
        assets=Path(getattr(sys,'_MEIPASS',Path(__file__).parent))/'assets'
        logo=Image.open(BytesIO((assets/'f7r-logo.png').read_bytes())).convert('RGBA')
        icon=Image.open(BytesIO((assets/'f7r-app.ico').read_bytes())).convert('RGBA')
        self.app_icon=ImageTk.PhotoImage(icon,master=root)
        root.iconphoto(True,self.app_icon)
        brand=logo.copy()
        brand.thumbnail((u(108),u(28)),Image.Resampling.LANCZOS)
        self.brand_image=ImageTk.PhotoImage(brand,master=root)
        root.title(f'F7R · Driver controls · {APP_VERSION}')
        root.configure(bg=BG)
        root.resizable(False,False)
        outer=tk.Frame(root,bg=BG,padx=u(26),pady=u(24))
        outer.pack(fill='both',expand=True)
        header=tk.Frame(outer,bg=BG)
        header.pack(fill='x')
        tk.Label(header,image=self.brand_image,bg=BG,bd=0).pack(side='left')
        tk.Label(header,text=f'DRIVER DISPLAY  /  {APP_VERSION}',bg=BG,fg='#8392a8',font=f(10,'bold')).pack(side='right',pady=u(7))
        tk.Label(outer,text='Your race. Your view.',bg=BG,fg=INK,font=f(27,'bold')).pack(anchor='w',pady=(u(24),u(8)))
        status_row=tk.Frame(outer,bg=BG)
        status_row.pack(fill='x',pady=(0,u(23)))
        self.status_dot=tk.Label(status_row,text='●',bg=BG,fg='#e6bb63',font=f(10),bd=0)
        self.status_dot.pack(side='left',padx=(0,u(7)))
        tk.Label(status_row,textvariable=self.status,bg=BG,fg=MUTED,font=f(12),wraplength=u(340),justify='left',bd=0).pack(side='left')
        self.status.trace_add('write',self.update_status_colour)
        self.update_status_colour()
        card=RoundedPanel(outer,330,self.ui_scale)
        card.pack(fill='x')
        content=tk.Frame(card,bg=PANEL)
        content_width=430-52-40
        card.create_window(u(20),u(20),window=content,anchor='nw',width=u(content_width))
        size_row=tk.Frame(content,bg=PANEL)
        size_row.pack(fill='x')
        tk.Label(size_row,text='Overlay size',bg=PANEL,fg=INK,font=f(13,'bold'),bd=0).pack(side='left')
        tk.Label(size_row,textvariable=self.size_text,bg='#202c3d',fg='#bdcbe0',font=f(11),padx=u(9),pady=u(5)).pack(side='right')
        self.scale=SizeSlider(content,self.size,self.slider_resize,MIN_WIDTH,MAX_WIDTH,self.ui_scale)
        self.scale.pack(fill='x',pady=(u(8),0))
        endpoints=tk.Frame(content,bg=PANEL)
        endpoints.pack(fill='x')
        tk.Label(endpoints,text='Small',bg=PANEL,fg='#75869e',font=f(10),bd=0).pack(side='left')
        tk.Label(endpoints,text='Large',bg=PANEL,fg='#75869e',font=f(10),bd=0).pack(side='right')
        tk.Frame(content,bg='#2b3749',height=u(1)).pack(fill='x',pady=(u(19),u(17)))
        toggle_row=tk.Frame(content,bg=PANEL)
        toggle_row.pack(fill='x')
        tk.Label(toggle_row,text='Transparent mode',bg=PANEL,fg=INK,font=f(13,'bold'),bd=0).pack(side='left')
        self.toggle=Toggle(toggle_row,self.hide_clear,self.changed,self.ui_scale)
        self.toggle.pack(side='right')
        tk.Label(content,text='Hide when no flag is active.',bg=PANEL,fg=MUTED,font=f(11),bd=0).pack(anchor='w',pady=(u(4),0))
        tk.Frame(content,bg='#2b3749',height=u(1)).pack(fill='x',pady=(u(17),u(14)))
        audio_row=tk.Frame(content,bg=PANEL)
        audio_row.pack(fill='x')
        tk.Label(audio_row,text='Radio audio',bg=PANEL,fg=INK,font=f(13,'bold'),bd=0).pack(side='left')
        self.audio_toggle=Toggle(audio_row,self.audio_enabled,self.audio_changed,self.ui_scale)
        self.audio_toggle.pack(side='right')
        tk.Label(audio_row,textvariable=self.volume_text,bg=PANEL,fg=MUTED,font=f(11),bd=0).pack(side='right',padx=u(10))
        self.volume_slider=SizeSlider(content,self.volume,self.volume_changed,0,100,self.ui_scale)
        self.volume_slider.pack(fill='x',pady=(u(7),0))
        tk.Label(content,text='Flag calls, countdowns & radio clicks',bg=PANEL,fg=MUTED,font=f(10),bd=0).pack(anchor='w')
        self.refresh_volume_label()
        help_row=tk.Frame(outer,bg=BG)
        help_row.pack(fill='x',pady=(u(20),u(20)))
        self.audio_test_button=RoundedButton(help_row,'Test audio',self.test_audio,self.ui_scale)
        self.audio_test_button.configure(width=u(100),height=u(36))
        self.audio_test_button.pack(side='right',padx=(u(10),0))
        tk.Label(help_row,text='MOVE & RESIZE',bg=BG,fg='#8294ae',font=f(9,'bold'),bd=0).pack(anchor='w')
        tk.Label(help_row,text='Drag to move. Drag edges to resize.',bg=BG,fg='#b1bfd2',font=f(11),bd=0).pack(anchor='w',pady=(u(5),0))
        actions=tk.Frame(outer,bg=BG)
        actions.pack(fill='x')
        actions.grid_columnconfigure(0,weight=1,uniform='action')
        actions.grid_columnconfigure(1,weight=1,uniform='action')
        self.website_button=RoundedButton(actions,'Open Flag Website ↗',self.open_flag_website,self.ui_scale)
        self.website_button.configure(width=u(178))
        self.website_button.grid(row=0,column=0,sticky='ew',padx=(0,u(5)))
        self.close_button=RoundedButton(actions,'Close Race Flags',self.close,self.ui_scale)
        self.close_button.configure(width=u(178))
        self.close_button.grid(row=0,column=1,sticky='ew',padx=(u(5),0))
        if demo:
            self.demo_flag=tk.StringVar(value='YELLOW')
            pick=ttk.Combobox(outer,textvariable=self.demo_flag,values=sorted(FLAGS),state='readonly')
            pick.pack(fill='x',pady=u(7))
            pick.bind('<<ComboboxSelected>>',lambda _:self.set_demo(self.demo_flag.get()))
        root.update_idletasks()
        control_width=u(430)
        control_height=root.winfo_reqheight()
        root.geometry(f'{control_width}x{control_height}+{max(0,(root.winfo_screenwidth()-control_width)//2)}+{max(0,(root.winfo_screenheight()-control_height)//2)}')
        self.overlay = tk.Toplevel(root)
        self.overlay.title('F7R · Flag overlay')
        self.overlay.withdraw()
        self.overlay.overrideredirect(True)
        self.overlay.attributes('-topmost',True)
        self.overlay.configure(bg=TRANSPARENT)
        try: self.overlay.wm_attributes('-transparentcolor',TRANSPARENT)
        except tk.TclError: pass
        self.canvas = tk.Canvas(self.overlay,bd=0,highlightthickness=0,bg=TRANSPARENT)
        self.canvas.pack(fill='both',expand=True)
        self.canvas.bind('<Configure>',self.configured)
        self.canvas.bind('<Motion>',self.pointer_motion)
        self.canvas.bind('<Enter>',self.pointer_motion)
        self.canvas.bind('<Leave>',self.pointer_leave)
        self.canvas.bind('<Button-1>',self.pointer_down)
        self.canvas.bind('<B1-Motion>',self.pointer_drag)
        self.canvas.bind('<ButtonRelease-1>',self.pointer_up)
        self.overlay.bind('<Alt-F4>',lambda _: self.close())
        self.overlay.geometry(f'{self.width}x{self.height}+80+80')
        self.overlay.update_idletasks()
        position=(number('x',80),number('y',80),self.width,self.height)
        if not visible_on_monitors(position,monitor_rectangles(root)):
            position=(80,80,self.width,self.height)
        self.set_geometry(position)
        self.overlay.deiconify()
        self.update_size_text()
        root.protocol('WM_DELETE_WINDOW',self.close)
        root.after(100,self.dark_titlebar)
        self.draw()
        self.tick()
        if not demo:
            root.after(100,self.connect)

    def dark_titlebar(self):
        if sys.platform == 'win32':
            import ctypes
            try:
                hwnd = ctypes.windll.user32.GetParent(self.root.winfo_id())
                value = ctypes.c_int(1)
                ctypes.windll.dwmapi.DwmSetWindowAttribute(ctypes.c_void_p(hwnd),20,
                    ctypes.byref(value),ctypes.sizeof(value))
                corner=ctypes.c_int(2)
                ctypes.windll.dwmapi.DwmSetWindowAttribute(ctypes.c_void_p(hwnd),33,
                    ctypes.byref(corner),ctypes.sizeof(corner))
            except (AttributeError,OSError): pass

    def refresh_volume_label(self):
        self.volume_text.set(f'{round(self.volume.get())}%' if self.audio_enabled.get() and self.volume.get()>0 else 'Muted')

    def volume_changed(self,value):
        self.audio.set_level(value,not self.audio_enabled.get())
        self.refresh_volume_label()
        self.schedule_save()

    def audio_changed(self):
        self.audio.set_level(self.volume.get(),not self.audio_enabled.get())
        self.refresh_volume_label()
        self.schedule_save()

    def test_audio(self):
        self.audio.preview()

    def open_flag_website(self):
        try:
            opened=webbrowser.open_new_tab(FLAG_WEBSITE)
        except OSError:
            opened=False
        if not opened:
            self.status.set('Could not open your browser. Visit the F7R flag website.')

    def update_status_colour(self,*_):
        status=self.status.get().lower()
        colour='#6ee5a5' if status.startswith('connected') else '#ff7b87' if 'lost' in status or 'not configured' in status else '#e6bb63'
        self.status_dot.configure(fg=colour)

    def set_demo(self, flag):
        self.flag = flag
        self.draw()

    def connect(self):
        if self.closed or (self.worker and self.worker.is_alive()): return
        if not self.config:
            self.flag = 'OFFLINE'
            self.status.set('Connection not configured. Download the latest release.')
            self.draw()
            return
        def run():
            try: asyncio.run(receive_flags(self.config,self.events.put,self.stop))
            except Exception:
                self.events.put({'flag':'OFFLINE','connection':'Offline'})
        self.worker = threading.Thread(target=run,daemon=True)
        self.worker.start()

    def set_geometry(self, rect):
        x,y,width,height = (int(v) for v in rect)
        self.width, self.height = width,height
        if sys.platform == 'win32':
            import ctypes
            hwnd = ctypes.windll.user32.GetParent(self.overlay.winfo_id())
            ctypes.windll.user32.SetWindowPos(ctypes.c_void_p(hwnd),None,x,y,width,height,0x0004 | 0x0010)
        else:
            self.overlay.geometry(f'{width}x{height}+{max(0,x)}+{max(0,y)}')
        self.size.set(width)
        self.update_size_text()
        self.request_draw()

    def update_size_text(self):
        self.size_text.set(f'{self.width} × {self.height} px')

    def configured(self, event):
        self.width,self.height = event.width,event.height
        self.size.set(self.width)
        self.update_size_text()
        self.request_draw()

    def slider_resize(self, value):
        if not hasattr(self,'overlay') or self.gesture: return
        width = clamp(float(value),MIN_WIDTH,MAX_WIDTH)
        if width == self.width: return
        height = clamp(round(self.height*width/max(1,self.width)),MIN_HEIGHT,MAX_HEIGHT)
        self.set_geometry((self.overlay.winfo_x(),self.overlay.winfo_y(),width,height))
        self.schedule_save()

    def pointer_motion(self, event):
        if self.gesture: return
        zone = hit_zone(event.x,event.y,self.width,self.height)
        cursors={'close':'hand2','move':'fleur','n':'size_ns','s':'size_ns','w':'size_we',
                 'e':'size_we','nw':'size_nw_se','se':'size_nw_se','ne':'size_ne_sw','sw':'size_ne_sw'}
        try: self.canvas.configure(cursor=cursors[zone])
        except tk.TclError: self.canvas.configure(cursor='sizing')
        hover = zone == 'close'
        if hover != self.hover_close or not self.show_handles:
            self.hover_close,self.show_handles = hover,True
            self.request_draw()

    def pointer_leave(self, event):
        if not self.gesture:
            self.hover_close,self.show_handles=False,False
            self.request_draw()

    def pointer_down(self, event):
        self.gesture={'zone':hit_zone(event.x,event.y,self.width,self.height),
            'origin':(event.x_root,event.y_root),
            'rect':(self.overlay.winfo_x(),self.overlay.winfo_y(),self.width,self.height)}
        self.canvas.grab_set()

    def pointer_drag(self, event):
        if not self.gesture: return
        gesture=self.gesture
        dx,dy=event.x_root-gesture['origin'][0],event.y_root-gesture['origin'][1]
        zone=gesture['zone']
        if zone == 'close': return
        if zone == 'move':
            x,y,w,h=gesture['rect']
            rect=x+dx,y+dy,w,h
        else:
            rect=resize_from_edge(gesture['rect'],zone,dx,dy)
        self.set_geometry(rect)

    def pointer_up(self, event):
        gesture,self.gesture=self.gesture,None
        try: self.canvas.grab_release()
        except tk.TclError: pass
        if gesture and gesture['zone']=='close' and hit_zone(event.x,event.y,self.width,self.height)=='close':
            self.close()
            return
        self.save()

    def changed(self):
        self.draw()
        self.save()

    def request_draw(self):
        if self.draw_job is None and not self.closed:
            self.draw_job=self.root.after(16,self.draw)

    def draw(self):
        if self.closed: return
        if self.draw_job is not None:
            self.root.after_cancel(self.draw_job)
            self.draw_job=None
        self.canvas.delete('all')
        if self.flag=='CLEAR' and self.hide_clear.get():
            self.last_render=None
            return
        self.last_render=render_flag(self.width,self.height,self.flag,self.hover_close,self.show_handles,self.demo,
            message=self.custom_message,countdown=self.countdown_display)
        self.flag_image=ImageTk.PhotoImage(self.last_render,master=self.overlay)
        self.canvas.create_image(0,0,image=self.flag_image,anchor='nw')

    def schedule_save(self):
        if self.save_job is not None: self.root.after_cancel(self.save_job)
        self.save_job=self.root.after(250,self.save)

    def save(self):
        if self.closed: return
        if self.save_job is not None:
            self.root.after_cancel(self.save_job)
            self.save_job=None
        self.settings.update(width=self.width,height=self.height,x=self.overlay.winfo_x(),
            y=self.overlay.winfo_y(),hide_clear=self.hide_clear.get(),
            audio_volume=round(self.volume.get()),audio_muted=not self.audio_enabled.get())
        if self.config: self.settings['config']=self.config
        self.settings.pop('preview',None)
        try:
            self.settings_file.parent.mkdir(parents=True,exist_ok=True)
            self.settings_file.write_text(json.dumps(self.settings),encoding='utf-8')
        except OSError:
            self.status.set('Current changes work, but preferences could not be saved.')

    def tick(self):
        if self.closed: return
        changed=False
        while not self.events.empty():
            event=self.events.get()
            self.flag=event['flag']
            self.signal_started=event.get('updated_at')
            self.custom_message=event.get('custom_message','')
            self.countdown_ends_at=event.get('countdown_ends_at')
            self.clock_offset=event.get('clock_offset',self.clock_offset)
            text='Connection lost · reconnecting' if self.flag=='OFFLINE' else 'Connected to race control'
            if event['connection']=='Polling fallback': text='Connected · checking for updates'
            self.status.set(text)
            changed=True
        remaining=max(0,math.ceil(self.countdown_ends_at-time.time()-self.clock_offset)) if self.flag in ('FCY','PREPARE TO RACE') and self.countdown_ends_at is not None else None
        if remaining!=self.countdown_display:
            self.countdown_display=remaining
            changed=True
        if not self.demo:self.audio.observe(self.flag,self.countdown_ends_at,self.signal_started,remaining)
        if self.audio.error:self.volume_text.set(self.audio.error)
        if changed: self.request_draw()
        self.root.after(100,self.tick)

    def close(self):
        if self.closed: return
        self.save()
        self.closed=True
        self.stop.set()
        self.audio.close()
        self.root.destroy()


def self_test(root, app):
    root.update()
    assert APP_VERSION in root.title()
    if getattr(sys,'frozen',False):assert APP_VERSION.startswith('v')
    for flag in COLORS:
        app.set_demo(flag)
        root.update()
        assert app.canvas.find_all()
        assert app.last_render.getpixel((0,0))==(1,2,3)
    app.flag='FCY'
    app.custom_message='Hold position. No overtaking.'
    app.countdown_ends_at=time.time()-1
    app.tick()
    root.update()
    assert app.flag=='FCY' and app.countdown_display==0
    assert app.last_render is not None
    app.events.put({'flag':'GREEN','connection':'Live','custom_message':'Track clear'})
    app.tick()
    root.update()
    assert app.flag=='GREEN' and app.countdown_display is None
    assert app.custom_message=='Track clear'
    app.custom_message=''
    app.flag='CLEAR'
    app.hide_clear.set(True)
    app.draw()
    assert not app.canvas.find_all()
    app.hide_clear.set(False)
    app.draw()
    assert app.canvas.find_all()
    # Custom controls still resize, toggle and remain wholly inside the window.
    before=app.width
    app.scale.step(10)
    root.update()
    assert app.width==min(MAX_WIDTH,before+10)
    app.scale.set(MIN_WIDTH)
    root.update()
    assert app.width==MIN_WIDTH
    app.scale.set(MAX_WIDTH)
    root.update()
    assert app.width==MAX_WIDTH
    original=app.hide_clear.get()
    app.toggle.toggle()
    assert app.hide_clear.get()!=original
    app.toggle.toggle()
    assert app.hide_clear.get()==original
    app.volume_slider.set(30)
    root.update()
    assert app.audio.volume==30
    app.audio_toggle.toggle()
    assert app.audio.muted
    app.audio_toggle.toggle()
    assert not app.audio.muted
    assert app.volume_text.get()=='30%'
    assert app.audio_test_button.winfo_ismapped()
    assert (app.audio.folder/'green.wav').is_file()
    assert (app.audio.folder/'prepare.wav').is_file()
    assert app.scale.winfo_width()>100
    assert app.toggle.winfo_width()>20
    assert app.close_button.winfo_y()+app.close_button.winfo_height()<=app.close_button.master.winfo_height()
    assert root.winfo_height()<=root.winfo_screenheight()-40
    x,y=app.overlay.winfo_x(),app.overlay.winfo_y()
    app.set_geometry((x,y,520,170))
    root.update()
    assert (app.width,app.height)==(520,170)
    app.pointer_down(SimpleNamespace(x=515,y=85,x_root=x+515,y_root=y+85))
    app.pointer_drag(SimpleNamespace(x_root=x+615,y_root=y+85))
    root.update()
    app.pointer_up(SimpleNamespace(x=615,y=85))
    assert (app.width,app.height)==(620,170)
    assert (app.overlay.winfo_x(),app.overlay.winfo_y())==(x,y)
    app.save()
    assert json.loads(app.settings_file.read_text())['height']==170
    assert app.website_button.winfo_ismapped()
    assert app.website_button.winfo_width()>100*app.ui_scale
    assert app.website_button.winfo_rootx()+app.website_button.winfo_width()<=app.close_button.winfo_rootx()
    opened=[]
    original_open=webbrowser.open_new_tab
    try:
        webbrowser.open_new_tab=lambda url:opened.append(url) or True
        app.website_button.command()
        assert opened==[FLAG_WEBSITE]
    finally:
        webbrowser.open_new_tab=original_open
    assert app.close_button.winfo_ismapped()
    assert app.close_button.winfo_rooty()+app.close_button.winfo_height() <= root.winfo_rooty()+root.winfo_height()
    close_event=SimpleNamespace(x=app.width-23,y=22,x_root=x+app.width-23,y_root=y+22)
    app.pointer_down(close_event)
    app.pointer_up(close_event)
    assert app.closed and app.stop.is_set()


if __name__ == '__main__':
    if getattr(sys,'frozen',False):
        os.environ['TCL_LIBRARY']=os.path.relpath(Path(sys._MEIPASS)/'_tcl_data')
        os.environ['TK_LIBRARY']=os.path.relpath(Path(sys._MEIPASS)/'_tk_data')
    enable_dpi_awareness()
    root=tk.Tk()
    callback_errors=[]
    if '--self-test' in sys.argv:
        root.report_callback_exception=lambda *error:callback_errors.append(error)
    app=DriverApp(root,demo='--demo' in sys.argv or '--self-test' in sys.argv)
    if '--self-test' in sys.argv:
        self_test(root,app)
        if callback_errors:raise RuntimeError(f'UI callback failed: {callback_errors}')
    else: root.mainloop()

