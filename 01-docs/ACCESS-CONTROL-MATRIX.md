# ACCESS-CONTROL-MATRIX — 桌面端访问控制与会员权益矩阵

> 版本：2026-08-11　适用范围：`apps/desktop`（Electron 桌面端）
> 配套：PRD §7.4「权限与访问控制」；实现：`electron/ipc-handlers/license-access-control.js`、`electron/preload/access-control.js`

---

## 1. 分层架构

桌面端权限分**三层**，层层叠加，主进程为最终安全边界：

```
┌─────────────────────────────────────────────────────────────┐
│ 渲染层（Vue）—— 调用 window.electronAPI.xxx()                │
│   ├─ preload 暴露层：createDynamicAccessApi 按 access level   │
│   │   过滤/包装方法（public 直接暴露；authenticated 调用时     │
│   │   实时校验；admin 仅 dev 环境暴露）                        │
│   ▼                                                          │
│ 主进程通道层：createAccessControlledIpcMain Proxy             │
│   ├─ ① isTrustedSender —— senderFrame 来源白名单              │
│   ├─ ② requiredLevelForChannel —— public / authenticated      │
│   ├─ ③ requiredFeatureForChannel —— 严格权益（服务端权威）      │
│   └─ ④ handler —— withSenderCheck / 参数校验 / 业务逻辑        │
└─────────────────────────────────────────────────────────────┘
```

- **access level 判定（getAccessLevel）**：
  - Logto identity 已启用 → 以登录状态为准（`authenticated` / `offline_authenticated` / `signed_out`…）；
  - identity 未启用（兼容模式）→ `app.isPackaged === false` 为 `admin`（开发）；否则 `licenseManager.isPro()` 为 `authenticated`；其余 `public`。
- **打包权限唯一权威**：`app.isPackaged`。`ELECTRON_IS_DEV` / `NODE_ENV` 不得在打包应用提权（QM-5 合同）。

## 2. 访问级别定义

| 级别 | 含义 | 触发条件 |
|------|------|----------|
| `public` | 未登录可用 | 通道在 `PUBLIC_CHANNELS` / 方法在 `PUBLIC_METHODS` |
| `authenticated` | **需登录**（默认） | 不在 public / admin 列表的所有通道 |
| `admin` | 仅开发/敏感 | `ADMIN_ONLY_CHANNELS`（payment:complete、proxy:test 等） |
| 权益（feature） | 严格会员判定 | 通道在 `CHANNEL_FEATURE_MAP`，`requireEntitlement` 强制服务端下发 |

## 3. 登录要求矩阵（按功能域）

> 标注「需登录」= 未登录调用被拒（`code: -3`）；「public」= 未登录可用。
> 只读/设备本地通道保持 public（离线可用语义）；写/运行/业务数据通道需登录。

### 3.1 模型服务商配置（2026-08-11）

| 通道 | 操作 | 级别 |
|------|------|------|
| `model-provider:list` / `get` / `get-default` / `presets` / `is-configured` / `logs` | 读 | public |
| `model-provider:test` | 测试连接（读+使用） | public |
| `model-provider:create` / `update` / `delete` / `set-default` / `clean-logs` | **写** | **需登录** |

### 3.2 发布历史 / 队列 / 进度

| 通道 | 操作 | 级别 |
|------|------|------|
| `history:list` / `get` / `delete` | 发布历史 | **需登录** |
| `queue:status` / `history` / `cancel` / `retry` | 发布队列 | **需登录** |
| `dashboard:stats` | 数据看板 | **需登录** |

### 3.3 流水线

| 通道 | 操作 | 级别 |
|------|------|------|
| `pipeline:list` / `get` / `history` | 只读（列表/详情/历史） | public（设备本地历史） |
| `pipeline:start` / `pause` / `resume` / `cancel` / `status` / `advance` / `fetch` | **写/运行控制** | **需登录** |

### 3.4 视频处理 / 渲染

| 通道 | 操作 | 级别 |
|------|------|------|
| `render:status` / `render:install-deps` | 只读/依赖安装 | public |
| `video:*`（status/process/analyze/mix-audio/search-stock/generate-subtitle 等） | 视频处理 | **需登录** |
| `render:start` / `cancel` / `validate-props` / `list-compositions` / `get-composition` | 渲染 | **需登录** |

### 3.5 Story2Video 写操作

| 通道 | 级别 |
|------|------|
| `story2video:list-projects` / `get-project` / `import-media` | public（设备本地只读/媒体导入） |
| `story2video:delete-project` / `update-segments` / `replace-segment-audio` / `retry-segment` / `recompose-project` / `transcribe` / `capabilities` / `export-zip` / `create-share-url` / `copy-path` / `show-in-folder` / `save-as` | **需登录** |

### 3.6 其它需登录（既有）

账号管理（`accounts:*` / `store:*` 账号/历史/定时/回调）、定时任务（`scheduler:*`）、内容模板（`template:*`）、数据分析（`analytics:*`）、AI 写作（`ai:*`）、代理池（`proxy:*` 写）、关键词监控（`keyword:*`）、TTS 语音（`tts-voice:*`）、上传（`upload:*`）、提示词评估（`prompt-eval:*`）等均为 authenticated。

### 3.7 保持 public（基础设施/身份入口）

系统信息/更新/引导/热键/日志/敏感词、身份与购买入口（`identity:*`、`auth:*`、`oauth:*`、`license:*`、`payment:*` 创建/查询）、平台目录（`platform:*`）、离线状态、webview 布局、`cloud-publisher` 之外的本机只读历史。

## 4. 会员权益（feature）映射

### 4.1 严格权益（服务端权威，缺失即拒）

| 通道 | feature | onlineOnly |
|------|---------|------------|
| `publish:wechat` / `publish:batch` | `cloud_publish` | 否 |
| `cloud-publisher:submit` / `list-tasks` / `get-task` | `cloud_publish` | 是 |

- 判定：登录 + `requireEntitlement(feature)`，服务端 `/api/v1/me` 下发 `entitlement.features`，feature 不在列表即拒绝（`code: -3`）。
- **身份未启用（兼容模式）**：本地 license 决定 access level（免费 = public → 这些通道被拒）。

### 4.2 基础功能 feature 预留映射（登录即可，2026-08-11）

`LOGIN_ONLY_FEATURE_MAP`（`license-access-control.js`）：这些通道**当前要求登录但不强制服务端 feature**，避免服务端未同步时锁死登录用户。未来如需会员分级：

1. 将目标通道从 `LOGIN_ONLY_FEATURE_MAP` 移入 `CHANNEL_FEATURE_MAP`；
2. 服务端 `/api/v1/me` 为对应 feature 下发权益（未下发用户被拒）；
3. 回归测试同步更新。

| feature | 覆盖通道 |
|---------|----------|
| `publish_history` | `history:*`、`queue:*`、`dashboard:stats` |
| `pipeline_run` | `pipeline:start/pause/resume/cancel/status/advance/fetch` |
| `video_process` | `video:*`、`render:start/cancel/validate-props/list-compositions/get-composition` |
| `story2video_write` | Story2Video 写操作（见 3.5） |
| `model_provider_write` | `model-provider:create/update/delete/set-default/clean-logs` |

## 5. 数据校验与安全

| 项 | 要求 |
|----|------|
| sender 校验 | 所有写操作/敏感通道 `withSenderCheck`：`app://localhost`、`file://`（dist 目录内）、开发模式 localhost:5174-5180；外部来源返回 `未授权的调用来源` 且不执行 |
| 参数校验 | 敏感通道校验参数类型/非空（如 `dev-get-key` 校验 id）；业务通道由 manager 字段白名单校验 |
| Key 存储 | `api_key_enc`（safeStorage 加密）；明文列清空；读接口仅 `api_key_masked`；解密仅主进程内部 |
| 打包提权 | `app.isPackaged` 唯一权威；环境变量不得提权（QM-5） |
| 拒绝响应 | `{ code: -3, errorCode: 'AUTH_REQUIRED'|'ENTITLEMENT_REQUIRED'|'UNTRUSTED_SENDER', message: 自然语言（不含通道名）, messageParams: { channel } }` |

## 6. 交互逻辑与提示文字

| 场景 | 交互 | 提示（`errorCode` / message） |
|------|------|------|
| 未登录查看模型列表/日志/预设 | 正常展示 | — |
| 未登录点击保存/删除/设默认/清理日志 | 操作失败，不写库 | `AUTH_REQUIRED` / `当前许可证无权访问该功能，请先登录并确认账号已开通所需权益后重试。` |
| 未登录启动发布/流水线/视频处理 | 被拒 | `AUTH_REQUIRED`（同上） |
| 已登录但缺服务端权益（未来收紧） | 被拒 | `ENTITLEMENT_REQUIRED` / `当前账号没有所需权益，无法使用该功能。请升级或开通对应权益后重试。` |
| 未登录调用 preload 受限方法 | 抛 `LicensePermissionError`（不触达主进程） | 渲染端 `formatUserError()` 映射自然语言 |
| 外部网页注入调用 | 拒绝且不执行 | `UNTRUSTED_SENDER` / `未授权的调用来源` |
| 登录后（免费/Pro） | 全部基础功能可用 | — |

> message 不含内部通道名（多语言规范，2026-08-11）；通道名仅存于 `messageParams.channel` 供诊断。

## 7. 验收标准

- [ ] 未登录：模型配置写操作（create/update/delete/set-default/clean-logs）全部返回 `code: -3`，不写库；
- [ ] 未登录：模型配置读操作与测试连接正常；
- [ ] 未登录：发布历史/队列/流水线写/视频处理/Story2Video 写操作被拒；只读历史（pipeline:list/get/history、story2video:list/get）可用；
- [ ] 已登录：上述功能全部恢复；
- [ ] `LOGIN_ONLY_FEATURE_MAP` 中所有通道 `requiredLevelForChannel === 'authenticated'` 且不强制服务端 feature；
- [ ] `cloud_publish` 严格权益判定不受影响；
- [ ] 回归：`electron/ipc-handlers` + `electron/preload` 全量测试通过；`test:preload:sandbox` 双模式通过。

## 8. 相关文件

- `apps/desktop/electron/ipc-handlers/license-access-control.js`（通道分类 + feature 映射）
- `apps/desktop/electron/ipc-handlers/license-access-control.test.js`
- `apps/desktop/electron/preload/access-control.js`（方法暴露分类）
- `apps/desktop/electron/preload/access-control.test.js`
- `apps/desktop/electron/preload/index.bundle.js`（构建产物）
- `apps/desktop/electron/services/identity/auth-service.js`（`requireEntitlement`）
- `apps/desktop/electron/services/identity/entitlement-service.js`（`hasFeature` / `normalizeEntitlement`）
