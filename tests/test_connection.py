import asyncio
import threading
import unittest
from unittest.mock import patch
from types import SimpleNamespace
from realtime.types import RealtimeSubscribeStates

from connection import StateTracker, validate_config, receive_flags

CONFIG = {'supabase_url':'https://example.supabase.co', 'supabase_publishable_key':'sb_publishable_example'}


def row(flag='YELLOW', revision=1):
    return {'id':1,'flag':flag,'revision':revision}


class ConfigTests(unittest.TestCase):
    def test_valid_public_config(self):
        self.assertEqual(validate_config(CONFIG), tuple(CONFIG.values()))

    def test_secret_key_is_rejected(self):
        with self.assertRaises(ValueError):
            validate_config(dict(CONFIG, supabase_publishable_key='sb_secret_example'))

    def test_non_supabase_or_http_url_is_rejected(self):
        for url in ['http://example.supabase.co','https://example.com','https://example.supabase.co.evil.com']:
            with self.subTest(url=url), self.assertRaises(ValueError):
                validate_config(dict(CONFIG, supabase_url=url))

    def test_unconfigured_placeholder_is_rejected(self):
        with self.assertRaises(ValueError):
            validate_config(dict(CONFIG, supabase_publishable_key='sb_publishable_REPLACE_ME'))


class StateTests(unittest.TestCase):
    def test_delayed_snapshot_does_not_replace_new_flag(self):
        tracker = StateTracker()
        self.assertTrue(tracker.accept(row('RED',4)))
        self.assertFalse(tracker.accept(row('GREEN',3)))
        self.assertEqual(tracker.flag,'RED')

    def test_same_revision_can_restore_state_after_offline(self):
        tracker = StateTracker()
        tracker.accept(row('CLEAR',4))
        self.assertTrue(tracker.accept(row('CLEAR',4)))

    def test_message_countdown_and_clock_are_carried_together(self):
        tracker=StateTracker()
        tracker.accept(dict(row('FCY',4),custom_message='Hold position',countdown_ends_at='2026-10-24T00:00:00+00:00',server_time='2026-10-23T23:59:30+00:00'))
        deadline=tracker.countdown_ends_at
        self.assertEqual(tracker.message,'Hold position')
        tracker.accept(dict(row('FCY',5),custom_message='No overtaking',countdown_ends_at='2026-10-24T00:00:00+00:00'))
        self.assertEqual(tracker.countdown_ends_at,deadline)
        tracker.accept(row('GREEN',6))
        self.assertEqual(tracker.message,'')
        self.assertIsNone(tracker.countdown_ends_at)

    def test_invalid_extended_payloads_are_rejected(self):
        for extra in [dict(custom_message='a'*121),dict(custom_message=4),dict(countdown_ends_at='bad'),dict(countdown_ends_at='2026-10-24T00:00:00Z')]:
            with self.subTest(extra=extra),self.assertRaises(ValueError):
                StateTracker().accept(dict(row('RED',1),**extra))

    def test_invalid_payloads_are_rejected(self):
        for data in [None, {}, row('PURPLE'), dict(row(),id=2), row(revision=-1), row(revision=True)]:
            with self.subTest(data=data), self.assertRaises(ValueError):
                StateTracker().accept(data)


class FakeClient:
    def __init__(self, data=None, fail=False):
        self.data, self.fail = data or row(), fail
        self.callback = None
        self.closed = False
        self.realtime = self

    def channel(self, name): return self
    def on_postgres_changes(self, event, **kwargs):
        self.callback = kwargs['callback']
        return self
    async def subscribe(self, callback): callback(RealtimeSubscribeStates.SUBSCRIBED,None)
    def table(self, name): return self
    def rpc(self, name):
        assert name == 'get_race_state'
        return self
    def select(self, columns): return self
    def eq(self, column, value): return self
    def single(self): return self
    async def execute(self):
        if self.fail: raise ConnectionError('offline')
        # A newer websocket event races with the initial REST snapshot.
        self.callback({'data':{'record':row('RED',4)}})
        return SimpleNamespace(data=self.data)
    async def remove_all_channels(self): pass
    async def close(self): self.closed=True


class TransportTests(unittest.IsolatedAsyncioTestCase):
    async def run_transport(self, client):
        stop, events = threading.Event(), []
        def emit(event):
            events.append(event)
            stop.set()
        async def factory(*args, **kwargs): return client
        with patch('connection.acreate_client',factory):
            await asyncio.wait_for(receive_flags(CONFIG, emit, stop),timeout=1)
        self.assertTrue(client.closed)
        return events

    async def test_realtime_wins_over_delayed_initial_snapshot(self):
        events = await self.run_transport(FakeClient(row('GREEN',3)))
        self.assertTrue(events)
        self.assertTrue(all(e['flag']=='RED' for e in events))
        self.assertTrue(all(e['connection']=='Live' for e in events))

    async def test_prepare_to_race_is_delivered_instead_of_offline(self):
        event=dict(row('PREPARE TO RACE',5),custom_message='Ready',countdown_ends_at='2026-10-29T14:00:00Z')
        events=await self.run_transport(FakeClient(event))
        self.assertEqual(events[-1]['flag'],'PREPARE TO RACE')
        self.assertEqual(events[-1]['custom_message'],'Ready')
        self.assertIsNotNone(events[-1]['countdown_ends_at'])

    async def test_offline_is_visible_when_state_cannot_be_read(self):
        events = await self.run_transport(FakeClient(fail=True))
        self.assertEqual(events[-1]['flag'],'OFFLINE')

    async def test_installed_sdk_supports_subscription_and_close(self):
        from supabase import acreate_client
        client=await acreate_client(*validate_config(CONFIG))
        channel=client.channel('test').on_postgres_changes('UPDATE',callback=lambda _:None,
            schema='public',table='flag_state',filter='id=eq.1')
        self.assertTrue(callable(channel.subscribe))
        await client.realtime.close()


if __name__=='__main__': unittest.main()

