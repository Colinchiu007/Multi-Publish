# 开发者日志规范（LOGGING-GUIDELINES）

> 2026-09-12 · logging-coverage-audit 交付物 · 适用于全部运行时代码

## 1. 什么时候必须写日志

| 场景 | 级别 | 必含字段 |
|---|---|---|
| catch 异常 | error | 模块名、error.message、stack（截断） |
| 返回失败结构体（`{success:false}` / `{code:-1}`） | warn | platform/taskId、error、url/selector（如有） |
| 静默降级（fallback/回退/默认值） | warn | 降级原因、降级前后状态 |
| 子进程非 0 退出 | error | 命令、exitCode、stderr 尾部 |
| 关键路径开始/成功 | info | platform/taskId、关键产物标识 |
| 状态机迁移 | info | from → to、taskId |
| 外部 HTTP 调用失败 | warn/error | url、status、耗时 |

## 2. 禁止的反模式（本次审计发现的病灶）

```js
// ❌ 1. 裸 catch 无日志
} catch (e) { return { code: -1, message: e.message } }

// ✅ 改为
} catch (e) { log.warn('[ipc:模块]', ((e && e.message) || e)); return { code: -1, message: e.message } }

// ❌ 2. 失败分支静默 return
if (notLoggedIn) return { success: false, error: 'not logged in' }

// ✅ 改为
if (notLoggedIn) { log.warn('RpaView', '[platform] not logged in url=' + url); return { success: false, error: 'not logged in' } }

// ❌ 3. 空 catch 吞渲染进程日志
win.webContents.on('console-message', function(){})

// ❌ 4. 子进程 stderr 丢弃
spawn(cmd, args, { stdio: 'ignore' })

// ❌ 5. 降级无痕
} catch (e) { return [] }  // AI 失败静默返回空数组
```

## 3. 各模块 logger 用法速查

| 模块 | logger | 用法 |
|---|---|---|
| apps/desktop/electron | `require('./logger')` | `log.info(tag, msg)` / `log.warn` / `log.error`，文件双写+脱敏 |
| ipc-handlers | `require('../services/logger')` 或 `deps.log` | 统一 `log.warn('[ipc:模块名]', msg)` |
| api-publish-engine | `require('./logger')` | `logger.error(tag, msg, meta)` meta 为 JSON 对象 |
| rewrite-engine | `require('./logger-fallback')` 或 `options.logger` 注入 | 同上 |
| collection-engine | AuditLogger（JSONL）+ console | 审计事件走 `audit.log/request/blocked` |
| python-backend | `logging.getLogger(__name__)` | `logger.error("fmt %s", args)` 惰性格式化 |

## 4. 脱敏与截断

- cookie 值、apiKey、Authorization 永不直接拼接进日志。
- URL 走 `redactUrlString`（token/secret/password/code → [REDACTED]）。
- 长文本截断：url 200 / selector 160 / message 300 / stderr 800-2000。

## 5. 测试日志合同

修改失败路径时，回归测试应断言日志被调用（参考 `rpa-view-manager.test.js` 的 `__registerMock('./logger', mock)` 模式），防止日志被后续重构无声删除。
