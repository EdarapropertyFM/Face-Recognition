"""Sideways cameras are turned upright before anything looks at the frame.

Doing it in the browser instead fixed only the appearance: recognition still
saw faces lying on their side, and the overlay the AI draws was rotated with
the picture, leaving the readout sideways.
"""
import numpy as np

from api.frame_rotation import normalise, rotate, swaps_axes


def frame(h=48, w=64):
    """A frame whose shape makes a quarter turn obvious."""
    img = np.zeros((h, w, 3), dtype=np.uint8)
    img[0, 0] = (255, 255, 255)          # a corner marker to follow
    return img


def test_a_quarter_turn_swaps_width_and_height():
    turned = rotate(frame(48, 64), 90)
    assert turned.shape[:2] == (64, 48)


def test_half_a_turn_keeps_the_shape():
    assert rotate(frame(48, 64), 180).shape[:2] == (48, 64)


def test_three_quarters_swaps_back():
    assert rotate(frame(48, 64), 270).shape[:2] == (64, 48)


def test_ninety_is_clockwise():
    """The top-left pixel should end up top-right after a clockwise turn."""
    turned = rotate(frame(48, 64), 90)
    assert tuple(turned[0, -1]) == (255, 255, 255)


def test_four_quarter_turns_return_the_original():
    original = frame()
    result = original
    for _ in range(4):
        result = rotate(result, 90)
    assert np.array_equal(result, original)


def test_zero_is_a_no_op_and_does_not_copy():
    original = frame()
    # The common case must cost nothing.
    assert rotate(original, 0) is original


def test_nonsense_angles_never_raise():
    original = frame()
    for bad in (None, "", "ninety", 37, -1, 3.7, object()):
        assert rotate(original, bad) is original


def test_angles_wrap():
    assert normalise(450) == 90
    assert normalise(360) == 0
    assert normalise(-90) == 270


def test_none_frame_is_returned_unchanged():
    assert rotate(None, 90) is None


def test_swaps_axes():
    assert swaps_axes(90) and swaps_axes(270)
    assert not swaps_axes(0) and not swaps_axes(180)
