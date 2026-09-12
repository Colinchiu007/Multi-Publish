"""用户可见错误的稳定错误码载体（i18n 友好提示机制的一部分）。

后端只负责抛出稳定的机器错误码 + 简短中文兜底描述；
渲染端根据 errorCode 从 locales/{zh,en}.js 读取当前语言的
「具体原因 + 解决方法建议」自然语言文案（formatUserError）。

约定：
- error_code 必须是稳定的大写蛇形字符串（如 LLM_KEY_MISSING），
  并同步登记到 apps/desktop/src/utils/user-facing-error.js 的
  USER_ERROR_CODES 与 locales/{zh,en}.js 的 userErrors.* 命名空间。
- fallback_text 仅作为渲染端无法识别错误码时的兜底，
  不应包含环境变量名、内部路径等技术细节。
"""

from __future__ import annotations

__all__ = ["UserVisibleError"]


class UserVisibleError(ValueError):
    """携带稳定错误码的用户可见错误。

    继承 ValueError 以兼容既有 except ValueError 处理链；
    router 层优先捕获本类，把 error_code 放入 HTTP 响应的
    error_code 字段（而非仅 detail 文本）。
    """

    def __init__(self, error_code: str, fallback_text: str = "", params: dict | None = None):
        self.error_code = error_code
        self.fallback_text = fallback_text or error_code
        self.params = params or {}
        super().__init__(self.fallback_text)


# ── aggregation 域稳定错误码 + locale 插值参数（2026-09-12 存量收敛）──
# 渲染端对应文案：locales/{zh,en}.js 的 userErrors.* 命名空间，
# {param} 占位符由渲染端 formatUserError 的 messageParams 机制插值。
AGGREGATION_ERROR_CODES = frozenset({
    "AGGREGATION_CONTENT_EMPTY",      # 改写内容为空
    "AGGREGATION_URL_EMPTY",          # 采集 URL 为空
    "AGGREGATION_URL_INVALID",        # 采集 URL 协议不支持
    "AGGREGATION_SOURCE_TYPE_UNSUPPORTED",  # 不支持的采集源类型
    "AGGREGATION_STYLE_UNSUPPORTED",  # 不支持的改写风格
    "AGGREGATION_LENGTH_UNSUPPORTED", # 不支持的长度档位
    "AGGREGATION_WORD_COUNT_RANGE_INVALID", # 字数区间非法（max < min）
    "AGGREGATION_REWRITE_FAILED",     # 改写引擎返回失败（兜底）
    "AGGREGATION_INTERNAL_ERROR",     # 服务内部 500 兜底（异常原文只进日志）
    "AGGREGATION_TASK_NOT_FOUND",     # 任务不存在/已过期
})
