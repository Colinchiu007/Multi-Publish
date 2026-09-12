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

    def __init__(self, error_code: str, fallback_text: str = ""):
        self.error_code = error_code
        self.fallback_text = fallback_text or error_code
        super().__init__(self.fallback_text)
