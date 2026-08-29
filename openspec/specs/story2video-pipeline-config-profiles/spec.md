# story2video-pipeline-config-profiles Specification

## Purpose

视频创作模块的所有流水线支持将当前全部选项保存为「有名字的组合配置」（配置库），可一键应用到当前表单，并提供重命名/删除管理。配置为设备级本地持久化（userData JSON），未登录可用；与「上次选项」自动恢复并存，不改变提交契约与引擎契约。

## Requirements

### Requirement: 配置库持久化服务契约

桌面端 SHALL 提供设备级配置库服务 Story2VideoConfigProfiles（持久化于 userData/story2video-config-profiles/config-profiles.json，原子写 + Windows 占用重试），支持 list / create / rename / delete 四类操作。记录结构为 { id, name, pipelineId, snapshot, createdAt, updatedAt }；id 为 randomUUID（安全 id 校验 /^[A-Za-z0-9-]{8,64}$/）；名称 trim 后长度 1..60 个 Unicode code point；pipelineId 长度 ≤ 64 字符；快照序列化 ≤ 64KB；单流水线配置数量 ≤ 50。结构版本 PROFILES_INDEX_VERSION=1；不可解析索引时 list 以空库降级返回且后续合法 create 可重建；可解析但含非法条目时 list 只返回合法项，任何写操作 fail-closed 并保留原始字节；其他写操作失败返回可读错误。

#### Scenario: 创建配置成功写入索引
- **WHEN** 调用 create({ pipelineId: "story2video-compose", name: "口播竖屏 1080p", snapshot: {...} }) 且校验通过
- **THEN** 返回 code 0 与完整记录，索引文件原子更新，无临时文件残留

#### Scenario: 名称/快照/容量校验拒绝
- **WHEN** 名称 trim 后为空或超过 60 字符、pipelineId 非法、快照非对象或序列化超过 64KB、该流水线配置数已达 50
- **THEN** create 返回校验/容量错误，且不写入任何数据

#### Scenario: 同流水线重名覆盖语义
- **WHEN** create 携带 overwrite=true 且存在同 pipelineId + 同名配置
- **THEN** 原记录被覆盖、updatedAt 更新；overwrite=false 时返回重名错误

#### Scenario: 损坏索引降级
- **WHEN** 索引 JSON 文件损坏无法解析
- **THEN** list 返回空列表且不抛错，后续写入仍可用

### Requirement: IPC 通道与权限契约

主进程 SHALL 注册 story2video:config-profile-list/create/rename/delete 四个通道（withSenderCheck 可信来源校验），入参为 { } / { pipelineId, name, snapshot, overwrite } / { id, name } / { id }；参数非法返回校验错误码；通道 SHALL 同时在 preload access-control PUBLIC_METHODS 与主进程 license-access-control PUBLIC_CHANNELS 白名单中（设备级本地数据，未登录/未激活专业许可证可用，与 BGM 素材库同语义）。

#### Scenario: 参数非法不进入服务
- **WHEN** create 缺 name/snapshot、rename/delete 的 id 非法
- **THEN** handler 返回校验错误且不调用服务

#### Scenario: 未登录可用
- **WHEN** 当前许可证等级为 public
- **THEN** 四个通道均可调用（requiredLevelForChannel === 'public'）

#### Scenario: 不可信来源拒绝
- **WHEN** IPC sender 不在受信页面白名单内
- **THEN** 请求被拒绝且不产生任何副作用

### Requirement: 快照捕获语义（编排/非编排两分支）

CreateView SHALL 在保存时构建快照：编排流水线（story2video-compose）捕获 s2vConfig（深拷贝）、s2vOutputConfig、ui.expandedGroups（当前展开的配置分组）；非编排流水线捕获 legacy 段（inputMode 不含素材文件、selectedStyle、llmConfig、budgetConfig、checkpointPolicy、storyboardMode、outputConfig）。快照含 schemaVersion=1 与 capturedAt；不得包含素材文件路径、运行态（runId/进度）、凭证与敏感字段。

#### Scenario: 编排流水线快照
- **WHEN** 在 story2video-compose 流水线点击「保存配置」
- **THEN** snapshot.kind === 'orchestrated'，s2vConfig/s2vOutputConfig/ui.expandedGroups 均存在且为深拷贝

#### Scenario: 非编排流水线快照
- **WHEN** 在非编排流水线（如 animated-explainer）点击「保存配置」
- **THEN** snapshot.kind === 'legacy'，legacy 段包含上述选项字段，不包含素材文件内容

### Requirement: 应用（apply）语义与表单合法性

应用配置 SHALL 通过类型感知合并回填当前表单（null/undefined 跳过、object/array 深拷贝、标量同类型才回填），随后执行枚举/数值归一化（S2V_RESTORE_ENUM_OPTIONS、normalizeResolution、applyS2VTargetChars 字数自愈）以保证表单可提交。已失效服务商回退：voiceProvider 不在当前可用集合时删除 voiceProvider/voiceModel/voiceId 三元组，imageProvider 失效时回退首个可用 provider，videoMode !== 'off' 时 videoProvider 失效同样清空（双模型审查补充）；voiceProvider === ''（显式 Edge TTS）必须保留。应用后 SHALL 重载语音数据、按 ui.expandedGroups 白名单恢复折叠组、toast「已应用配置」。仅当前流水线（pipelineId 匹配）的配置可应用；跨流水线配置按钮禁用并 toast 提示。

#### Scenario: 应用覆盖表单字段
- **WHEN** 用户点击与当前流水线匹配的配置并确认
- **THEN** 表单字段被快照值覆盖，toast「已应用配置」

#### Scenario: 失效服务商回退
- **WHEN** 快照中 voiceProvider 不在当前 provider 集合
- **THEN** 该三元组不被回填（保持应用前值），其余字段正常应用

#### Scenario: 枚举归一化
- **WHEN** 快照含不在当前选项列表的枚举值（如陈旧 imageStyle）
- **THEN** 该字段归一化到默认合法值，下拉框不出现空白选中项

#### Scenario: 跨流水线配置拒绝应用
- **WHEN** 配置的 pipelineId 与当前流水线不同
- **THEN** 应用按钮禁用（disabled），直接触发提示「该配置属于其他流水线」

#### Scenario: 表单已修改时二次确认
- **WHEN** 当前表单相对默认值已有改动且用户点击「应用」
- **THEN** 先弹出「应用将覆盖当前已调整的选项」确认框，确认后才应用

### Requirement: 保存与管理交互

CreateView SHALL 在启动按钮区提供「保存配置」与「我的配置」入口（仅当 selectedPipeline 存在）。保存弹窗含名称输入（maxlength=60，trim 非空校验，空名 toast 提示）、保存/取消；同流水线重名时首次点击提示「再次点击保存将覆盖」，二次点击执行覆盖保存。配置列表弹窗按 updatedAt 倒序平铺显示（名称 + 流水线名 + 更新时间），每行提供应用/重命名/删除操作；重命名为行内编辑（enter 保存、esc 取消），删除需 danger 二次确认。成功后均 toast 提示；失败透出服务端可读 message。

#### Scenario: 空名校验
- **WHEN** 名称输入为空或纯空白并点击保存
- **THEN** 不调用创建 IPC，toast「请输入配置名称」

#### Scenario: 重名覆盖两段式确认
- **WHEN** 已存在同流水线同名配置且首次点击保存
- **THEN** 弹窗进入覆盖态（按钮变「覆盖保存」）并 toast「已存在同名配置，再次点击保存将覆盖它」，不调用创建 IPC；再次点击执行覆盖保存

#### Scenario: 重命名成功
- **WHEN** 行内编辑新名称并确认
- **THEN** rename IPC 被调用，列表原地更新并退出编辑态，toast「配置已重命名」

#### Scenario: 删除二次确认
- **WHEN** 点击删除并确认 danger 弹窗
- **THEN** delete IPC 被调用，列表移除该条，toast「配置已删除」

#### Scenario: 列表加载与空态
- **WHEN** 打开「我的配置」且库为空
- **THEN** 显示空态文案「暂无保存的配置。在流水线页面点击『保存配置』即可创建。」，不崩溃
