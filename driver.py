"""Windows driver overlay. Run normally, or use --demo for a local visual preview."""
import asyncio
import json
import os
from pathlib import Path
import queue
import sys
import threading
import tkinter as tk
from tkinter import ttk, messagebox

from connection import FLAGS, receive_flags, validate_config

COLORS = {
    'YELLOW': ('#ffda36', '#9c7600'), 'SAFETY CAR': ('#ffda36', '#9c7600'),
    'FCY': ('#ffda36', '#9c7600'), 'RED': ('#ff5558', '#971824'),
    'GREEN': ('#49dc8b', '#166d40'), 'BLUE': ('#579aff', '#234d94'),
    'WHITE': ('#f4f4ef', '#92958c'), 'BLACK': ('#252b30', '#080b0c'),
    'CHEQUERED': ('#efefed', '#565c60'),
}
TRANSPARENT = '#010203'


def bundled_config():
    folder = Path(getattr(sys, '_MEIPASS', Path(__file__).parent))
    try:
        return json.loads((folder / 'config.json').read_text(encoding='utf-8-sig'))
    except (OSError, ValueError):
        return {}


class DriverApp:
    def __init__(self, root, demo=False):
        self.root, self.demo = root, demo
        self.events, self.stop = queue.Queue(), threading.Event()
        self.worker = None
        self.flag = 'CONNECTING'
        self.settings_file = Path(os.environ.get('LOCALAPPDATA', str(Path.home()))) / 'RaceFlags' / 'settings.json'
        try:
            self.settings = json.loads(self.settings_file.read_text(encoding='utf-8'))
        except (OSError, ValueError):
            self.settings = {}
        config = self.settings.get('config', bundled_config())
        root.title('Race Flags · Driver settings')
        root.geometry('470x550')
        root.minsize(440, 500)
        self.url = tk.StringVar(value=config.get('supabase_url', ''))
        self.key = tk.StringVar(value=config.get('supabase_publishable_key', ''))
        self.preview = tk.BooleanVar(value=self.settings.get('preview', False))
        self.hide_clear = tk.BooleanVar(value=self.settings.get('hide_clear', True))
        self.status = tk.StringVar(value='Demo mode — no race connection' if demo else 'Enter your league connection details.')
        self.size = tk.IntVar(value=max(240, min(800, self.settings.get('width', 380))))
        frame = ttk.Frame(root, padding=24)
        frame.pack(fill='both', expand=True)
        ttk.Label(frame, text='RACE FLAGS', font=('Arial', 22, 'bold')).pack(anchor='w')
        ttk.Label(frame, text='Driver overlay settings').pack(anchor='w', pady=(4, 20))
        for title, variable in [('Supabase project URL', self.url), ('Publishable key (provided by your admin)', self.key)]:
            ttk.Label(frame, text=title).pack(anchor='w')
            ttk.Entry(frame, textvariable=variable).pack(fill='x', pady=(4, 12))
        self.connect_button = ttk.Button(frame, text='Connect to race control', command=self.connect)
        self.connect_button.pack(fill='x', pady=(0, 14))
        ttk.Checkbutton(frame, text='Position / preview mode — drag the overlay', variable=self.preview, command=self.changed).pack(anchor='w', pady=5)
        ttk.Checkbutton(frame, text='Transparent when no flag is active', variable=self.hide_clear, command=self.changed).pack(anchor='w', pady=5)
        ttk.Label(frame, text='Overlay size').pack(anchor='w', pady=(14, 0))
        ttk.Scale(frame, from_=240, to=800, variable=self.size, command=lambda _: self.resize()).pack(fill='x')
        ttk.Button(frame, text='Bring overlay back to this screen', command=self.reset_position).pack(fill='x', pady=10)
        ttk.Label(frame, textvariable=self.status, wraplength=410).pack(anchor='w', pady=10)
        ttk.Label(frame, text='Keep this window open or minimise it while driving.', wraplength=410).pack(anchor='w')
        if demo:
            self.demo_flag = tk.StringVar(value='YELLOW')
            pick = ttk.Combobox(frame, textvariable=self.demo_flag, values=sorted(FLAGS), state='readonly')
            pick.pack(fill='x', pady=8)
            pick.bind('<<ComboboxSelected>>', lambda _: self.set_demo(self.demo_flag.get()))
        self.overlay = tk.Toplevel(root)
        self.overlay.withdraw()
        self.overlay.overrideredirect(True)
        self.overlay.attributes('-topmost', True)
        self.overlay.configure(bg=TRANSPARENT)
        try:
            self.overlay.wm_attributes('-transparentcolor', TRANSPARENT)
        except tk.TclError:
            pass
        self.canvas = tk.Canvas(self.overlay, bd=0, highlightthickness=0, bg=TRANSPARENT)
        self.canvas.pack(fill='both', expand=True)
        self.canvas.bind('<Configure>', lambda _: self.draw())
        self.canvas.bind('<Button-1>', self.drag_start)
        self.canvas.bind('<B1-Motion>', self.drag_move)
        self.canvas.bind('<ButtonRelease-1>', lambda _: self.save())
        self.overlay.geometry(f'{self.size.get()}x{int(self.size.get()*.32)}+80+80')
        self.overlay.update_idletasks()
        self.move_to(self.settings.get('x', 80), self.settings.get('y', 80))
        self.overlay.deiconify()
        root.protocol('WM_DELETE_WINDOW', self.close)
        self.draw()
        self.tick()
        if demo:
            self.set_demo('YELLOW')
        else:
            try:
                validate_config({'supabase_url': self.url.get(), 'supabase_publishable_key': self.key.get()})
            except ValueError:
                self.flag = 'SETUP'
                self.draw()
            else:
                root.after(100, self.connect)

    def set_demo(self, flag):
        self.flag = flag
        self.draw()

    def connect(self):
        config = {'supabase_url': self.url.get().strip(), 'supabase_publishable_key': self.key.get().strip()}
        try:
            validate_config(config)
        except ValueError as error:
            messagebox.showerror('Connection details', str(error), parent=self.root)
            return
        if self.worker and self.worker.is_alive():
            messagebox.showinfo('Already connected', 'Restart Race Flags to change the project connection.', parent=self.root)
            return
        self.stop.clear()
        self.connect_button.configure(state='disabled')
        self.settings['config'] = config
        self.save()
        self.flag = 'CONNECTING'
        self.status.set('Connecting to race control…')
        self.draw()

        def run():
            try:
                asyncio.run(receive_flags(config, self.events.put, self.stop))
            except Exception:
                self.events.put({'flag': 'OFFLINE', 'connection': 'Unable to connect. Check settings and restart Race Flags.'})
        self.worker = threading.Thread(target=run, daemon=True)
        self.worker.start()

    def move_to(self, x, y):
        if sys.platform == 'win32':
            import ctypes
            window = ctypes.windll.user32.GetParent(self.overlay.winfo_id())
            ctypes.windll.user32.SetWindowPos(window, 0, int(x), int(y), 0, 0, 0x0001 | 0x0004 | 0x0010)
        else:
            self.overlay.geometry(f'+{max(0,int(x))}+{max(0,int(y))}')

    def drag_start(self, event):
        self.drag = (event.x_root-self.overlay.winfo_x(), event.y_root-self.overlay.winfo_y())

    def drag_move(self, event):
        x, y = self.drag
        self.move_to(event.x_root-x, event.y_root-y)

    def reset_position(self):
        self.move_to(self.root.winfo_rootx()+20, self.root.winfo_rooty()+70)
        self.preview.set(True)
        self.changed()

    def resize(self):
        width = int(self.size.get())
        self.overlay.geometry(f'{width}x{int(width*.32)}')
        self.root.after_idle(self.changed)

    def changed(self):
        self.draw()
        self.save()

    def draw(self):
        c = self.canvas
        c.delete('all')
        w, h = max(c.winfo_width(), 240), max(c.winfo_height(), 76)
        if self.flag == 'CLEAR' and self.hide_clear.get() and not self.preview.get():
            self.overlay.configure(bg=TRANSPARENT)
            c.configure(bg=TRANSPARENT)
            return
        fill, border = COLORS.get(self.flag, ('#263136', '#101719'))
        c.configure(bg=border)
        inset = max(7, int(w*.022))
        c.create_rectangle(inset, inset, w-inset, h-inset, fill=fill, outline='')
        text = self.flag
        foreground = '#ffffff' if self.flag in ('BLACK', 'OFFLINE', 'CONNECTING', 'SETUP', 'CLEAR') else '#111820'
        if self.flag == 'CLEAR':
            text = 'DRAG TO POSITION' if self.preview.get() else 'NO ACTIVE FLAG'
        if self.flag == 'CHEQUERED':
            cell = max(16, w//14)
            for row, y in enumerate(range(inset, h-inset, cell)):
                for col, x in enumerate(range(inset, w-inset, cell)):
                    c.create_rectangle(x, y, min(x+cell,w-inset), min(y+cell,h-inset), fill='#eeeeee' if (row+col)%2 == 0 else '#202529', outline='')
            c.create_rectangle(w*.12,h*.25,w*.88,h*.75,fill='#15191c',outline='')
            foreground = '#ffffff'
        font_size = max(14, min(int(w*.075), int(w/max(len(text), 1)*1.05)))
        c.create_text(w/2,h/2,text=text,fill=foreground,font=('Arial',font_size,'bold'))
        if self.demo:
            c.create_text(w/2,h-inset-10,text='LOCAL DEMO',fill=foreground,font=('Arial',8,'bold'))

    def save(self):
        self.settings.update(width=int(self.size.get()), x=self.overlay.winfo_x(), y=self.overlay.winfo_y(),
                             preview=self.preview.get(), hide_clear=self.hide_clear.get())
        try:
            self.settings_file.parent.mkdir(parents=True, exist_ok=True)
            self.settings_file.write_text(json.dumps(self.settings), encoding='utf-8')
        except OSError:
            self.status.set('Unable to save settings. Current overlay still works.')

    def tick(self):
        changed = False
        while not self.events.empty():
            event = self.events.get()
            self.flag = event['flag']
            self.status.set(event['connection']+' · '+self.flag)
            changed = True
        if changed:
            self.draw()
        self.root.after(100, self.tick)

    def close(self):
        self.save()
        self.stop.set()
        self.root.destroy()


if __name__ == '__main__':
    if getattr(sys, 'frozen', False):
        # Relative paths also work when Windows redirects the user profile folder.
        os.environ['TCL_LIBRARY'] = os.path.relpath(Path(sys._MEIPASS) / '_tcl_data')
        os.environ['TK_LIBRARY'] = os.path.relpath(Path(sys._MEIPASS) / '_tk_data')
    root = tk.Tk()
    app = DriverApp(root, demo='--demo' in sys.argv or '--self-test' in sys.argv)
    if '--self-test' in sys.argv:
        root.update()
        for flag in COLORS:
            app.set_demo(flag)
            root.update()
            assert app.canvas.find_all()
            assert app.canvas.cget('bg') == COLORS[flag][1]
        app.demo = False
        app.flag = 'CLEAR'
        app.preview.set(False)
        app.hide_clear.set(True)
        app.draw()
        assert not app.canvas.find_all()
        assert app.canvas.cget('bg') == TRANSPARENT
        app.close()
    else:
        root.mainloop()
