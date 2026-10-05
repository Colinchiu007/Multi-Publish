"""小红书 DOM 轨配置常量（选择器回退链 / 确认端点 / 错误码 / 超时）。

从 xiaohongshu.py 拆出，满足新代码单文件行数门禁（check-debt-budget.js）。
xiaohongshu.py 通过 import 复用这些名字；因导入名即模块属性，
测试对 xiaohongshu 模块全局的 monkeypatch 仍能覆盖运行时读取。
"""

from __future__ import annotations

DEFAULT_SELECTORS = {
    "login_qrcode": '[class*="qrcode"]',
    "login_success_indicator": '[class*="creator-home"]',
    "upload_page_url": "https://creator.xiaohongshu.com/publish/publish",
    "upload_input": 'input[type="file"]',
    "title_input": '[class*="title"] input, [placeholder*="标题"]',
    "content_textarea": '[class*="content"] textarea, [class*="desc"] textarea, [placeholder*="正文"]',
    "publish_button": 'button:has-text("发布"), button:has-text("发布笔记")',
    "tag_input": '[class*="tag"] input, [placeholder*="标签"]',
    "cover_upload": '[class*="cover"]',
    "cover_input": 'input[type="file"]',
    "upload_progress": '[class*="progress"]',
    "upload_complete": '[class*="upload-success"]',
    "draft_button": 'button:has-text("草稿")',
}

# 逻辑控件 → 多候选回退链（Tier2 取证后回填更稳的具体值）。命中即停止。
# 与 DEFAULT_SELECTORS 并存：解析时先取回退链，无回退链则回退 DEFAULT_SELECTORS 单值。
SELECTOR_FALLBACKS: dict[str, list[str]] = {
    "title_input": [
        '[placeholder*="标题"]',
        'input[placeholder*="输入标题"]',
        '[class*="title"] input',
        '[class*="title"] [contenteditable="true"]',
    ],
    "content_textarea": [
        '[class*="editor"] [contenteditable="true"]',
        '[contenteditable="true"][class*="desc"]',
        '[class*="content"] textarea',
        '[class*="content"] [contenteditable="true"]',
        '[placeholder*="正文"]',
    ],
    "draft_button": [
        'button:has-text("存草稿")',
        'button:has-text("保存草稿")',
        '[class*="draft"]',
        'button:has-text("草稿")',
    ],
    "publish_button": [
        'button:has-text("发布笔记")',
        'div[role="button"]:has-text("发布")',
        'button:has-text("发布")',
    ],
    "upload_complete": [
        '[class*="upload-success"]',
        '[class*="upload"] [class*="success"]',
        '[class*="preview"] img',
    ],
    "tag_input": ['[placeholder*="标签"]', '[class*="tag"] input'],
    "tag_suggestion": ['[class*="tag-suggestion"]', '[class*="suggest"] li'],
}

# Tier2 活体取证回填项（当前为占位，未取证前确认通道保守返回未确认）：
# 草稿保存成功的 XHR 端点子串（命中后经响应体判定 code==0/success==true）。
DRAFT_SAVE_RESPONSE_PATTERNS: list[str] = []
CONFIRM_TIMEOUT_S = 20.0
# 草稿箱回查兜底：导航地址 + 条目匹配选择器（Tier2 取证回填）。
DRAFT_BOX_URL = "https://creator.xiaohongshu.com/publish/publish?draft=true"
DRAFT_BOX_ITEM_SELECTOR = '[class*="draft"] [class*="title"]'
# 风控/验证弹层选择器（Tier2 取证回填），命中即判 risk_blocked 并停止。
RISK_OVERLAY_SELECTOR = ""

CREATOR_URL = "https://creator.xiaohongshu.com/"

# 机器可读错误码前缀，便于上层 outcomeOfResult 归一（risk/login 绝不降级换号）。
CODE_LOGIN_EXPIRED = "XHS_LOGIN_EXPIRED"
CODE_RISK_BLOCKED = "XHS_RISK_BLOCKED"
CODE_DRAFT_ENTRY_MISSING = "XHS_DRAFT_ENTRY_MISSING"
CODE_UPLOAD_FAILED = "XHS_UPLOAD_FAILED"
CODE_TITLE_FAILED = "XHS_TITLE_FAILED"
CODE_UNCONFIRMED = "XHS_UNCONFIRMED"

# 脆弱等待改造：固定 sleep 换成条件轮询 + 具名上限。
NAVIGATE_READY_TIMEOUT_S = 10.0
NAVIGATE_READY_POLL_INTERVAL_S = 0.5
UPLOAD_FALLBACK_WAIT_TIMEOUT_S = 30.0
UPLOAD_FALLBACK_POLL_INTERVAL_S = 0.5


def coded(code: str, message: str) -> str:
    """把机器可读码拼进 error 字符串，保留人类可读信息。"""
    return f"[{code}] {message}"
