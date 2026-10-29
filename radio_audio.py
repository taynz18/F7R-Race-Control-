"""Local, interruptible flag radio. No network, speech synthesis or system-volume changes."""
from pathlib import Path
import sys
import threading
import wave


class WindowsWavePlayer:
    def play(self,path,cancel,level):
        import ctypes as c
        from ctypes import wintypes as w
        class Format(c.Structure):
            _fields_=[('tag',w.WORD),('channels',w.WORD),('rate',w.DWORD),('average',w.DWORD),('align',w.WORD),('bits',w.WORD),('extra',w.WORD)]
        class Header(c.Structure):
            _fields_=[('data',c.c_void_p),('length',w.DWORD),('recorded',w.DWORD),('user',c.c_size_t),('flags',w.DWORD),('loops',w.DWORD),('next',c.c_void_p),('reserved',c.c_size_t)]
        api=c.WinDLL('winmm')
        api.waveOutOpen.argtypes=[c.POINTER(c.c_void_p),w.UINT,c.POINTER(Format),c.c_size_t,c.c_size_t,w.DWORD]
        for name in ('waveOutPrepareHeader','waveOutWrite','waveOutUnprepareHeader'):
            getattr(api,name).argtypes=[c.c_void_p,c.POINTER(Header),w.UINT]
        api.waveOutSetVolume.argtypes=[c.c_void_p,w.DWORD]
        api.waveOutReset.argtypes=[c.c_void_p]
        api.waveOutClose.argtypes=[c.c_void_p]
        with wave.open(str(path),'rb') as audio:
            channels,rate,bits=audio.getnchannels(),audio.getframerate(),audio.getsampwidth()*8
            data=audio.readframes(audio.getnframes())
        fmt=Format(1,channels,rate,rate*channels*bits//8,channels*bits//8,bits,0)
        handle=c.c_void_p()
        if api.waveOutOpen(c.byref(handle),0xffffffff,c.byref(fmt),0,0,0):raise OSError('Audio device unavailable')
        buffer=c.create_string_buffer(data)
        header=Header(c.cast(buffer,c.c_void_p),len(data),0,0,0,0,None,0)
        prepared=False
        try:
            if api.waveOutPrepareHeader(handle,c.byref(header),c.sizeof(header)):raise OSError('Audio buffer unavailable')
            prepared=True
            previous=None
            def volume():
                nonlocal previous
                value=max(0,min(100,level()))
                if value!=previous:
                    gain=round((value/100)**1.6*65535)
                    if api.waveOutSetVolume(handle,gain|(gain<<16)):raise OSError('Audio volume control unavailable')
                    previous=value
                return value
            if cancel.is_set() or not volume():return
            if api.waveOutWrite(handle,c.byref(header),c.sizeof(header)):raise OSError('Audio playback unavailable')
            while not header.flags&1:
                if cancel.wait(.025) or not volume():break
        finally:
            api.waveOutReset(handle)
            if prepared:api.waveOutUnprepareHeader(handle,c.byref(header),c.sizeof(header))
            api.waveOutClose(handle)


class SilentPlayer:
    def play(self,path,cancel,level):pass


class RadioAudio:
    def __init__(self,folder=None,volume=65,muted=False,player=None,enabled=True):
        self.folder=Path(folder) if folder else Path(getattr(sys,'_MEIPASS',Path(__file__).parent))/'assets'/'audio'
        self.volume=max(0,min(100,int(volume)));self.muted=bool(muted)
        self.player=player or (WindowsWavePlayer() if sys.platform=='win32' and enabled else SilentPlayer())
        self.last_signal=None;self.last_number=None;self.error='';self.pending=None;self.priority=0
        self.cancel=threading.Event();self.condition=threading.Condition();self.closed=False
        self.worker=threading.Thread(target=self._work,daemon=True);self.worker.start()

    def level(self):return 0 if self.muted else self.volume

    def set_level(self,volume,muted):
        with self.condition:
            self.volume=max(0,min(100,int(volume)));self.muted=bool(muted)
            if not self.level():self.pending=None;self.cancel.set()

    def submit(self,name,priority=2):
        with self.condition:
            if self.closed or not self.level():return
            if priority<max(self.priority,self.pending[1] if self.pending else 0):return
            path=self.folder/(name+'.wav')
            if not path.is_file():self.error='Audio clip missing';return
            self.cancel.set();self.pending=(path,priority);self.condition.notify()

    def observe(self,flag,deadline,started,remaining):
        if flag in ('OFFLINE','CONNECTING','SETUP'):
            with self.condition:self.pending=None;self.cancel.set()
            return
        if flag=='CLEAR':
            with self.condition:self.pending=None;self.cancel.set()
            self.last_signal=('CLEAR',None,started);self.last_number=None;return
        signal=(flag,deadline,started)
        if signal!=self.last_signal:
            self.last_signal=signal;self.last_number=None
            key={'YELLOW':'yellow','SAFETY CAR':'safety_car','RED':'red','GREEN':'green','BLUE':'blue',
                 'WHITE':'white','BLACK':'black','CHEQUERED':'chequered','PREPARE TO RACE':'prepare'}.get(flag)
            if flag=='FCY':key='fcy_pending' if deadline is not None else 'fcy_active'
            if key:self.submit(key)
        if deadline is not None and remaining is not None and 1<=remaining<=10 and remaining!=self.last_number:
            self.last_number=remaining;self.submit('count_'+str(remaining),1)

    def preview(self):self.submit('green')

    def _work(self):
        while True:
            with self.condition:
                self.condition.wait_for(lambda:self.closed or self.pending is not None)
                if self.closed:return
                path,self.priority=self.pending;self.pending=None
                self.cancel=threading.Event();cancel=self.cancel
            try:self.player.play(path,cancel,self.level)
            except Exception:self.error='Audio device unavailable'
            finally:
                with self.condition:self.priority=0

    def close(self):
        with self.condition:self.closed=True;self.pending=None;self.cancel.set();self.condition.notify()
