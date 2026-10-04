"""小红书认证数据持久化 mixin（cookies / localStorage 存取）。

从 xiaohongshu.py 拆出，满足新代码单文件行数门禁。
依赖宿主类提供的 self._context / self._page / self._auth_data_path / self._cookie_path。
"""

from __future__ import annotations

import os

from loguru import logger

from multi_publish.publishers.legacy_auth_policy import require_legacy_plaintext_auth


class XiaohongshuAuthMixin:
    async def _save_auth_data(self):
        require_legacy_plaintext_auth()
        if not self._context or not self._page:
            return
        try:
            cookies = await self._context.cookies()
            local_storage = await self._page.evaluate("JSON.stringify(localStorage)")
            import json

            data = {
                "cookies": cookies,
                "local_storage": json.loads(local_storage) if local_storage else {},
                "captured_at": __import__("time").time(),
            }
            os.makedirs(os.path.dirname(self._auth_data_path), exist_ok=True)
            with open(self._auth_data_path, "w", encoding="utf-8") as f:
                json.dump(data, f)
            logger.info("认证数据已保存")
        except Exception as e:
            logger.warning(f"保存认证数据失败: {e}")

    async def _restore_auth_data(self) -> bool:
        require_legacy_plaintext_auth()
        import json

        if not os.path.exists(self._auth_data_path):
            if not os.path.exists(self._cookie_path):
                return False
            return await self._restore_cookies_legacy()
        try:
            with open(self._auth_data_path, encoding="utf-8") as f:
                data = json.load(f)
            if data.get("cookies"):
                await self._context.add_cookies(data["cookies"])
            if data.get("local_storage") and self._page:
                for key, value in data["local_storage"].items():
                    try:
                        await self._page.evaluate("localStorage.setItem(arguments[0], arguments[1])", key, value)
                    except Exception:
                        pass
            logger.info("认证数据已恢复")
            return True
        except Exception as e:
            logger.warning(f"恢复认证数据失败: {e}")
            return False

    async def _restore_cookies_legacy(self) -> bool:
        require_legacy_plaintext_auth()
        import json

        try:
            with open(self._cookie_path, encoding="utf-8") as f:
                cookies = json.load(f)
            await self._context.add_cookies(cookies)
            logger.info("Cookie 已恢复（旧格式）")
            return True
        except Exception as e:
            logger.warning(f"恢复 Cookie 失败: {e}")
            return False
