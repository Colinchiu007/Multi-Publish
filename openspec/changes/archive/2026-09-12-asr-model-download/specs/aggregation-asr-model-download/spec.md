## Purpose

定义 faster-whisper 模型首次使用时的下载管理行为契约：下载源自动选择（镜像优先）、下载前预检、失败场景分类与用户可操作提示，保证中国大陆无代理环境可用。

## ADDED Requirements

### Requirement: 下载源自动选择
首次转写触发模型下载时，系统 SHALL 按优先级选择下载源：①用户显式设置的 HF_ENDPOINT 环境变量（尊重用户配置，不做覆盖）；②未设置时探测 hf-mirror.com 可达性（HEAD 请求 5 秒超时），可达则使用镜像；③镜像不可达时回退 huggingface.co 直连。选择结果 SHALL 记录在日志中。

#### Scenario: 镜像可达走镜像
- **WHEN** HF_ENDPOINT 未设置且 hf-mirror.com 探测返回 200
- **THEN** 下载走 https://hf-mirror.com，日志记录「使用镜像 hf-mirror.com」

#### Scenario: 用户显式设置优先
- **WHEN** 用户已设置 HF_ENDPOINT 环境变量（任意值）
- **THEN** 直接使用该值，不做探测与覆盖

#### Scenario: 镜像不可达回退直连
- **WHEN** HF_ENDPOINT 未设置且 hf-mirror.com 探测超时或非 200
- **THEN** 回退 huggingface.co 直连，日志记录「镜像不可达，回退直连」

### Requirement: 下载失败分类与提示
模型下载失败时，系统 SHALL 将底层异常映射为明确的失败原因并返回含可操作建议的中文提示：网络不可达（含检查网络/代理建议）、下载超时（含重试建议与手动下载指引）、磁盘空间不足（含清理建议）、离线模式冲突（含关闭 HF_HUB_OFFLINE 指引）、未知失败（含手动下载完整 URL）。提示 SHALL 包含手动下载兜底路径（确切 URL + 缓存目录位置）。

#### Scenario: 网络不可达
- **WHEN** 下载源连接失败（ConnectionError/超时）
- **THEN** 返回 ASR_DOWNLOAD_FAILED 与提示「模型下载失败：网络无法连接下载源。请检查网络连接（国内推荐设置 HF_ENDPOINT=https://hf-mirror.com），或稍后重试」

#### Scenario: 磁盘不足
- **WHEN** 下载因磁盘空间不足失败
- **THEN** 返回提示含「磁盘空间不足」，建议清理缓存目录

#### Scenario: 手动下载兜底指引
- **WHEN** 任何下载失败场景
- **THEN** 提示 SHALL 包含模型缓存目录路径与手动下载 URL（用户可浏览器手动下载后放入缓存）

### Requirement: 下载预检
转写前系统 SHALL 预检模型是否已缓存（local_files_only 模式查询）：已缓存则直接加载不触发下载；未缓存则触发带进度日志的下载。预检 SHALL 不产生网络请求（纯本地查询）。

#### Scenario: 模型已缓存
- **WHEN** 模型文件已存在于缓存目录
- **THEN** 直接加载，不发起任何网络请求

#### Scenario: 模型未缓存
- **WHEN** 缓存目录无模型文件
- **THEN** 触发下载流程（源选择 → 下载 → 进度日志）
