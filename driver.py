"""F7R Windows driver overlay and compact local controls."""
import asyncio
import json
import os
from pathlib import Path
import queue
import sys
import threading
from types import SimpleNamespace
import tkinter as tk
from tkinter import ttk
from PIL import ImageTk

from connection import FLAGS, receive_flags, validate_config
from overlay_ui import (COLORS, TRANSPARENT, MIN_WIDTH, MAX_WIDTH, MIN_HEIGHT, MAX_HEIGHT,
                        clamp, hit_zone, resize_from_edge, visible_on_monitors, render_flag)

BG, PANEL, INK, MUTED, ACCENT = '#0c111b', '#151e2b', '#f0f5fc', '#96a5bb', '#d9ff79'


def rounded_box(canvas, x1, y1, x2, y2, radius, **kwargs):
    r = min(radius, (x2-x1)/2, (y2-y1)/2)
    return canvas.create_polygon(x1+r,y1,x2-r,y1,x2,y1,x2,y1+r,x2,y2-r,x2,y2,
        x2-r,y2,x1+r,y2,x1,y2,x1,y2-r,x1,y1+r,x1,y1,
        smooth=True, splinesteps=24, **kwargs)


class RoundedButton(tk.Canvas):
    def __init__(self, parent, text, command):
        super().__init__(parent, height=44, bg=BG, bd=0, highlightthickness=0,
                         cursor='hand2', takefocus=True)
        self.text, self.command, self.hover = text, command, False
        self.bind('<Configure>', lambda _: self.draw())
        self.bind('<Enter>', lambda _: self.set_hover(True))
        self.bind('<Leave>', lambda _: self.set_hover(False))
        self.bind('<Button-1>', lambda _: self.focus_set())
        self.bind('<ButtonRelease-1>', self.activate)
        self.bind('<Return>', lambda _: command())
        self.bind('<space>', lambda _: command())
        self.bind('<FocusIn>', lambda _: self.draw())
        self.bind('<FocusOut>', lambda _: self.draw())

    def set_hover(self, value):
        self.hover = value
        self.draw()

    def activate(self, event):
        if 0 <= event.x < self.winfo_width() and 0 <= event.y < self.winfo_height():
            self.command()

    def draw(self):
        self.delete('all')
        width = max(10, self.winfo_width())
        rounded_box(self,1,1,width-1,43,12,fill='#283547' if self.hover else '#1b2737',
                    outline=ACCENT if self.focus_get() == self else '#354459')
        self.create_text(width/2,22,text=self.text,fill=INK,font=('Segoe UI',10,'bold'))


class Toggle(tk.Canvas):
    def __init__(self, parent, variable, command):
        super().__init__(parent, width=46, height=26, bg=PANEL, bd=0,
                         highlightthickness=0, cursor='hand2', takefocus=True)
        self.variable, self.command = variable, command
        self.bind('<Button-1>', lambda _: self.toggle())
        self.bind('<space>', lambda _: self.toggle())
        self.bind('<Return>', lambda _: self.toggle())
        self.bind('<FocusIn>', lambda _: self.draw())
        self.bind('<FocusOut>', lambda _: self.draw())
        self.draw()

    def toggle(self):
        self.focus_set()
        self.variable.set(not self.variable.get())
        self.draw()
        self.command()

    def draw(self):
        self.delete('all')
        on = self.variable.get()
        rounded_box(self,1,1,45,25,12,fill=ACCENT if on else '#3b4b61',
                    outline=INK if self.focus_get() == self else '')
        x = 33 if on else 13
        self.create_oval(x-8,5,x+8,21,fill='#192419' if on else '#dae2ef',outline='')


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
        self.settings_file = Path(os.environ.get('LOCALAPPDATA', str(Path.home()))) / 'RaceFlags' / 'settings.json'
        try:
            self.settings = json.loads(self.settings_file.read_text(encoding='utf-8'))
            if not isinstance(self.settings,dict): self.settings = {}
        except (OSError,ValueError):
            self.settings = {}
        def number(name, default):
            try: return int(self.settings.get(name,default))
            except (ValueError,TypeError): return default
        self.width = clamp(number('width',380),MIN_WIDTH,MAX_WIDTH)
        self.height = clamp(number('height',int(self.width*.33)),MIN_HEIGHT,MAX_HEIGHT)
        self.hide_clear = tk.BooleanVar(value=bool(self.settings.get('hide_clear',True)))
        self.size = tk.DoubleVar(value=self.width)
        self.size_text = tk.StringVar()
        self.status = tk.StringVar(value='Local preview · not connected' if demo else 'Connecting to race control…')
        self.config = connection_config(self.settings)
        root.title('F7R · Driver controls')
        root.configure(bg=BG)
        root.geometry('400x500')
        root.resizable(False,False)
        outer = tk.Frame(root,bg=BG,padx=24,pady=22)
        outer.pack(fill='both',expand=True)
        header = tk.Frame(outer,bg=BG)
        header.pack(fill='x')
        tk.Label(header,text='F7R',bg=BG,fg=ACCENT,font=('Segoe UI',19,'bold italic')).pack(side='left')
        tk.Label(header,text='  DRIVER OVERLAY',bg=BG,fg=MUTED,font=('Segoe UI',9,'bold')).pack(side='left',padx=8)
        tk.Label(outer,text='Make it yours.',bg=BG,fg=INK,font=('Segoe UI',20,'bold')).pack(anchor='w',pady=(14,3))
        tk.Label(outer,textvariable=self.status,bg=BG,fg=MUTED,font=('Segoe UI',9),wraplength=348).pack(anchor='w',pady=(0,18))
        card = tk.Canvas(outer,height=159,bg=BG,bd=0,highlightthickness=0)
        card.pack(fill='x')
        card.bind('<Configure>',lambda e:(card.delete('panel'),rounded_box(card,0,0,e.width,158,18,
            fill=PANEL,outline='#253347',tags='panel'),card.tag_lower('panel')))
        content = tk.Frame(card,bg=PANEL)
        card.create_window(18,15,window=content,anchor='nw',width=314)
        size_row = tk.Frame(content,bg=PANEL)
        size_row.pack(fill='x')
        tk.Label(size_row,text='Size',bg=PANEL,fg=INK,font=('Segoe UI',10,'bold')).pack(side='left')
        tk.Label(size_row,textvariable=self.size_text,bg=PANEL,fg=MUTED,font=('Segoe UI',9)).pack(side='right')
        self.scale = tk.Scale(content,from_=MIN_WIDTH,to=MAX_WIDTH,variable=self.size,orient='horizontal',
            showvalue=False,command=self.slider_resize,bg=PANEL,fg=INK,troughcolor='#0b121e',
            activebackground=ACCENT,sliderrelief='flat',sliderlength=20,highlightthickness=0,bd=0,
            width=7,takefocus=True)
        self.scale.pack(fill='x',pady=(8,8))
        tk.Frame(content,bg='#273448',height=1).pack(fill='x',pady=(2,12))
        toggle_row = tk.Frame(content,bg=PANEL)
        toggle_row.pack(fill='x')
        tk.Label(toggle_row,text='Transparent mode',bg=PANEL,fg=INK,font=('Segoe UI',10,'bold')).pack(side='left')
        self.toggle = Toggle(toggle_row,self.hide_clear,self.changed)
        self.toggle.pack(side='right')
        tk.Label(content,text='Hide the overlay when no flag is active.',bg=PANEL,fg=MUTED,font=('Segoe UI',8)).pack(anchor='w',pady=(2,0))
        tk.Label(outer,text='Drag centre to move · drag edges to resize',bg=BG,fg=MUTED,font=('Segoe UI',8)).pack(pady=(13,11))
        self.close_button = RoundedButton(outer,'Close Race Flags',self.close)
        self.close_button.pack(fill='x')
        if demo:
            self.demo_flag = tk.StringVar(value='YELLOW')
            pick = ttk.Combobox(outer,textvariable=self.demo_flag,values=sorted(FLAGS),state='readonly')
            pick.pack(fill='x',pady=7)
            pick.bind('<<ComboboxSelected>>',lambda _: self.set_demo(self.demo_flag.get()))
        root.update_idletasks()
        control_height=max(440,root.winfo_reqheight())
        root.geometry(f'400x{control_height}+{max(0,(root.winfo_screenwidth()-400)//2)}+{max(0,(root.winfo_screenheight()-control_height)//2)}')
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
            except (AttributeError,OSError): pass

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
        self.last_render=render_flag(self.width,self.height,self.flag,self.hover_close,self.show_handles,self.demo)
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
            y=self.overlay.winfo_y(),hide_clear=self.hide_clear.get())
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
            text='Connection lost · reconnecting' if self.flag=='OFFLINE' else 'Connected to race control'
            if event['connection']=='Polling fallback': text='Connected · checking for updates'
            self.status.set(text)
            changed=True
        if changed: self.request_draw()
        self.root.after(100,self.tick)

    def close(self):
        if self.closed: return
        self.save()
        self.closed=True
        self.stop.set()
        self.root.destroy()


def self_test(root, app):
    root.update()
    for flag in COLORS:
        app.set_demo(flag)
        root.update()
        assert app.canvas.find_all()
        assert app.last_render.getpixel((0,0))==(1,2,3)
    app.flag='CLEAR'
    app.hide_clear.set(True)
    app.draw()
    assert not app.canvas.find_all()
    app.hide_clear.set(False)
    app.draw()
    assert app.canvas.find_all()
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
    root=tk.Tk()
    app=DriverApp(root,demo='--demo' in sys.argv or '--self-test' in sys.argv)
    if '--self-test' in sys.argv: self_test(root,app)
    else: root.mainloop()
