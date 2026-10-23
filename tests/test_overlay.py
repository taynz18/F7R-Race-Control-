import unittest
from overlay_ui import (COLORS, rgb, render_flag, hit_zone, resize_from_edge,
                        visible_on_monitors, racing_font)


class ResizeTests(unittest.TestCase):
    def test_all_edges_and_corners_preserve_opposite_edges(self):
        rect=(100,200,400,160)
        expected={
            'n':(100,220,400,140),'s':(100,200,400,180),
            'e':(100,200,430,160),'w':(130,200,370,160),
            'ne':(100,220,430,140),'nw':(130,220,370,140),
            'se':(100,200,430,180),'sw':(130,200,370,180),
        }
        for edge,result in expected.items():
            with self.subTest(edge=edge):
                self.assertEqual(resize_from_edge(rect,edge,30,20),result)

    def test_minimum_size_keeps_right_and_bottom_anchored(self):
        self.assertEqual(resize_from_edge((100,200,400,160),'nw',500,500),(260,270,240,90))

    def test_maximum_size_keeps_right_and_bottom_anchored(self):
        self.assertEqual(resize_from_edge((100,200,400,160),'nw',-5000,-5000),(-700,-120,1200,480))

    def test_negative_monitor_coordinates_are_supported(self):
        self.assertEqual(resize_from_edge((-800,40,400,160),'w',-50,0),(-850,40,450,160))

    def test_unknown_edge_is_rejected(self):
        with self.assertRaises(ValueError): resize_from_edge((0,0,400,160),'move',10,10)

    def test_close_and_resize_targets_do_not_overlap(self):
        self.assertEqual(hit_zone(377,22,400,160),'close')
        self.assertEqual(hit_zone(398,2,400,160),'ne')
        self.assertEqual(hit_zone(398,80,400,160),'e')
        self.assertEqual(hit_zone(200,80,400,160),'move')

    def test_disconnected_monitor_position_is_detected(self):
        screens=[(-1920,0,0,1080),(0,0,1920,1080)]
        self.assertTrue(visible_on_monitors((-500,80,380,125),screens))
        self.assertFalse(visible_on_monitors((5000,80,380,125),screens))


class ArtworkTests(unittest.TestCase):
    def test_flags_have_transparent_corners_and_matching_dark_borders(self):
        for flag,(_,border) in COLORS.items():
            with self.subTest(flag=flag):
                image=render_flag(400,140,flag)
                self.assertEqual(image.size,(400,140))
                for point in [(0,0),(399,0),(0,139),(399,139)]:
                    self.assertEqual(image.getpixel(point),(1,2,3))
                self.assertNotEqual(image.getpixel((200,2)),(1,2,3))
                self.assertGreater(sum(image.getpixel((200,2))),sum(image.getpixel((200,6))))

    def test_bundled_racing_font_is_loaded(self):
        self.assertIn(racing_font(24).getname()[0], ('Bahnschrift', 'Racing Sans One'))

    def test_messages_and_countdowns_render_without_losing_transparent_corners(self):
        for flag in COLORS:
            for width,height in [(240,90),(600,180)]:
                image=render_flag(width,height,flag,message='Hold position. No overtaking. '*4,countdown=10 if flag=='FCY' else None)
                self.assertEqual(image.size,(width,height))
                self.assertEqual(image.getpixel((0,0)),(1,2,3))
        first=render_flag(400,140,'FCY',countdown=10)
        second=render_flag(400,140,'FCY',countdown=9)
        self.assertNotEqual(first.tobytes(),second.tobytes())

    def test_minimum_and_maximum_panels_render(self):
        for width,height in [(240,90),(1200,480),(240,480),(1200,90)]:
            with self.subTest(size=(width,height)):
                image=render_flag(width,height,'SAFETY CAR',handles=True)
                self.assertEqual(image.size,(width,height))


if __name__=='__main__': unittest.main()
