"""Update douyin.py with per-account browser data dir"""
import re

with open('/sessions/sleepy-determined-dijkstra/mnt/projects/Multi-Publish/packages/python-backend/src/multi_publish/publishers/douyin.py') as f:
    content = f.read()

# Replace hardcoded browser_data paths with method call
content = content.replace(
    "user_data_dir=os.path.join(self.config.data_dir, 'browser_data')",
    "user_data_dir=self._get_browser_data_dir()"
)
content = content.replace(
    "user_data_dir=os.path.join(self.config.data_dir, 'browser_data_check')",
    "user_data_dir=self._get_browser_data_dir(check=True)"
)

# Add _get_browser_data_dir method before the do_publish section
old_section = '# ═══════════════════════════════════════════════════════════════\n    # RPA 模式发布（增强版 — 响应拦截 + Per-Field 重试）'
new_method = '''# ── Browser data dir (P1-2: Per-Account Session 隔离) ─────────

    def _get_browser_data_dir(self, check: bool = False) -> str:
        """获取当前账号的浏览器数据目录

        每个 account_id 使用独立的 browser_data 子目录，
        同平台多账号切换时不会因为残留 cookie 导致登录态错乱。
        """
        base = os.path.join(self.config.data_dir, "browser_data")
        suffix = "_check" if check else ""
        if self.account_id:
            return f"{base}_{self.account_id}{suffix}"
        return f"{base}{suffix}"

    # ═══════════════════════════════════════════════════════════════
    # RPA 模式发布（增强版 — 响应拦截 + Per-Field 重试）'''

content = content.replace(old_section, new_method, 1)

with open('/sessions/sleepy-determined-dijkstra/mnt/projects/Multi-Publish/packages/python-backend/src/multi_publish/publishers/douyin.py', 'w') as f:
    f.write(content)
print('douyin.py updated')