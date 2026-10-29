import tempfile,threading,time,unittest,wave
from pathlib import Path
from radio_audio import RadioAudio

class Recorder:
    def __init__(self):self.calls=[];self.started=threading.Event()
    def play(self,path,cancel,level):
        self.calls.append((path.stem,level()));self.started.set()

class AudioTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory();self.folder=Path(self.temp.name)
        for name in ('yellow','green','red','fcy_pending','fcy_active','prepare','count_10','count_9'):
            with wave.open(str(self.folder/(name+'.wav')),'wb') as f:
                f.setnchannels(1);f.setsampwidth(2);f.setframerate(16000);f.writeframes(bytes(320))
        self.player=Recorder();self.audio=RadioAudio(self.folder,player=self.player)
    def tearDown(self):self.audio.close();self.audio.worker.join(1);self.temp.cleanup()
    def wait(self):self.assertTrue(self.player.started.wait(1));time.sleep(.025)
    def test_poll_and_message_updates_do_not_repeat_calls(self):
        self.audio.observe('YELLOW',None,'time-a',None);self.wait()
        self.audio.observe('YELLOW',None,'time-a',None);time.sleep(.025)
        self.assertEqual([x[0] for x in self.player.calls],['yellow'])
        self.audio.observe('YELLOW',None,'time-b',None);time.sleep(.05)
        self.assertEqual(len(self.player.calls),2)
    def test_mute_and_zero_volume_are_silent_and_do_not_queue_old_calls(self):
        self.audio.set_level(65,True);self.audio.observe('RED',None,'a',None);time.sleep(.025)
        self.assertEqual(self.player.calls,[])
        self.audio.set_level(65,False);self.audio.observe('RED',None,'a',None);time.sleep(.025)
        self.assertEqual(self.player.calls,[])
        self.audio.set_level(0,False);self.audio.preview();time.sleep(.025)
        self.assertEqual(self.player.calls,[])
    def test_fcy_activation_and_prepare_are_distinct_calls(self):
        self.audio.observe('FCY',100,'a',20);self.wait()
        self.audio.observe('FCY',None,'b',None);time.sleep(.05)
        self.audio.observe('PREPARE TO RACE',200,'c',20);time.sleep(.05)
        self.assertEqual([x[0] for x in self.player.calls],['fcy_pending','fcy_active','prepare'])
    def test_countdown_numbers_are_not_repeated_or_played_at_zero(self):
        self.audio.observe('FCY',100,'a',20);self.wait()
        for n in (10,10,9,9,0):self.audio.observe('FCY',100,'a',n);time.sleep(.05)
        self.assertEqual([x[0] for x in self.player.calls],['fcy_pending','count_10','count_9'])
    def test_new_red_interrupts_existing_audio(self):
        active=threading.Event();stopped=threading.Event()
        class Blocking:
            def play(_,path,cancel,level):
                if path.stem=='yellow':active.set();cancel.wait(1);stopped.set()
        self.audio.player=Blocking();self.audio.observe('YELLOW',None,'a',None)
        self.assertTrue(active.wait(1));self.audio.observe('RED',None,'b',None)
        self.assertTrue(stopped.wait(1))
    def test_assets_are_mono_pcm_without_clipped_samples(self):
        folder=Path(__file__).resolve().parents[1]/'assets'/'audio'
        expected={'yellow','safety_car','fcy_pending','fcy_active','prepare','red','green','blue','white','black','chequered'}|{f'count_{n}' for n in range(1,11)}
        self.assertTrue(expected.issubset({p.stem for p in folder.glob('*.wav')}))
        import array
        for name in expected:
            with wave.open(str(folder/(name+'.wav')),'rb') as f:
                self.assertEqual((f.getnchannels(),f.getsampwidth(),f.getframerate()),(1,2,16000))
                samples=array.array('h',f.readframes(f.getnframes()))
                self.assertTrue(samples);self.assertLess(max(abs(x) for x in samples),32767)
if __name__=='__main__':unittest.main()
