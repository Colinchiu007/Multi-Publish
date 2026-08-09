分析完成。以下是基于 worktree `C:\tmp\Multi-Publish-story2video-compose-subprogress`（HEAD 6c9c42c）的完整代码走读后的结构化分析。

---

# 分析：图片轮播流水线 compose 阶段子百分比进度条

## 结论摘要

**方案整体成立、低风险，与现有 `optimize_progress` / `assets_progress` 模式一致，无破坏性变更**（`compose()` 仅新增可选回调；ServiceBus 无需改签名；测试大量 mock `_createSegment` 不受影响）。**无致命（Critical）结构性缺陷**，但有 1 项必须实现前钉死的规范（失败路径 percent 语义），以及若干应处理的 Warning（concat 权重偏低、i18n 插值陷阱、契约/文档同步面）。

**对「是否引入 ffmpeg `-progress pipe:1` 实时进度」的明确建议：v1 不要做，保留 onProgress 契约，后续单独 PR 再换内部实现。** 理由见 §二。

---

## 一、方案总体评价（分级）

### 🔴 Critical（阻塞级，实现前必须明确并写进 spec/测试）

**C1. 失败/取消路径的 percent 语义必须显式钉死：`done/100` 只在成功 return 前发射；所有失败路径 percent 冻结在最后有效值，且绝不等于 100。**
- 现方案只写了"单调不降、done 100"，未写明失败语义。若实现者在 `finally` 或收尾统一 emit，片段失败（`story2video-compose-engine.js:577-581`）、拼接失败（:602-606）、旁白失败（:612-615）、BGM 失败（:624-627）、webm 失败（:635-638）、校验失败（:649-653）、持久化失败（:700）等 7 条提前 `return {code:-1}` 路径就会显示"100%"——对用户是**假成功信号**，且与 `optimize`/`generate_assets` 失败时前端隐藏进度的行为矛盾。
- 处置：在 spec 写明「`done` emit 仅位于成功 return 之前；失败路径不发射任何新值」；测试补 3 条失败路径（片段失败 / 拼接失败 / 校验失败）断言 `percent` 分别冻结在 `≤75 / 80 / 98` 且无 `done`。

**C2. 执行器侧 fail-closed 写入必须是"字段级校验"而不是"只查 percent 有限"。**
- `context.compose_progress` 会被 `getRunSnapshot` 通过 IPC 全量下发（`pipeline.js:140-152`），任何非法值都直接暴露给 renderer。现方案只提"非有限 percent 不写"，建议落实为完整守卫（见 §三），尤其是 `segmentsTotal>0`（前端要拿它做 `i/N`，除零/显示 `0/0` 都要防）与 `segmentsDone ∈ [0, segmentsTotal]`。

### 🟡 Warning（应处理）

**W1. concat 阶段权重 5（75→80）偏低，长视频会在 75% 长时间停滞。**
- 当 `segments.length > MAX_XFADE_INPUTS(8)` 时走 `_concatSegmentsChunked`（`story2video-compose-engine.js:1081-1108`），25+ 场景 = 多次 xfade 重编码 + 递归合并，耗时可与逐片段渲染同量级。给 concat 只留 5 个点，`N>8` 时用户会看到进度条卡在 75% 数分钟。
- 处置（二选一，建议都做）：
  1. 权重调整：concat 带宽到 **75→87（12 点）**，其余相位顺延（见 §四 I1 的权重表）；
  2. 给 `_concatSegments` / `_concatSegmentsChunked` 加一个可选 `onStep` 回调（私有方法，改动小），chunked 时按"已完成 merge 步骤"在 75→87 内插值发射。

**W2. i18n 键插值陷阱：`{percent}` 插值不能进 locale 文件的静态字符串。**
- 现状：`story2video.optimizeProgress` 等进度文案**都不在 locale 文件里**，全部走 `translateWithLocaleFallback(key, zhFallback, enFallback)` 内联 fallback（`CreateView.vue:1315-1319`），而 `toMessageFunctions` 把每个字符串包成 `() => source`（`i18n/index.js:10-26`）——若往 `locales/zh.js` 写 `'视频合成 {percent}%'`，渲染出来是字面量 `{percent}`，不插值；要插值必须用 `(ctx) => ctx.named('percent')` 函数形式，且 CSP 测试（`i18n.test.js:37-70`）会拦截运行时编译。
- 处置：**v1 沿用 `translateWithLocaleFallback` 内联 fallback 模式**（与 optimize/assets 完全一致，零双源文案风险）；如仓库强制所有用户可见文案进 locale 文件，再按 message-function 形式补键。切勿"又加键又内联"，会双源漂移。

**W3. 遗漏的同步面（proposal 的 Impact 已列代码文件，但测试/文档需补具体用例）。**
- `stage-executor.test.js`：新增用例——mock `composeVideo` 在内部调用 `options.onProgress({...})`，断言 `context.compose_progress` 被写入、且 `onProgress` 已挂在 `composeOptions`（现有 `expect.objectContaining` 允许额外键，兼容）。
- `pipeline-story2video-contract.test.js:16-40`：`createEngine()` 的 `serviceBus.composeVideo` 是纯 mock，可让它触发 `options.onProgress`，顺带证明 `engine.getRunContext(runId)` 能暴露 `compose_progress`。
- `story2video-ue-contract.test.js`：断言新 `data-testid` 存在（该文件是 CreateView.vue 源码快照契约，新增即绿）。
- 文档：`01-docs/PRD.md`、`01-docs/PRD-video-creation.md`（7.x 数据校验/流程/交互/显示项/提示文字）、`CHANGELOG.md`（proposal 已列，需落具体条目）。

**W4. ffmpeg `-progress pipe:1` 实时进度：v1 明确不建议。**
- 完整权衡见 §二。核心：现引擎 8 处 `execFileAsync`（stdout 只在进程退出时可得），要实时就必须整批改 spawn 包装 + Windows `taskkill /T /F` 兜底 + stderr 语义保持（当前 `_createSegment` 依赖 `stderr` 尾部判断，:988-991）+ 真实 ffmpeg 路径在 CI 覆盖薄（测试全 mock `_createSegment`）——QM 严格下属高风险中收益。

### 🟢 Info（建议/可选）

**I1. 阶段权重表建议（单调、无长停滞、合计 100、可选步骤按序跳变）：**

| phase | 现值 | 建议值 | 说明 |
|---|---|---|---|
| preflight | 0 | 0 | 含校验 + 逐场景 ffprobe（快） |
| validated | 4 | 3 | 预检通过 |
| segments | 5+70·i/N → 75 | 3+72·i/N → **75** | 每段 ffmpeg，主导（i=N 时精确 75） |
| concat | 80 | **75→87** | N>8 chunked 重编码，给足带宽（对应 W1） |
| narration | 87 | **89** | 单条 concat=n=N，快 |
| bgm（可选） | 91 | 92 | `-c:v copy`，快 |
| webm（可选） | 95 | 95 | vp9 重编码，慢；仅 format=webm |
| verify | 98 | 98 | 全片解码，可达 60s |
| done | 100 | 100 | 仅成功 |

- 关键性质：`i==N` 时 3+72=75 **精确**（避免 74→80 跳变）；可选相位跳过时按序跳（如无 bgm/webm：89→98→100）。

**I2. `message` 字段建议从跨进程契约移除（或标记 non-UI）。**
- 引擎不应产出用户可读中文字面量（引擎无 locale）。前端一律由 `phase + counts` 本地化；`message` 若保留，仅作测试/日志 hint，前端**不得直接渲染**，否则未来有人直接把引擎中文塞进 UI。

**I3. 前端平滑：无需 throttle，复用现有进度条即可。**
- `.progress-fill` 已有 `transition: width 0.3s`（`CreateView.vue:3056`），加一个 `progress-bar-mini` 高度变体即可。3s 轮询下 percent 按"片段粒度"阶跃（每次 +2.8%~+7%），视觉已被 0.3s 过渡动画平滑，文本与条同步跳变，无子秒抖动。

**I4. 前置写入：引擎在 `scenes` 校验通过后、ffprobe 循环前立即 `emit('preflight', 0)`（携带 `segmentsTotal=scenes.length`）。**
- 保证 stage 进入 running 后**首个轮询即见进度条**，与 `optimize`/`assets` 的"进度前置写入"体验对齐（`story2video-stages.js:394-400` 同款思路）。

**I5. 暂停/恢复语义：现架构天然正确，无需重置。**
- story2video 固定 `checkpointPolicy:'none'`（`CreateView.vue` 启动参数），compose 不因检查点暂停；用户手动 pause 只置 `run.status`，当前 ffmpeg 子进程继续跑到结束（引擎无取消钩子），`compose_progress` 继续更新，恢复后 compose 已 completed。`run.context` 是每 run 独立对象，无跨 run 串扰。**若未来引入"同一 context 重跑 compose"的能力，才需要在阶段开头重置 `compose_progress` 并仿 optimize 的 `partialResume` 前置写。**

---

## 二、关于「ffmpeg `-progress pipe:1` 实时进度」的权衡

### 现状事实
- 引擎全部 8 处 ffmpeg 调用用 `execFileAsync`（promisify `execFile`），stdout 只在退出时一次性返回，**无任何增量通道**。
- `-progress pipe:1` 把 `key=value` 块写 stdout；`execFileAsync` 下拿到它只能在进程结束之后——所以**不改造 spawn 就完全没有实时收益**。
- 测试全部 mock `_createSegment`（`story2video-compose-engine.test.js:287` 等），真实 spawn 路径在 CI 基本零覆盖。

### 若要做，需要什么
1. 新增 `_runFfmpegWithProgress(args, {timeout, onProgress})` spawn 包装（`spawn` + `windowsHide:true` + `stdio:['ignore','pipe','pipe']`）。
2. 解析 stdout `out_time_us` / `frame`，配合"期望时长"算百分比；期望时长来源基本可靠：follow-audio 用 `probedAudioDurations[i]`，min-duration 用 `padTo`，concat 用段长之和，webm 用输入时长——所以技术上可行。
3. 超时 kill：Windows 必须 `spawn('taskkill', ['/PID', pid, '/F', '/T'])`（render-engine.js:215 已有先例），否则孤儿 ffmpeg 挂死。
4. 保持现有错误语义：`hasUsableFile` + stderr 尾部截断判断（`:988-991`）、各 `timeout`、`maxBuffer` 上限。
5. 用 `progress=end` 块判定结束，避免尾帧漂移。

### 风险 vs 收益
| 维度 | 判断 |
|---|---|
| 回归面 | 8 处调用点全换，Windows 进程生命周期、错误传播、stdout/stderr 缓冲语义都要重验 → 高 |
| 测试覆盖 | 真实 ffmpeg 路径 CI 薄 → 回归难发现 |
| QM 门禁 | 严格 → 大改动 + 弱覆盖 = 高风险 |
| 收益 | 仅"段内百分比更平滑"（从段粒度 → ~0.5s 粒度），对用户实际感知提升有限 |
| 替代性 | onProgress 契约不变，**将来随时可换内部实现而不动执行器/前端** |

### 建议
**v1 采用权重里程碑方案（即拟定方案），把 `-progress` 作为记录在案的后续演进（可选 PR）**：仅先改 `_createSegment` 试点（占时最大），配独立 `_runFfmpegWithProgress` 辅助函数与真实 ffmpeg 集成测试。这样 `compose_progress` 数据契约成为稳定接口，实现层可平滑升级。

---

## 三、推荐实现细节

### 引擎 `story2video-compose-engine.js`

```js
async compose (assetManifest, options, onProgressParam) {
  if (!FFMPEG) return { code: -1, message: 'ffmpeg not found' }
  let scenes = normalizeComposeScenes(assetManifest)
  if (scenes.length === 0) return { code: -1, message: '...' }

  // 回调解析：第三参优先，兼容 options.onProgress
  const cb = typeof onProgressParam === 'function' ? onProgressParam
    : (typeof options?.onProgress === 'function' ? options.onProgress : null)
  let segmentsTotal = scenes.length
  let segmentsDone = 0
  let lastPercent = 0
  const emit = (phase, percent) => {
    if (!cb) return
    const p = Math.min(100, Math.max(0, Math.round(Number(percent))))
    if (!Number.isFinite(p)) return          // fail-closed
    if (p < lastPercent) return              // 单调不降兜底
    lastPercent = p
    cb({ phase, percent: p, segmentsDone, segmentsTotal })
  }
  emit('preflight', 0)
  // ... 现有校验（resolution / input bytes）...
  // ffprobe 循环后、mkdir/sessionDir 后：
  emit('validated', 3)

  // 片段循环：每成功一段后
  //   segmentsDone = i + 1
  //   emit('segments', 3 + 72 * segmentsDone / scenes.length)
  // 失败 catch 内：不 emit（保持冻结）
  // 拼接前：
  emit('concat', 87)                          // 或 75→87 区间按 W1 细化
  // 旁白前：emit('narration', 89)
  // BGM 前：emit('bgm', 92)（可选）
  // webm 前：emit('webm', 95)（可选）
  // 校验前：emit('verify', 98)
  // 成功 return 前最后一行：
  emit('done', 100)
  return { code: 0, data: {...} }
}
```

要点：
- `done` 只出现在成功 return 前；7 条失败 `return` 前**均不 emit**。
- 不改 `_createSegment` / `_concatSegments` 内部（除 W1 可选 `onStep`），避免 8 处 execFile 回归。

### 执行器 `stage-executor.js`（COMPOSE，:346-374）

```js
const composeOptions = { ...(stage.options || {}) }
for (const key of composeOptionKeys) { if (params[key] !== undefined) composeOptions[key] = params[key] }
composeOptions.onProgress = (progress) => {
  if (!context || typeof context !== 'object') return
  const percent = progress && progress.percent
  if (!Number.isFinite(percent) || percent < 0 || percent > 100) return       // fail-closed
  const done = Number.isInteger(progress.segmentsDone) ? progress.segmentsDone : 0
  const total = Number.isInteger(progress.segmentsTotal) ? progress.segmentsTotal : 0
  if (total > 0 && (done < 0 || done > total)) return
  context.compose_progress = {
    phase: typeof progress.phase === 'string' ? progress.phase : 'segments',
    percent: Math.round(percent),
    segmentsDone: done,
    segmentsTotal: total,
  }
}
const result = await self.serviceBus.composeVideo(assets, composeOptions)
```

要点：写入边界放执行器（保护 IPC context），引擎只负责"不发射非法值"。

### 前端 `CreateView.vue`

- `stageDetailText`（:2808）新增分支（在 `optimize`/`generate_assets` 之后）：
```js
if (stage.name === 'compose') {
  const p = ctx.compose_progress
  if (p && Number.isFinite(p.percent)) {
    if (p.phase === 'segments' && Number.isInteger(p.segmentsTotal) && p.segmentsTotal > 0) {
      return this.translateWithLocaleFallback('story2video.composeSegments',
        '正在合成片段 ' + p.segmentsDone + '/' + p.segmentsTotal + ' · ' + p.percent + '%',
        'Composing segment ' + p.segmentsDone + '/' + p.segmentsTotal + ' · ' + p.percent + '%')
    }
    return this.translateWithLocaleFallback('story2video.composeProgress',
      '视频合成 ' + p.percent + '%', 'Composing ' + p.percent + '%')
  }
}
```
- 模板（:67-76 的 `.stage-main` 内）加 mini bar，仅 running 渲染：
```html
<div v-if="stage.name === 'compose' && stage.status === 'running' && composeSubProgressPercent(stage) !== null"
     class="stage-sub-progress" :data-testid="`story2video-stage-compose-progress`">
  <div class="progress-bar progress-bar-mini"><div class="progress-fill" :style="{ width: composeSubProgressPercent(stage) + '%' }"></div></div>
</div>
```
- 新增 helper `composeSubProgressPercent(stage)`：`const p = this.orchestrationContext?.compose_progress; return (p && Number.isFinite(p.percent) && p.percent >= 0 && p.percent <= 100) ? p.percent : null`。
- CSS：`.progress-bar-mini { height: 4px; width: 100%; margin-top: 4px; }`，复用已有 `.progress-fill` 的 0.3s 过渡。

---

## 四、compose_progress 数据契约建议

| 字段 | 类型 | 取值范围/约束 | 语义 | 前端守卫 |
|---|---|---|---|---|
| `phase` | string | `preflight` \| `validated` \| `segments` \| `concat` \| `narration` \| `bgm` \| `webm` \| `verify` \| `done` | 当前子阶段 | 未知 phase → 通用"视频合成 X%" |
| `percent` | number | 整数，单调不降，0–100 | 阶段总进度 | `Number.isFinite && 0≤p≤100`，否则隐藏条 |
| `segmentsDone` | number | 0–segmentsTotal | 已完成片段数 | 仅 `phase==='segments'` 时展示 |
| `segmentsTotal` | number | ≥1 | 总片段数 | `Number.isInteger && >0`，否则不显示 `i/N` |
| `message` | string | 可选 | **non-UI**（测试/日志 hint） | 前端不得直接渲染 |

**契约不变式**：
1. `percent` 严格由引擎保证单调；执行器侧 `Math.round` 后仍校验 `[0,100]`。
2. `percent===100` ⟺ 合成成功（与 `code===0` 一一对应）；失败路径 lastPercent<100。
3. `segmentsTotal` 恒等于 `scenes.length`（≥1，因为 `scenes.length===0` 已前置拒绝）。
4. 结构为纯原始值对象，IPC structuredClone 安全；不得含函数/Buffer/undefined 字段。
5. 契约与 `optimize_progress`/`assets_progress` 并存互不影响；成功后 `context.compose`（结果）与 `context.compose_progress` 同时存在，`extractOrchestrationVideoPath` 读 `context.compose`，无键冲突。

---

## 五、边界场景清单

1. **片段 i 失败提前 return**：percent 冻结在 `3+72·(i-1)/N`（≤75），不置 100；阶段 `failed`，前端 `stageDetailText` 返回 `''`（条与文案消失）——符合 optimize/assets 现有失败行为。
2. **拼接/旁白/BGM/webm/校验/持久化失败**：分别冻结在 `87 / 89 / 92 / 95 / 98`，同样不置 100。
3. **引擎不可用 / scenes 为空 / resolution 非法 / 输入超限**：在首个 `emit` 之前返回 → `compose_progress` 保持 undefined → 前端不渲染，阶段失败，一致。
4. **N=1**：单步 3→75→快速 100，无中间停滞，可接受。
5. **可选步骤跳过（无 bgm / 非 webm）**：按序跳变 89→98→100，单调性保持。
6. **暂停/恢复**：`checkpointPolicy:'none'` 下 compose 不暂停；手动 pause 不中断当前 ffmpeg；无需重置（详见 I5）。
7. **并发多 run**：context 按 run 隔离，执行器闭包引用当前 run 的 context，无串扰。
8. **结果页 `renderSegment` 单段重试**：独立引擎调用、无 context，不写 `compose_progress`，确认无副作用。
9. **历史记录 / 旧 run**：无 `compose_progress` 字段 → 前端守卫返回空，安全降级。
10. **percent 取整**：`i===N` 时精确 75（3+72），避免 74→80 跳变；发射端再加"单调兜底"防未来回归。
11. **段内 30s 超时（既有约束）**：段超时 `ETIMEDOUT` → 冻结在当段；与失败语义一致，非本变更引入，但建议在 PRD 注明"段进度以段为单位，非实时"。
12. **`done` emit 放置**：仅在成功 return 前；7 条失败路径不得 emit（C1 的测试断言）。
13. **IPC 载荷**：`compose_progress` 极小（≤4 字段），3s 轮询无压力；但字段级校验（C2）是最后防线，防未来引擎侧回归把非法值下发到 renderer。

---

### 一句话给实现者
按拟定方案推进即可：**引擎加 `emit` helper（单调/失败冻结/`done` 仅成功），执行器做字段级 fail-closed 写入，前端复用现有进度条 + 内联 fallback 文案，权重组按 §四 I1 微调，v1 不做 spawn 实时进度，并把 `-progress` 演进方案记入 PRD 作为后续项。**

---
SESSION_ID: 43dc7bbf-dc8b-4407-82f5-01357c9ad275
