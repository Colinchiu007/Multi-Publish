## Purpose

定义 ASR 语音转写引擎抽象层的行为契约：多引擎（本地 faster-whisper / 本地 SenseVoice / 在线 SiliconFlow）可切换、可用性探测、中文错误提示与降级策略，为视频采集管线提供统一的转写能力。

## ADDED Requirements

### Requirement: 引擎抽象接口
ASR 引擎层 SHALL 提供统一接口：transcribe(audio_path, options) → { text, language, duration_seconds, segments }、is_available() → bool、install_hint() → str。引擎实现 SHALL 不依赖调用方感知其内部依赖（Python 库/外部二进制/HTTP API）。

#### Scenario: 统一转写契约
- **WHEN** 任一可用引擎对 16kHz 单声道 WAV 文件执行 transcribe
- **THEN** 返回结构含非空 text（或明确的失败错误）、language、duration_seconds、segments 列表

#### Scenario: 输入文件不存在
- **WHEN** transcribe 收到不存在的文件路径
- **THEN** 返回失败结果与中文错误「音频文件不存在」，不抛未捕获异常

### Requirement: 引擎选择与切换
ASR 引擎 SHALL 通过环境变量 ASR_ENGINE 选择（faster_whisper | sensevoice | siliconflow），默认 faster_whisper。所选引擎不可用时 SHALL 返回 -6 错误码与该引擎的中文安装指引，SHALL NOT 自动静默切换到其他引擎（避免不可预期的网络/下载行为）。

#### Scenario: 默认引擎
- **WHEN** 未设置 ASR_ENGINE 环境变量
- **THEN** 使用 faster_whisper 引擎

#### Scenario: 引擎切换
- **WHEN** 设置 ASR_ENGINE=siliconflow 且 SILICONFLOW_API_KEY 已配置
- **THEN** 转写请求走 SiliconFlow 在线 API

#### Scenario: 所选引擎不可用
- **WHEN** ASR_ENGINE=faster_whisper 但 faster-whisper 未安装
- **THEN** 返回 -6 与「语音转写引擎不可用，请安装 faster-whisper：pip install faster-whisper」，不自动切换引擎

### Requirement: faster-whisper 本地引擎
faster-whisper 引擎 SHALL 复用现有 Transcriber 的模型加载与转写逻辑（model_size 默认 base、CPU int8、VAD 过滤），输出拼接为全文文本。模型首次使用时自动下载（HuggingFace 缓存），下载进度 SHALL 在日志中可见。

#### Scenario: 本地转写
- **WHEN** faster-whisper 已安装且输入含清晰中文语音的 WAV
- **THEN** 返回中文转写文本、检测到的语言 zh、时长与分段信息

#### Scenario: 模型首次下载
- **WHEN** 本地无 base 模型缓存
- **THEN** 首次转写自动下载模型（约 150MB），期间任务保持运行，日志记录下载进度

### Requirement: SiliconFlow 在线引擎（Phase 2）
SiliconFlow 引擎 SHALL 通过 HTTP API 调用 FunAudioLLM/SenseVoiceSmall（免费模型），认证使用 SILICONFLOW_API_KEY 环境变量。未配置 Key 时 is_available() 返回 false 并提示注册指引。请求超时 SHALL 为 120 秒。

#### Scenario: 在线转写
- **WHEN** SILICONFLOW_API_KEY 已配置且音频上传成功
- **THEN** 返回 SenseVoice 转写文本

#### Scenario: 未配置 API Key
- **WHEN** ASR_ENGINE=siliconflow 但 SILICONFLOW_API_KEY 未设置
- **THEN** is_available() 返回 false，install_hint 提示「请注册 SiliconFlow 并配置 SILICONFLOW_API_KEY 环境变量」

### Requirement: SenseVoice 本地引擎（Phase 2）
SenseVoice 引擎 SHALL 通过子进程调用 llama.cpp GGUF 单二进制（funasr-llamacpp Windows x64 预编译包），模型文件首次使用时下载到用户数据目录。二进制与模型路径 SHALL 支持环境变量覆盖（ASR_SENSEVOICE_BIN / ASR_SENSEVOICE_MODEL）。

#### Scenario: 二进制路径覆盖
- **WHEN** 设置 ASR_SENSEVOICE_BIN 指向自定义二进制路径
- **THEN** 引擎使用该路径调用，不使用默认查找路径

#### Scenario: 二进制缺失
- **WHEN** 未找到 SenseVoice 二进制
- **THEN** is_available() 返回 false，install_hint 提示下载地址（FunASR GitHub Releases）
