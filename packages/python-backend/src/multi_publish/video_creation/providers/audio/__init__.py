"""AI audio and TTS providers."""
from __future__ import annotations

from multi_publish.video_creation.providers.audio.audio_selector import AudioSelector
from multi_publish.video_creation.providers.audio.doubao_tts import DoubaoTTS
from multi_publish.video_creation.providers.audio.elevenlabs_tts import ElevenLabsTTS
from multi_publish.video_creation.providers.audio.freesound_music import FreesoundMusic
from multi_publish.video_creation.providers.audio.google_tts import GoogleTTS
from multi_publish.video_creation.providers.audio.music_generator import MusicGenerator
from multi_publish.video_creation.providers.audio.music_library import MusicLibrary
from multi_publish.video_creation.providers.audio.openai_tts import OpenAITTS
from multi_publish.video_creation.providers.audio.piper_tts import PiperTTS
from multi_publish.video_creation.providers.audio.pixabay_music import PixabayMusic
from multi_publish.video_creation.providers.audio.suno_music import SunoMusic
from multi_publish.video_creation.providers.audio.tts_selector import TTSSelector

__all__ = [
    "ElevenLabsTTS",
    "OpenAITTS",
    "DoubaoTTS",
    "GoogleTTS",
    "PiperTTS",
    "TTSSelector",
    "SunoMusic",
    "PixabayMusic",
    "FreesoundMusic",
    "MusicLibrary",
    "MusicGenerator",
    "AudioSelector",
]
