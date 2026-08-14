# story2video-bgm-library Specification

## Purpose
「全能创作」背景音乐从单文件临时选择升级为持久化素材库：支持多文件添加、重命名展示名、删除，并通过下拉选择应用到合成配置。compose `bgm.path` 契约与合成行为不变。

## ADDED Requirements

### Requirement: 持久化素材库

系统 SHALL 提供设备级持久化的 BGM 素材库（`userData/story2video-bgm/`），以 `library.json` 索引维护条目（id、展示名、磁盘文件名、大小、创建/更新时间），条目文件不得使用符号链接且必须位于库目录内；展示名与磁盘文件名解耦，重命名只修改索引。

#### Scenario: 添加音乐
- **WHEN** 用户在管理弹窗选择受支持格式（wav/m4a/mp3，≤15MB）的本地音频文件
- **THEN** 文件被复制入库，索引新增条目，下拉与管理列表立即可见，且不覆盖同名已有条目

#### Scenario: 重命名展示名
- **WHEN** 用户对库内条目输入 1..60 字符的新名称并保存
- **THEN** 索引更新展示名，下拉与列表显示新名称，磁盘文件名与 compose 引用路径不变

#### Scenario: 删除条目
- **WHEN** 用户确认删除库内条目
- **THEN** 索引条目与库内文件被移除；被删除条目若正被当前配置引用，配置回退为不使用 BGM

#### Scenario: 非法输入拒绝
- **WHEN** 添加不支持的格式/超 15MB/符号链接文件，或重命名空名/超长名，或删除不存在的 id
- **THEN** 操作失败且返回可读错误，库内容不变

### ADDED Requirement: 下拉选择与配置兼容

BGM 配置区 SHALL 以下拉选择库内条目（含「不使用背景音乐」空选项）；选中项映射为既有 `s2vConfig.bgmPath`，compose 参数 `bgm.enabled/path/volume` 契约不变；当既有 `bgmPath` 不在库中时 SHALL 以「已选音频（未入库）」选项保留，不得丢失历史配置。

#### Scenario: 下拉选择生效
- **WHEN** 用户从下拉选择库内音乐
- **THEN** `s2vConfig.bgmPath` 更新为该条目路径，发起合成时 `bgm.enabled=true` 且 `bgm.path` 为该路径

#### Scenario: 历史路径兼容
- **WHEN** 恢复的配置 `bgmPath` 非空但不在库中
- **THEN** 下拉显示「已选音频（未入库）」选项且默认选中该路径，合成仍使用该路径

### ADDED Requirement: 权限与安全

BGM 素材库通道（list/add/rename/delete）SHALL 在未登录时可用（与 `story2video:import-media` 同级 PUBLIC），因为纯设备本地文件管理；所有路径校验 MUST 复用受控路径机制（canonical 白名单、拒绝符号链接、Windows 占用有界重试、索引原子写入）。

#### Scenario: 未登录可用
- **WHEN** 用户未登录/未激活许可证时打开全能创作 BGM 管理弹窗
- **THEN** list/add/rename/delete 均可正常调用（与现有媒体导入同级）

#### Scenario: 索引原子性与容错
- **WHEN** 索引写入并发或进程中断
- **THEN** 索引以临时文件+rename 原子替换，损坏/缺失索引按空库降级；删除时文件已不存在不阻塞索引清理

### ADDED Requirement: 本地化

所有新增用户可见文案 SHALL 由 locales（zh/en 成对）驱动，禁止在 src/ 新增中文字符串字面量；错误提示复用 `STORY2VIDEO_NOTIFICATION_KEYS` + `showStory2VideoErrorDialog` 细分映射。

#### Scenario: 双语展示
- **WHEN** 界面语言为 zh/en 时打开 BGM 管理弹窗
- **THEN** 弹窗标题、按钮、空态与错误提示均显示对应语言文案

## 测试映射

- 服务层：`story2video-bgm-library.test.js`（添加/重命名/删除/非法输入/原子写入/容错）
- IPC：`ipc-handlers/story2video.test.js`（4 通道参数校验与返回）、`license-access-control.test.js`（PUBLIC）、`preload.test.js`（通道与 getPathForFile 解析）
- API：`publisher.test.js`（fallback 与参数）
- 渲染端：`CreateView.test.js`（下拉渲染/选择/管理弹窗添加重命名删除/历史路径兼容/compose 参数）
