"""Tests for video_stitch xfade filtergraph builder — extracted from video_stitch.py.

Covers the pure filtergraph construction for chaining xfade transitions across
N > 2 clips. Before extraction this logic lived inside ``VideoStitch._chain_xfade``
which mixed pure string building with ``self.run_command(cmd)`` subprocess calls
— making the filtergraph arithmetic untestable without mocking ffmpeg.

Extracted functions:
- ``build_chain_xfade_filtergraph(clips, duration, probes, transition)``
  → ``(input_args, filter_complex)``
- ``get_xfade_offset(probes, clip_index, duration) -> float``

Both are pure: no I/O, no subprocess, deterministic given inputs.
"""

from __future__ import annotations

from multi_publish.video_creation.providers.video.video_stitch_xfade import (
    build_chain_xfade_filtergraph,
    get_xfade_offset,
)


# ─── Helpers ────────────────────────────────────────────────


def _probe(duration: float, **extra) -> dict:
    """Build a minimal probe dict with a duration."""
    return {"duration": duration, **extra}


def _probes(*durations: float) -> list[dict]:
    """Build a list of probe dicts from durations."""
    return [_probe(d) for d in durations]


# ─── build_chain_xfade_filtergraph: basic structure ────────


class TestBuildChainXfadeStructure:
    def test_3_clips_produces_3_input_args(self):
        clips = ["a.mp4", "b.mp4", "c.mp4"]
        input_args, _ = build_chain_xfade_filtergraph(
            clips, duration=1.0, probes=_probes(5, 5, 5), transition="fade"
        )
        # 3 clips → 3 pairs of ["-i", clip]
        assert input_args == ["-i", "a.mp4", "-i", "b.mp4", "-i", "c.mp4"]

    def test_3_clips_produces_2_video_filters_and_2_audio_filters(self):
        clips = ["a.mp4", "b.mp4", "c.mp4"]
        _, filter_complex = build_chain_xfade_filtergraph(
            clips, duration=1.0, probes=_probes(5, 5, 5), transition="fade"
        )
        # filter_complex is "vf1;vf2;af1;af2"
        parts = filter_complex.split(";")
        assert len(parts) == 4
        # First two are xfade (video), last two are acrossfade (audio)
        assert parts[0].startswith("[0:v]")
        assert "xfade=transition=fade" in parts[0]
        assert parts[1].startswith("[vfade0]")
        assert "xfade=transition=fade" in parts[1]
        assert parts[2].startswith("[0:a]")
        assert "acrossfade" in parts[2]
        assert parts[3].startswith("[afade0]")
        assert "acrossfade" in parts[3]

    def test_2_clips_produces_1_video_filter_and_1_audio_filter(self):
        clips = ["a.mp4", "b.mp4"]
        _, filter_complex = build_chain_xfade_filtergraph(
            clips, duration=1.0, probes=_probes(5, 5), transition="fade"
        )
        parts = filter_complex.split(";")
        assert len(parts) == 2  # 1 video + 1 audio

    def test_4_clips_produces_3_video_filters_and_3_audio_filters(self):
        clips = ["a.mp4", "b.mp4", "c.mp4", "d.mp4"]
        _, filter_complex = build_chain_xfade_filtergraph(
            clips, duration=1.0, probes=_probes(5, 5, 5, 5), transition="fade"
        )
        parts = filter_complex.split(";")
        assert len(parts) == 6  # 3 video + 3 audio

    def test_filter_complex_joined_by_semicolon(self):
        clips = ["a.mp4", "b.mp4", "c.mp4"]
        _, filter_complex = build_chain_xfade_filtergraph(
            clips, duration=1.0, probes=_probes(5, 5, 5), transition="fade"
        )
        # Should be a single string joined by ";", no trailing ";"
        assert filter_complex.count(";") == 3  # 4 parts → 3 semicolons
        assert not filter_complex.endswith(";")
        assert not filter_complex.startswith(";")


# ─── build_chain_xfade_filtergraph: label chain ────────────


class TestBuildChainXfadeLabels:
    def test_first_pair_uses_stream_zero_as_in1(self):
        clips = ["a.mp4", "b.mp4", "c.mp4"]
        _, filter_complex = build_chain_xfade_filtergraph(
            clips, duration=1.0, probes=_probes(5, 5, 5), transition="fade"
        )
        parts = filter_complex.split(";")
        # First video filter: [0:v][1:v]xfade...[vfade0]
        assert parts[0].startswith("[0:v][1:v]xfade")
        assert parts[0].endswith("[vfade0]")
        # First audio filter: [0:a][1:a]acrossfade...[afade0]
        assert parts[2].startswith("[0:a][1:a]acrossfade")
        assert parts[2].endswith("[afade0]")

    def test_middle_pair_uses_previous_fade_label_as_in1(self):
        clips = ["a.mp4", "b.mp4", "c.mp4", "d.mp4"]
        _, filter_complex = build_chain_xfade_filtergraph(
            clips, duration=1.0, probes=_probes(5, 5, 5, 5), transition="fade"
        )
        parts = filter_complex.split(";")
        # Second video filter (i=1): [vfade0][2:v]xfade...[vfade1]
        assert parts[1].startswith("[vfade0][2:v]xfade")
        assert parts[1].endswith("[vfade1]")
        # Third video filter (i=2): [vfade1][3:v]xfade...[vout]  (last one)
        assert parts[2].startswith("[vfade1][3:v]xfade")
        assert parts[2].endswith("[vout]")

    def test_last_pair_outputs_vout_and_aout(self):
        clips = ["a.mp4", "b.mp4", "c.mp4"]
        _, filter_complex = build_chain_xfade_filtergraph(
            clips, duration=1.0, probes=_probes(5, 5, 5), transition="fade"
        )
        parts = filter_complex.split(";")
        # Last video filter outputs [vout], last audio outputs [aout]
        assert parts[1].endswith("[vout]")  # i=1 is last (n-2=1 for n=3)
        assert parts[3].endswith("[aout]")

    def test_2_clips_first_pair_is_also_last_outputs_vout(self):
        """With only 2 clips, i=0 is both first AND last → outputs [vout]/[aout]."""
        clips = ["a.mp4", "b.mp4"]
        _, filter_complex = build_chain_xfade_filtergraph(
            clips, duration=1.0, probes=_probes(5, 5), transition="fade"
        )
        parts = filter_complex.split(";")
        assert parts[0].startswith("[0:v][1:v]xfade")
        assert parts[0].endswith("[vout]")  # first AND last
        assert parts[1].endswith("[aout]")


# ─── build_chain_xfade_filtergraph: offset arithmetic ──────


class TestBuildChainXfadeOffsets:
    def test_first_offset_is_clip0_duration_minus_transition(self):
        clips = ["a.mp4", "b.mp4", "c.mp4"]
        _, filter_complex = build_chain_xfade_filtergraph(
            clips, duration=1.0, probes=_probes(5, 5, 5), transition="fade"
        )
        parts = filter_complex.split(";")
        # offset = clip0_dur - duration = 5 - 1 = 4
        assert "offset=4" in parts[0]

    def test_second_offset_is_cumulative(self):
        """For 3 clips: offset[1] = offset[0] + clip1_dur - duration."""
        clips = ["a.mp4", "b.mp4", "c.mp4"]
        _, filter_complex = build_chain_xfade_filtergraph(
            clips, duration=1.0, probes=_probes(5, 5, 5), transition="fade"
        )
        parts = filter_complex.split(";")
        # offset[0] = 5 - 1 = 4
        # offset[1] = 4 + 5 - 1 = 8
        assert "offset=4" in parts[0]
        assert "offset=8" in parts[1]

    def test_offset_with_uneven_durations(self):
        clips = ["a.mp4", "b.mp4", "c.mp4"]
        # clip0=10, clip1=3, clip2=7; duration=2
        _, filter_complex = build_chain_xfade_filtergraph(
            clips, duration=2.0, probes=_probes(10, 3, 7), transition="fade"
        )
        parts = filter_complex.split(";")
        # offset[0] = 10 - 2 = 8
        # offset[1] = 8 + 3 - 2 = 9
        assert "offset=8" in parts[0]
        assert "offset=9" in parts[1]

    def test_offset_clamped_to_zero_when_negative(self):
        """When clip duration < transition duration, offset clamped to 0."""
        clips = ["a.mp4", "b.mp4", "c.mp4"]
        # clip0=0.5, duration=2 → offset = 0.5 - 2 = -1.5 → clamped to 0
        _, filter_complex = build_chain_xfade_filtergraph(
            clips, duration=2.0, probes=_probes(0.5, 5, 5), transition="fade"
        )
        parts = filter_complex.split(";")
        assert "offset=0" in parts[0]

    def test_offset_rounded_to_3_decimals(self):
        clips = ["a.mp4", "b.mp4", "c.mp4"]
        # clip0=10.12345, duration=1.5 → offset = 8.62345 → rounded to 8.623
        _, filter_complex = build_chain_xfade_filtergraph(
            clips, duration=1.5, probes=_probes(10.12345, 5, 5), transition="fade"
        )
        parts = filter_complex.split(";")
        assert "offset=8.623" in parts[0]


# ─── build_chain_xfade_filtergraph: parameters ─────────────


class TestBuildChainXfadeParams:
    def test_transition_parameter_interpolated(self):
        clips = ["a.mp4", "b.mp4", "c.mp4"]
        _, filter_complex = build_chain_xfade_filtergraph(
            clips, duration=1.0, probes=_probes(5, 5, 5), transition="wipeleft"
        )
        assert "transition=wipeleft" in filter_complex

    def test_duration_parameter_interpolated(self):
        clips = ["a.mp4", "b.mp4", "c.mp4"]
        _, filter_complex = build_chain_xfade_filtergraph(
            clips, duration=0.75, probes=_probes(5, 5, 5), transition="fade"
        )
        assert "duration=0.75" in filter_complex

    def test_duration_integer_emitted_without_decimal(self):
        """Integer duration should be emitted as ``duration=1`` not ``duration=1.0``.

        The original code uses f-string interpolation of a float, which would
        produce ``1.0``. We pin down the current behavior.
        """
        clips = ["a.mp4", "b.mp4", "c.mp4"]
        _, filter_complex = build_chain_xfade_filtergraph(
            clips, duration=1, probes=_probes(5, 5, 5), transition="fade"
        )
        # int 1 → str(1) = "1"
        assert "duration=1" in filter_complex


# ─── build_chain_xfade_filtergraph: edge cases ─────────────


class TestBuildChainXfadeEdgeCases:
    def test_single_clip_returns_empty_filtergraph(self):
        """Single clip → no transitions needed → empty filter_complex."""
        input_args, filter_complex = build_chain_xfade_filtergraph(
            ["a.mp4"], duration=1.0, probes=_probes(5), transition="fade"
        )
        assert input_args == ["-i", "a.mp4"]
        assert filter_complex == ""

    def test_missing_duration_in_probe_defaults_to_zero(self):
        clips = ["a.mp4", "b.mp4", "c.mp4"]
        # probe[0] has no "duration" key
        probes = [{}, _probe(5), _probe(5)]
        _, filter_complex = build_chain_xfade_filtergraph(
            clips, duration=1.0, probes=probes, transition="fade"
        )
        parts = filter_complex.split(";")
        # offset[0] = 0 - 1 = -1 → clamped to 0
        assert "offset=0" in parts[0]

    def test_fewer_probes_than_clips_uses_zero_for_missing(self):
        """If probes list is shorter than clips, missing probes default to duration=0."""
        clips = ["a.mp4", "b.mp4", "c.mp4"]
        # Only 1 probe for 3 clips
        _, filter_complex = build_chain_xfade_filtergraph(
            clips, duration=1.0, probes=_probes(5), transition="fade"
        )
        parts = filter_complex.split(";")
        # offset[0] = 5 - 1 = 4
        assert "offset=4" in parts[0]
        # offset[1] = 4 + 0 (probe[1] missing) - 1 = 3
        assert "offset=3" in parts[1]


# ─── get_xfade_offset ──────────────────────────────────────


class TestGetXfadeOffset:
    def test_first_clip_offset_is_duration_minus_transition(self):
        probes = _probes(5, 5, 5)
        # clip_index=0, duration=1 → 5 - 1 = 4
        assert get_xfade_offset(probes, clip_index=0, duration=1.0) == 4.0

    def test_second_clip_offset(self):
        probes = _probes(5, 5, 5)
        # clip_index=1, duration=1 → 5 - 1 = 4
        assert get_xfade_offset(probes, clip_index=1, duration=1.0) == 4.0

    def test_zero_duration_transition_returns_full_clip_duration(self):
        """duration=0 → offset = clip_dur - 0 = clip_dur."""
        probes = _probes(5)
        assert get_xfade_offset(probes, clip_index=0, duration=0) == 5.0

    def test_transition_longer_than_clip_clamped_to_zero(self):
        """clip_dur < duration → offset = max(0, negative) = 0."""
        probes = _probes(0.5)
        assert get_xfade_offset(probes, clip_index=0, duration=2.0) == 0.0

    def test_clip_index_out_of_range_returns_zero(self):
        probes = _probes(5)
        # clip_index=5 but only 1 probe → 0
        assert get_xfade_offset(probes, clip_index=5, duration=1.0) == 0.0

    def test_missing_duration_in_probe_defaults_to_zero(self):
        probes = [{}]  # no "duration" key
        assert get_xfade_offset(probes, clip_index=0, duration=1.0) == 0.0

    def test_offset_rounded_to_3_decimals(self):
        probes = _probes(10.12345)
        # 10.12345 - 1 = 9.12345 → rounded to 9.123
        assert get_xfade_offset(probes, clip_index=0, duration=1.0) == 9.123
