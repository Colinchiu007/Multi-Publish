# 前端编码规范（apps/desktop renderer）

> CCG Spec 回馈：本文件由前端开发任务沉淀而来，写入前请先阅读；新增经验按「模式 + 反例 + 强制点」追加。

## 1. 异步轮询/请求必须带「目标快照守卫」（2026-08-13，s2v-pipeline-background-run）

**模式**：任何「异步请求 + 可变当前目标」的前端代码（3s 轮询、竞态恢复、防抖后写回），发起时必须捕获目标标识快照，await 返回后校验当前标识 === 快照才写回状态或触发副作用。

**反例（真实 Bug 根因）**：`updateOrchestrationStatus` 轮询 `pipelineGetRunContext(runId)`，无守卫时——用户点击【后台运行】/取消/切换流水线清空 `orchestrationRunId` 后，在飞的响应仍无条件写回 context/stages，甚至触发 `applyOrchestrationOutcome` 跳转结果页 → 僵尸重挂 / 污染新 run。

**强制点**：
```js
async updateOrchestrationStatus() {
  if (!this.orchestrationRunId) return
  const runId = this.orchestrationRunId        // 目标快照
  try {
    const res = await pipelineGetRunContext(runId)
    if (this.orchestrationRunId !== runId) return   // 快照守卫
    // ... 写回
  } catch (e) {
    if (this.orchestrationRunId !== runId) return   // catch 同样守卫
    // ... 错误处理
  }
}
```

## 2. 「可逆脱离」类操作：模板 v-if 之外必须方法内重校验状态（2026-08-13）

**模式**：把当前任务转入后台/脱离详情页等「可逆操作」，仅靠模板条件渲染按钮不足——状态可能以其他形态呈现（检查点等待态以 running 呈现）。方法入口必须重校验业务守卫。

**反例**：点击【后台运行】仅依赖 `v-if="orchestrationRunId && status==='running'"`，若 `scene_asset_selection` 检查点等待态以 running 呈现，会把需人工输入的 run 转后台卡死。

**强制点**：方法入口同步重校验 `if (!this.orchestrationRunId || this.sceneAssetSelectionActive || this.needsCheckpoint) return`，且重置逻辑抽取为公共方法（与取消路径共用），保证「脱离」与「取消」的状态重置语义一致。

## 3. 用户可见文案铁律（i18n-content-sync）

- 新增用户可见文案一律写入 `apps/desktop/src/locales/zh.js` 与 `en.js` **成对**（CI Gate 7 拦截）；渲染端（.vue script/template）禁止新增中文字符串字面量（CJK 基线扫描按 `file:line` 匹配，新增行会触发误报 → 用 `node .github/scripts/check-locale-sync.js --cjk --update-baseline` 权威重排，但必须先确认「无真新增」）。
- 产品名词翻译集中维护于 `01-docs/i18n-glossary.md`，新增术语先登记再使用。
