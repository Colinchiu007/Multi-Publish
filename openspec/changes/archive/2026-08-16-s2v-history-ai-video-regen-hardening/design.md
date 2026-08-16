# Design — 历史记录重生成增强（W4 队列全覆盖 + W5 瞬时重试）

## 架构决策
- **单一队列入口**：所有历史记录写通道统一 `_serializeProject(projectId, task)`——服务层既有同项目写队列（promise 链串行），IPC 层只做参数校验与队列调度；不为通道自建队列，避免两套并发控制。
- **重试单一来源**：`withAssetTransientRetry` 从 `story2video-stages.js` 导出（流水线 generate_assets 同函数），service 构造器缺省引用，杜绝两处重试参数漂移；测试可注入自定义 `assetRetry` 观察包装行为。
- **fail closed 不变**：重试仅包在 stage 调用外，`generateSceneAiVideo` 的产物落盘/旧视频保留/失败回写语义与 PR #870 完全一致。

## 服务层（story2video-project-service.js）
1. 构造器新增 `this.assetRetry = options.assetRetry || withAssetTransientRetry`（require 新增 `withAssetTransientRetry`）。
2. `generateSceneAiVideo`：`const outcome = await this.assetRetry(() => this.generateSceneVideoStage({...}))`；守卫 `!outcome || !outcome.success || !outcome.path → throw (outcome.error || outcome.message || 'AI 视频生成失败')`（M2：抛错路径耗尽返回 `{code:-1,message}`，message 即最后一次瞬时错误，真实文案不退化）。

## IPC（story2video.js）
6 个通道（含 `delete-project`，审查 M3）统一模式：
```js
try {
  return { code: 0, data: await requireProjectService()._serializeProject(projectId, () => requireProjectService().method(...args)) }
} catch (error) { return { code: EC.REQUEST_ERROR, message: error.message } }
```
`select-scene-material` 由 `return { code: 0, data: service.selectSceneMaterial(...) }` 改为 `await` 入队（handler 本就 async，返回语义不变）。

## stages 导出
`module.exports` 增加 `withAssetTransientRetry`（位于 `generateSceneVideo` 附近，保持字母序）。`withAssetTransientRetry` 增加可选 `excludeMessages` 参数：命中排除文案的「瞬时错误」不重试（M1）；默认空数组，流水线行为不变。

## 测试
- `ipc-handlers/story2video.test.js`：主 mock 增加 `selectSceneMaterial/generateSceneImage/generateSceneVideo`；队列计数 6→12（含 delete-project）；新增 3 通道调用断言；「替换旁白」两个用例 mock 补 `_serializeProject`。
- `services/story2video-project-service.test.js`：新增 4 用例（注入 assetRetry 抛错重试成功 / 默认 withAssetTransientRetry 结果对象重试成功 / 真实重试耗尽 fail-closed 保留 `request timed out` 文案（M2/m5）/ 非瞬时结果对象只调用 1 次（m5）），断言 stage 调用次数、重试原因、产物替换、状态 completed。
