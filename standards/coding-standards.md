# Coding Standards — PROJECT-003 Multi-Publish

## 语言版本

| 语言 | 版本 | 说明 |
|------|------|------|
| Node.js | 20+ | Electron 33+ 要求 |
| Python | 3.12+ | 后端 + RPA |
| Vue | 3.5+ | 前端 |

## JavaScript / TypeScript 规范

### 代码风格

- **缩进**: 2 空格
- **引号**: 单引号 `'`
- **分号**: 必须
- **命名**: 类 PascalCase, 函数 camelCase, 常量 UPPER_SNAKE_CASE
- **注释**: JSDoc 格式，关键路径加 `// TODO` 标记

### 禁止事项

```javascript
// ❌ 禁止
const data = require('../some-deep-path')  // 使用 workspace 包
const app = require('electron').app         // packages/ 中禁止直接 require electron

// ✅ 正确
const { TaskQueue } = require('@multi-publish/shared-utils')
const { launchBrowser } = require('@multi-publish/rpa-engine')
```

### Electron 主进程规范

- 主进程和渲染进程职责分离
- 使用 `ipcMain`/`ipcRenderer` 通信，不要跨进程直接访问
- 所有 IPC 通道在 `preload.js` 中白名单暴露
- 敏感操作在主进程执行，不要泄露到渲染进程

### 发布器接口规范

```javascript
// 所有平台发布器必须继承 BaseRPAPublisher
class PlatformPublisher extends BaseRPAPublisher {
  // 必须实现：
  async checkLogin()     // → boolean
  async waitForLogin()   // → boolean
  async publish()        // → { success, url, mediaId? }

  // 可选：
  async cleanup()        // 资源清理
  onProgress(cb)         // 进度回调
}
```

## Python 规范

### 代码风格

- **格式化**: 使用 `ruff format`（目标 Python 3.12）
- **命名**: PEP 8
- **类型注解**: 关键函数必须加
- **错误处理**: 具体异常类型 + 日志

```python
# ❌ 禁止
except Exception:
    pass

# ✅ 正确
except asyncio.TimeoutError as e:
    logger.error(f"Publish timeout: {e}", exc_info=True)
    raise
```

### 模块结构

```python
# multi_publish/core/query_worker.py
from loguru import logger

class QueryWorker:
    """查询 Worker 基类"""

    async def check_account_alive(self) -> bool:
        """检查账号存活"""
        ...

    async def check_audit_status(self, publish_id: str) -> dict:
        """检查发布审核状态"""
        ...
```

## Git 提交规范

```
<type>(<scope>): <subject>

feat(publisher): add youtube publisher
fix(publisher): wechat_mp cookie save path
docs(prd): update v1.0.7 architecture
refactor(monorepo): split rpa-engine into packages
chore(ci): fix build path for monorepo
```

**type**: `feat` / `fix` / `docs` / `refactor` / `chore` / `test` / `ci`
