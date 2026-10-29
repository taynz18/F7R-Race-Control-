"""Crisp, keyboard-accessible local controls. Racing artwork is kept separate."""
import tkinter as tk
from PIL import Image, ImageDraw, ImageTk

BG, PANEL, INK, MUTED, ACCENT = '#0c111b', '#151e2b', '#f0f5fc', '#96a5bb', '#d9ff79'


def enable_dpi_awareness():
    import sys
    if sys.platform != 'win32':
        return
    import ctypes
    try:
        if ctypes.windll.user32.SetProcessDpiAwarenessContext(ctypes.c_void_p(-4)):
            return
    except (AttributeError, OSError):
        pass
    try:
        ctypes.windll.shcore.SetProcessDpiAwareness(2)
    except (AttributeError, OSError):
        pass


def ui_scale(root):
    # Keep the whole controller visible even on a laptop with large text scaling.
    return max(.75, min(root.winfo_fpixels('1i') / 96,
        (root.winfo_screenheight()-85)/800, (root.winfo_screenwidth()-48)/430))


def font(scale, pixels, weight='normal'):
    return ('Segoe UI', -max(8, round(pixels*scale)), weight)


def surface(width, height, background, scale=3):
    image=Image.new('RGB',(max(1,width)*scale,max(1,height)*scale),background)
    return image, ImageDraw.Draw(image), scale


def present(canvas, image):
    canvas.art=ImageTk.PhotoImage(image.resize((max(1,canvas.winfo_width()),
        max(1,canvas.winfo_height())),Image.Resampling.LANCZOS),master=canvas)
    if hasattr(canvas,'art_item'):
        canvas.itemconfigure(canvas.art_item,image=canvas.art)
    else:
        canvas.art_item=canvas.create_image(0,0,image=canvas.art,anchor='nw')
    canvas.tag_lower(canvas.art_item)


class RoundedPanel(tk.Canvas):
    def __init__(self,parent,height,scale):
        self.scale=scale
        super().__init__(parent,height=round(height*scale),bg=BG,bd=0,highlightthickness=0)
        self.bind('<Configure>',lambda _:self.draw())

    def draw(self):
        w,h=self.winfo_width(),self.winfo_height()
        if w<round(30*self.scale) or h<8:return
        im,d,s=surface(w,h,BG)
        margin=max(1,round(self.scale*s))
        d.rounded_rectangle((margin,margin,w*s-margin-1,h*s-margin-1),
            radius=round(20*self.scale*s),fill=PANEL,outline='#2b3749',width=margin)
        # A quiet highlight catches the top edge without a hard bevel.
        d.line((round(30*self.scale*s),margin,round((w-30*self.scale)*s),margin),
            fill='#3b485b',width=margin)
        present(self,im)


class RoundedButton(tk.Canvas):
    def __init__(self,parent,text,command,scale=1):
        self.scale,self.text,self.command,self.hover=scale,text,command,False
        super().__init__(parent,height=round(46*scale),bg=BG,bd=0,highlightthickness=0,
            cursor='hand2',takefocus=True)
        self.bind('<Configure>',lambda _:self.draw())
        self.bind('<Enter>',lambda _:self.set_hover(True))
        self.bind('<Leave>',lambda _:self.set_hover(False))
        self.bind('<Button-1>',lambda _:self.focus_set())
        self.bind('<ButtonRelease-1>',self.activate)
        self.bind('<Return>',lambda _:self.command())
        self.bind('<space>',lambda _:self.command())
        self.bind('<FocusIn>',lambda _:self.draw())
        self.bind('<FocusOut>',lambda _:self.draw())

    def set_hover(self,value):
        self.hover=value
        self.draw()

    def activate(self,event):
        if 0<=event.x<self.winfo_width() and 0<=event.y<self.winfo_height():self.command()

    def draw(self):
        w,h=self.winfo_width(),self.winfo_height()
        if w<round(30*self.scale) or h<8:return
        im,d,s=surface(w,h,BG)
        p=max(1,round(self.scale*s))
        d.rounded_rectangle((p,p,w*s-p-1,h*s-p-1),radius=round(13*self.scale*s),
            fill='#253347' if self.hover else '#192535',
            outline=ACCENT if self.focus_get()==self or self.hover else '#334258',width=p)
        present(self,im)
        self.delete('label')
        self.create_text(w/2,h/2,text=self.text,fill=INK,font=font(self.scale,13,'bold'),tags='label')


class Toggle(tk.Canvas):
    def __init__(self,parent,variable,command,scale=1):
        self.variable,self.command,self.scale=variable,command,scale
        self.position=1.0 if variable.get() else 0.0
        self.animation=None
        super().__init__(parent,width=round(46*scale),height=round(28*scale),bg=PANEL,
            bd=0,highlightthickness=0,cursor='hand2',takefocus=True)
        self.bind('<Button-1>',lambda _:self.toggle())
        self.bind('<space>',lambda _:self.toggle())
        self.bind('<Return>',lambda _:self.toggle())
        self.bind('<FocusIn>',lambda _:self.draw())
        self.bind('<FocusOut>',lambda _:self.draw())
        self.bind('<Configure>',lambda _:self.draw())

    def toggle(self):
        self.focus_set()
        self.variable.set(not self.variable.get())
        if self.animation is not None:self.after_cancel(self.animation)
        self.animate()
        self.command()

    def animate(self):
        target=1.0 if self.variable.get() else 0.0
        self.position+=(target-self.position)*.35
        if abs(target-self.position)<.025:
            self.position=target
            self.animation=None
        else:self.animation=self.after(16,self.animate)
        self.draw()

    def draw(self):
        w,h=self.winfo_width(),self.winfo_height()
        if w<round(30*self.scale) or h<8:return
        im,d,s=surface(w,h,PANEL)
        p=max(1,round(self.scale*s))
        d.rounded_rectangle((p,2*p,w*s-p-1,h*s-2*p-1),radius=h*s//2,
            fill=ACCENT if self.variable.get() else '#354257',
            outline=INK if self.focus_get()==self else None,width=p)
        r=8*self.scale*s
        x=(13+20*self.position)*self.scale*s
        y=h*s/2
        d.ellipse((x-r,y-r,x+r,y+r),fill='#1c2b14' if self.variable.get() else '#edf3fc')
        present(self,im)


class SizeSlider(tk.Canvas):
    def __init__(self,parent,variable,command,minimum,maximum,scale=1):
        self.variable,self.command,self.minimum,self.maximum,self.scale=variable,command,minimum,maximum,scale
        super().__init__(parent,height=round(35*scale),bg=PANEL,bd=0,highlightthickness=0,
            cursor='hand2',takefocus=True)
        self.bind('<Configure>',lambda _:self.draw())
        self.bind('<Button-1>',self.pointer)
        self.bind('<B1-Motion>',self.pointer)
        self.bind('<Left>',lambda _:self.step(-10))
        self.bind('<Right>',lambda _:self.step(10))
        self.bind('<Home>',lambda _:self.set(self.minimum))
        self.bind('<End>',lambda _:self.set(self.maximum))
        self.bind('<FocusIn>',lambda _:self.draw())
        self.bind('<FocusOut>',lambda _:self.draw())
        self.variable.trace_add('write',lambda *_:self.draw())

    def set(self,value):
        value=max(self.minimum,min(self.maximum,round(value)))
        self.variable.set(value)
        self.command(value)

    def step(self,delta):
        self.set(self.variable.get()+delta)

    def pointer(self,event):
        self.focus_set()
        pad=12*self.scale
        fraction=(event.x-pad)/max(1,self.winfo_width()-2*pad)
        self.set(self.minimum+fraction*(self.maximum-self.minimum))

    def draw(self):
        w,h=self.winfo_width(),self.winfo_height()
        if w<round(30*self.scale) or h<8:return
        im,d,s=surface(w,h,PANEL)
        pad=12*self.scale*s
        y=h*s/2
        r=2.5*self.scale*s
        fraction=max(0,min(1,(self.variable.get()-self.minimum)/(self.maximum-self.minimum)))
        x=pad+fraction*max(1,w*s-2*pad)
        d.rounded_rectangle((pad,y-r,w*s-pad,y+r),radius=r,fill='#344258')
        if x>pad:d.rounded_rectangle((pad,y-r,max(pad+1,x),y+r),radius=r,fill=ACCENT)
        if self.focus_get()==self:
            ring=11*self.scale*s
            d.ellipse((x-ring,y-ring,x+ring,y+ring),outline='#91ae58',width=max(1,round(self.scale*s)))
        knob=7*self.scale*s
        d.ellipse((x-knob,y-knob,x+knob,y+knob),fill=INK,outline=ACCENT,width=max(1,round(2*self.scale*s)))
        present(self,im)
