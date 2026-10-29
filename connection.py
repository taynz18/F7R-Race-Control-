"""Read-only Supabase transport. No admin credentials are used by drivers."""
import asyncio
import re
import time
from datetime import datetime
from supabase import acreate_client, AsyncClientOptions

FLAGS = {'CLEAR', 'YELLOW', 'SAFETY CAR', 'FCY', 'RED', 'GREEN', 'BLUE',
         'WHITE', 'BLACK', 'CHEQUERED', 'PREPARE TO RACE'}


def validate_config(config):
    url = config.get('supabase_url', '').rstrip('/')
    key = config.get('supabase_publishable_key', '')
    if not re.fullmatch(r'https://[a-z0-9-]+\.supabase\.co', url):
        raise ValueError('Enter your Supabase project URL, such as https://yourproject.supabase.co')
    if not key.startswith('sb_publishable_') or 'REPLACE' in key:
        raise ValueError('Enter the publishable key from your Supabase project. Never use a secret key.')
    return url, key


class StateTracker:
    """A delayed snapshot must never overwrite a newer realtime update."""
    def __init__(self):
        self.revision = -1
        self.flag = None
        self.message = ''
        self.countdown_ends_at = None
        self.clock_offset = 0.0

    def accept(self, row):
        if not isinstance(row, dict) or row.get('id') != 1 or row.get('flag') not in FLAGS:
            raise ValueError('Invalid flag state')
        revision = row.get('revision')
        if type(revision) is not int or revision < 0:
            raise ValueError('Invalid state revision')
        if revision < self.revision:
            return False
        message=row.get('custom_message','')
        if not isinstance(message,str) or len(message)>120:
            raise ValueError('Invalid custom message')
        end=row.get('countdown_ends_at')
        if end is not None:
            try:
                end=datetime.fromisoformat(end.replace('Z','+00:00')).timestamp()
            except (ValueError,TypeError,AttributeError):
                raise ValueError('Invalid countdown deadline')
            if row['flag'] not in ('FCY','PREPARE TO RACE'):
                raise ValueError('Countdown is only valid for FCY and Prepare to race')
        server=row.get('server_time')
        if server:
            self.clock_offset=datetime.fromisoformat(server.replace('Z','+00:00')).timestamp()-time.time()
        self.message=' '.join(message.split())
        self.countdown_ends_at=end
        self.revision, self.flag = revision, row['flag']
        return True


async def receive_flags(config, emit, stop):
    url, key = validate_config(config)
    options = AsyncClientOptions(persist_session=False, auto_refresh_token=False,
                                 postgrest_client_timeout=5)
    client = await acreate_client(url, key, options=options)
    tracker = StateTracker()
    wake = asyncio.Event()
    live = False

    def changed(payload):
        try:
            row = payload.get('data', {}).get('record')
            if tracker.accept(row):
                emit(dict(flag=tracker.flag,custom_message=tracker.message,countdown_ends_at=tracker.countdown_ends_at,clock_offset=tracker.clock_offset,connection='Live' if live else 'Reconnecting'))
        except (ValueError, TypeError):
            wake.set()

    def subscribed(status, error):
        nonlocal live
        live = getattr(status, 'value', status) == 'SUBSCRIBED'
        wake.set()  # Reload on every join to recover changes missed during a disconnect.

    channel = client.channel('driver-flag-state').on_postgres_changes(
        'UPDATE', schema='public', table='flag_state', filter='id=eq.1', callback=changed)
    try:
        # REST remains a fallback if a WebSocket cannot connect.
        try:
            await asyncio.wait_for(channel.subscribe(subscribed), timeout=8)
        except Exception:
            live = False
        while not stop.is_set():
            wake.clear()
            try:
                response = await client.rpc('get_race_state').execute()
                tracker.accept(response.data)
                emit(dict(flag=tracker.flag,custom_message=tracker.message,countdown_ends_at=tracker.countdown_ends_at,clock_offset=tracker.clock_offset,connection='Live' if live else 'Polling fallback'))
            except Exception:
                emit({'flag': 'OFFLINE', 'connection': 'Offline — signal unavailable'})
            if stop.is_set():
                break
            try:
                await asyncio.wait_for(wake.wait(), timeout=5 if live else 2)
            except asyncio.TimeoutError:
                pass
    finally:
        await client.remove_all_channels()
        await client.realtime.close()

