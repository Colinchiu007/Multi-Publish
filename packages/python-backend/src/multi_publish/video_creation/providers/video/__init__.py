"""Video providers package - adapted from OpenMontage."""

from __future__ import annotations

from multi_publish.video_creation.providers.video.auto_reframe import AutoReframe
from multi_publish.video_creation.providers.video.clip_cache import ClipCache
from multi_publish.video_creation.providers.video.clip_search import ClipSearch
from multi_publish.video_creation.providers.video.cogvideo_video import CogVideoVideo
from multi_publish.video_creation.providers.video.corpus_builder import CorpusBuilder
from multi_publish.video_creation.providers.video.direct_clip_search import DirectClipSearch
from multi_publish.video_creation.providers.video.green_screen_composite import GreenScreenComposite
from multi_publish.video_creation.providers.video.green_screen_processor import GreenScreenProcessor
from multi_publish.video_creation.providers.video.grok_video import GrokVideo
from multi_publish.video_creation.providers.video.heygen_video import HeyGenVideo
from multi_publish.video_creation.providers.video.higgsfield_video import HiggsFieldVideo

# AI Provider tools
from multi_publish.video_creation.providers.video.hunyuan_video import HunyuanVideo
from multi_publish.video_creation.providers.video.hyperframes_compose import HyperFramesCompose
from multi_publish.video_creation.providers.video.kling_video import KlingVideo
from multi_publish.video_creation.providers.video.ltx_video_local import LTXVideoLocal
from multi_publish.video_creation.providers.video.ltx_video_modal import LTXVideoModal
from multi_publish.video_creation.providers.video.minimax_video import MiniMaxVideo
from multi_publish.video_creation.providers.video.remotion_caption_burn import RemotionCaptionBurn
from multi_publish.video_creation.providers.video.runway_video import RunwayVideo
from multi_publish.video_creation.providers.video.seedance_replicate import SeedanceReplicate
from multi_publish.video_creation.providers.video.seedance_video import SeedanceVideo
from multi_publish.video_creation.providers.video.showcase_card import ShowcaseCard
from multi_publish.video_creation.providers.video.silence_cutter import SilenceCutter

# Stock source tools
from multi_publish.video_creation.providers.video.stock_sources.archive_org import ArchiveOrgVideo

# Stock source base protocol
from multi_publish.video_creation.providers.video.stock_sources.base import Candidate, SearchFilters
from multi_publish.video_creation.providers.video.stock_sources.coverr import CoverrVideo
from multi_publish.video_creation.providers.video.stock_sources.dareful import DarefulVideo
from multi_publish.video_creation.providers.video.stock_sources.esa import EsaVideo
from multi_publish.video_creation.providers.video.stock_sources.jaxa import JaxaVideo
from multi_publish.video_creation.providers.video.stock_sources.loc import LocVideo
from multi_publish.video_creation.providers.video.stock_sources.mixkit import MixkitVideo
from multi_publish.video_creation.providers.video.stock_sources.nara import NaraVideo
from multi_publish.video_creation.providers.video.stock_sources.nasa import NasaVideo
from multi_publish.video_creation.providers.video.stock_sources.noaa import NoaaVideo
from multi_publish.video_creation.providers.video.stock_sources.pexels import PexelsVideo
from multi_publish.video_creation.providers.video.stock_sources.pixabay_video import PixabayVideo
from multi_publish.video_creation.providers.video.stock_sources.pond5_pd import Pond5PdVideo
from multi_publish.video_creation.providers.video.stock_sources.unsplash import UnsplashVideo
from multi_publish.video_creation.providers.video.stock_sources.videvo import VidevoVideo
from multi_publish.video_creation.providers.video.stock_sources.wikimedia import WikimediaVideo
from multi_publish.video_creation.providers.video.veo_video import VeoVideo

# Processing tools
from multi_publish.video_creation.providers.video.video_compose import VideoCompose
from multi_publish.video_creation.providers.video.video_selector import VideoSelector
from multi_publish.video_creation.providers.video.video_stitch import VideoStitch
from multi_publish.video_creation.providers.video.video_trimmer import VideoTrimmer
from multi_publish.video_creation.providers.video.wan_video import WanVideo

__all__ = [
    # AI Providers
    "HunyuanVideo",
    "KlingVideo",
    "RunwayVideo",
    "VeoVideo",
    "WanVideo",
    "CogVideoVideo",
    "MiniMaxVideo",
    "GrokVideo",
    "HeyGenVideo",
    "SeedanceVideo",
    "SeedanceReplicate",
    "LTXVideoLocal",
    "LTXVideoModal",
    "HiggsFieldVideo",
    "HyperFramesCompose",
    # Processing
    "VideoCompose",
    "VideoSelector",
    "VideoStitch",
    "VideoTrimmer",
    "AutoReframe",
    "SilenceCutter",
    "RemotionCaptionBurn",
    "ShowcaseCard",
    "GreenScreenProcessor",
    "GreenScreenComposite",
    "ClipCache",
    "ClipSearch",
    "CorpusBuilder",
    "DirectClipSearch",
    # Stock sources
    "ArchiveOrgVideo",
    "CoverrVideo",
    "DarefulVideo",
    "EsaVideo",
    "JaxaVideo",
    "LocVideo",
    "MixkitVideo",
    "NaraVideo",
    "NasaVideo",
    "NoaaVideo",
    "PexelsVideo",
    "PixabayVideo",
    "Pond5PdVideo",
    "UnsplashVideo",
    "VidevoVideo",
    "WikimediaVideo",
    # Base
    "Candidate",
    "SearchFilters",
]
