## MODIFIED Requirements

### Requirement: faster-whisper 本地引擎
faster-whisper 引擎 SHALL 复用现有 Transcriber 的模型加载与转写逻辑（model_size 默认 base、CPU int8、VAD 过滤），输出拼接为全文文本。模型首次使用时经下载管理流程自动下载（镜像优先 + 失败分类提示，见 aggregation-asr-model-download capability），下载进度 SHALL 在日志中可见。转写前 SHALL 先做本地预检，模型未就绪且下载失败时返回 ASR_DOWNLOAD_FAILED 错误码与可操作提示，不进入转写。

#### Scenario: 本地转写
- **WHEN** faster-whisper 已安装且模型已缓存，输入含清晰中文语音的 WAV
- **THEN** 返回中文转写文本、检测到的语言 zh、时长与分段信息

#### Scenario: 模型未缓存且下载失败
- **WHEN** 模型未缓存且下载源均不可达
- **THEN** 返回 ASR_DOWNLOAD_FAILED 与含网络检查建议、手动下载 URL 的中文提示，不抛未分类异常

#### Scenario: 模型首次下载
- **WHEN** 本地无 base 模型缓存
- **THEN** 首次转写自动经下载管理流程下载模型（约 141MB），期间任务保持运行，日志记录下载进度与所选下载源
