# story2video-media-import-feedback

## ADDED Requirements

### Requirement: 媒体导入失败提示带类别宾语

`resolveMediaImportFailure` 映射的细分提示 MUST 携带 `kindLabel`（图片/旁白音频/背景音乐/视频素材），文案为「无法读取所选{kindLabel}文件…」「{kindLabel}文件大小超出限制…」等完整宾语形式。

- `handleS2VBgmFile` 等所有入口 MUST 统一复用 `story2videoKindLabel(kind)` 映射
- 主进程拒绝与 IPC 异常两条路径都 MUST 带 `kindLabel`

#### Scenario: 不可读提示带宾语

- **WHEN** 背景音乐导入失败（主进程返回「媒体文件不存在或不可读」）
- **THEN** 弹窗消息为「无法读取所选背景音乐文件，请确认文件未被占用或已损坏后重试。」

#### Scenario: 格式/大小提示带宾语

- **WHEN** 格式不支持或大小超限
- **THEN** 提示文本插值 `kindLabel`（如「背景音乐仅支持：wav / m4a / mp3」）

### Requirement: 路径解析失败与文件不可读区分

- preload `webUtils.getPathForFile` 拿不到 File 本地路径（`无法读取媒体文件路径`）MUST 映射 `MEDIA_PATH_UNRESOLVED`：指引「请重新选择文件；若持续出现请重启应用」
- 主进程报告文件不存在/不可读/被占用 MUST 映射 `MEDIA_UNREADABLE`：「请确认文件未被占用或已损坏后重试」
- 无法识别的原因 MUST 回退 `MEDIA_INVALID`（不泄露内部错误文本）

#### Scenario: preload 路径解析失败

- **WHEN** `story2videoImportMedia` 返回 `{ code: -1, message: '无法读取媒体文件路径' }`
- **THEN** 弹窗消息为「无法获取所选背景音乐文件的本地路径，请重新选择文件后再试；若持续出现请重启应用。」（`story2video.media_path_unresolved`）

#### Scenario: 主进程文件不可读

- **WHEN** 主进程返回「媒体文件不存在或不可读」或「媒体文件被占用，请关闭占用程序后重试」
- **THEN** 弹窗消息为「无法读取所选背景音乐文件，请确认文件未被占用或已损坏后重试。」（`story2video.media_unreadable`）

### Requirement: Windows 文件占用有界重试

`importUserSelectedMedia` 复制文件时对 `EBUSY`/`EPERM`/`EACCES` MUST 做有界重试（≤3 次、短退避），其余错误 MUST 原样抛出；持续占用回传可读中文原因「媒体文件被占用，请关闭占用程序后重试」。

- MUST NOT 无限重试或吞掉非占用类错误

#### Scenario: 占用类错误重试后成功

- **WHEN** 前 2 次复制抛 EBUSY/EPERM，第 3 次成功
- **THEN** 导入成功，复制恰好调用 3 次

#### Scenario: 持续占用

- **WHEN** 3 次复制均抛 EBUSY
- **THEN** 抛出「媒体文件被占用，请关闭占用程序后重试」

#### Scenario: 非占用类错误

- **WHEN** 复制抛 ENOENT 等非占用错误
- **THEN** 原样抛出（不重试、不吞错），仅调用 1 次
