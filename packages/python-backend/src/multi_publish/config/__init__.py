# Copyright (C) 2025 AIDC-AI
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#     http://www.apache.org/licenses/LICENSE-2.0
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.
"""Multi-Publish configuration system.

Unified configuration management with Pydantic v2 validation, hot reload,
and deep-merge updates. Migrated from Pixelle-Video (Apache 2.0).

Usage::

    from multi_publish.config import ConfigManager

    mgr = ConfigManager("config/config.yaml")

    # Type-safe access
    api_key = mgr.config.llm.api_key

    # Update (deep merge — only touches the supplied fields)
    mgr.update({"llm": {"api_key": "xxx"}})
    mgr.save()

    # Hot reload after editing the file on disk
    mgr.reload()

    # Convenience accessors
    mgr.set_llm_config(api_key="k", base_url="http://x", model="m")
    cfg = mgr.get_llm_config()
"""

from .loader import load_config_dict, save_config_dict
from .manager import ConfigManager
from .schema import (
    LLMConfig,
    MultiPublishConfig,
    PublisherConfig,
    PublishersConfig,
    TTSConfig,
    VideoCreationConfig,
)

__all__ = [
    "ConfigManager",
    "LLMConfig",
    "MultiPublishConfig",
    "PublisherConfig",
    "PublishersConfig",
    "TTSConfig",
    "VideoCreationConfig",
    "load_config_dict",
    "save_config_dict",
]
