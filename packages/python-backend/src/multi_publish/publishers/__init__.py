"""
发布器模块

各平台发布器实现。

新增平台：
  1. 在 publishers/ 下创建 {platform_key}.py，实现 BasePublisher 子类
  2. 在 platforms.json 中添加一行 "{platform_key}": "multi_publish.publishers.{platform_key}:{ClassName}"
  3. 或者调用 registry.register("{platform_key}", "my.module:ClassName")
"""

from multi_publish.publishers.base import (
    BasePublisher,
    DOM_FILE_UPLOAD_UTILITIES,
    DOM_XPATH_UTILITIES,
    FieldRetryMap,
    ProgressThrottle,
    PublisherConfig,
    PublishResult,
    ResponseMonitor,
    async_retry,
)
from multi_publish.publishers.platform_registry import PlatformRegistry, registry
from multi_publish.publishers.wechat_mp import WeChatPublisher
from multi_publish.publishers.douyin import DouyinPublisher

__all__ = [
    "BasePublisher",
    "PublisherConfig",
    "PublishResult",
    "async_retry",
    "FieldRetryMap",
    "ProgressThrottle",
    "ResponseMonitor",
    "DOM_XPATH_UTILITIES",
    "DOM_FILE_UPLOAD_UTILITIES",
    "registry",
    "PlatformRegistry",
    "WeChatPublisher",
    "DouyinPublisher",
]
