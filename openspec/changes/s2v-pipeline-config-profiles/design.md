# Design: 视频创作流水线「保存配置」组合配置功能

## 1. 选项与数据模型

### 1.1 快照（snapshot）schema（v1）
```
{
  "schemaVersion": 1,
  "capturedAt": "<ISO8601>",
  "kind": "orchestrated" | "legacy",
  "s2vConfig": { ...白名单字段，与 CreateView.vue data().s2vConfig 键一致... },
  "s2vOutputConfig": { resolution, fps, format },
  "legacy": { inputMode?, selectedStyle?, llmConfig?, budgetConfig?, checkpointPolicy?, storyboardMode?, outputConfig? },
  "ui": { "expandedGroups": ["basic", ...] }
}
```

- 编排流水线（isOrchestratedPipeline=true：story2video-compose、video-clone、film-engineering 等使用 s2vConfig 的流水线）：捕获 s2vConfig（深拷贝）、s2vOutputConfig、s2vOpenSections 展开组。
- 非编排流水线：捕获 legacy 段（inputMode 不包含素材文件本身；selectedStyle、llmConfig、budgetConfig、checkpointPolicy、storyboardMode、outputConfig）。
- 不捕获：pipelineImages/pipelineAudio/pipelineVideo（素材）、quickMode/quickText/quickImages（快速视图）、runId/进度、coverUrl 等运行时/文件引用字段、credentials。

### 1.2 配置文件服务（Story2VideoConfigProfiles）
- 位置：apps/desktop/electron/services/story2video-config-profiles.js（仿 story2video-bgm-library.js：userData/story2video-config-profiles/config-profiles.json 原子写 + Windows 占用重试）。
- 记录：{ id, name, pipelineId, snapshot, createdAt, updatedAt }；id=randomUUID（isSafeProfileId /^[A-Za-z0-9-]{8,64}$/）。
- 名称：trim 后 1..60 字符（normalizeDisplayName 复用语义）。
- 容量：单流水线 ≤ 50 个配置，超出 create 返回显式错误；单快照序列化 ≤ 64KB；pipelineId ≤ 64 字符。
- 结构版本 PROFILES_INDEX_VERSION=1；不可解析 JSON 的 list 以空库降级，下一次合法 create 可重建；可解析但包含非法条目的索引只返回合法项，create/rename/delete 全部 fail-closed 且保留原始字节。

## 2. IPC 契约

| channel | 入参 | 返回 |
|---|---|---|
| story2video:config-profile-list | 无（返回全部；renderer 按当前 pipeline 过滤） | { code, data: Profile[] } |
| story2video:config-profile-create | { pipelineId, name, snapshot } | { code, data: Profile } |
| story2video:config-profile-rename | { id, name } | { code, data: Profile } |
| story2video:config-profile-delete | { id } | { code, data: { deleted: true, id } } |

- 错误码：参数非法 → EC.VALIDATION_ERROR；文件 IO/占用 → EC.REQUEST_ERROR；服务内部异常 → 同 message 透出（用户可读中文）。
- 安全：withSenderCheck + access-control.js PUBLIC_METHODS 白名单（本地设备数据，未登录可用，同 bgm-library）。
- 命名空间统一 story2video:config-profile-*（与既有 story2video:* 对齐）。

## 3. 应用（apply）语义

- 复用/重构 CreateView.restoreS2VLastOptions 中 _applyS2VSnapshot 与 normalizeS2VRestoredEnums/normalizeS2VWatermarkOptions/normalizeResolution：先类型感知合并（null/undefined 跳过、object/array 深拷贝、标量同类型才回填），再做枚举与数值白名单归一化。
- provider 保护：voiceProvider/imageProvider/videoProvider 不在当前可用 provider 集合时删除该三元组（voice/model/id），imageProvider 回退首个可用 provider；voiceProvider===''（显式 Edge TTS）保留。
- 应用后：s2vVoiceProviderExplicitEdge 同步更新、applyS2VTargetChars 按主控字数自愈、loadS2VVoiceData 重载、UI 折叠组按 ui.expandedGroups 白名单展开、toast 提示「已应用配置」。
- 应用目标 = 当前表单（含当前流水线内所有选项）。仅 pipelineId 与当前流水线匹配的配置可应用；跨流水线配置不可应用（双模型审查收敛），列表内应用按钮禁用并在触发时 toast 提示「该配置属于其他流水线，无法在当前流水线应用」，不应用任何字段。

## 4. UI 与交互（CreateView.vue）

- 入口（两类流水线通用）：启动按钮区「保存配置」（data-testid=s2v-config-profile-save）与「我的配置」（data-testid=s2v-config-profile-manage），仅当 selectedPipeline 存在且表单可提交选项时可用。
- 保存弹窗（UiModal sm）：名称输入（maxlength=60，trim 非空）、「保存」/「取消」；重名时提示覆盖确认（覆盖同 pipelineId+name 的旧配置并更新 updatedAt）。
- 我的配置弹窗（UiModal md）：列表按流水线分组或平铺显示（名称 + 流水线名 + 更新时间），每行操作：应用 / 重命名 / 删除（与 bgm-library 列表交互一致，edit/check/close/delete 图标按钮）。
- 应用二次确认（仅当表单已有未保存改动时提示「应用将覆盖当前选项，是否继续？」；无改动直接应用）。
- 删除二次确认（danger modal，确认文案含配置名）。
- toast 提示：保存成功 / 应用成功 / 重命名成功 / 删除成功 / 失败原因（服务端 message 透出）。

## 5. i18n 文案键（zh.js/en.js 成对）

create.story2video.configProfile.*：saveButton（保存配置）、manageButton（我的配置）、dialogTitle（保存配置）、namePlaceholder（配置名称，如：口播竖屏 1080p）、save（保存）、cancel（取消）、applied（已应用配置…）、renameTitle/dialogTitle、deleteTitle、deleteConfirm、empty（暂无保存的配置）、duplicateName（已存在同名配置，是否覆盖？）、nameRequired（请输入配置名称）、overwrite（覆盖）、listTitle 等。

## 6. 测试策略

- apps/desktop/electron/services/story2video-config-profiles.test.js：名称/快照/容量校验、CRUD、原子写损坏恢复、重名覆盖、pipelineId 过滤。
- apps/desktop/electron/ipc-handlers/story2video.test.js：4 通道参数校验与错误码（沿用 registerHandlers(ipcMain, deps) + deps.story2videoConfigProfiles 注入）。
- apps/desktop/src/views/CreateView.test.js：保存弹窗打开/命名校验/保存调用/覆盖；列表加载/应用（含 provider 失效回退断言）/重命名/删除确认；非编排流水线保存应用；非法输入不崩溃。
- apps/desktop/src/api/publisher.test.js（如现有模式）：invokeWithFallback 包装与 electronAPI 缺失 fallback。

## 7. 风险与边界

- 与「上次选项」共存：lastOptions 自动恢复逻辑不变；配置应用不写入 lastOptions（下次打开仍恢复 lastOptions，两者互不覆盖）。
- 旧版本无存量数据/损坏 JSON：list fail-closed 返回错误但页面显示空列表 + 可重试，不崩溃。
- 并发会话：配置文件仅本进程读写，原子写防半写；与其他 worktree 无共享文件。
- 不扩大提交契约：s2vConfig 字段无新增，引擎侧无改动。
