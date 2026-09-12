## Why

faster-whisper 首次转写时自动从 HuggingFace 下载 base 模型（141MB），但当前实现把下载完全交给 huggingface_hub 默认行为：国内直连 HF 不稳定会导致下载失败且用户只看到笼统的「转写失败」；无进度反馈；失败后无重试指引。需要实现模型下载管理：镜像自动选择、下载前预检、失败分类与可操作提示。

## What Changes

- Python asr_engine.py：FasterWhisperEngine 新增模型预检（is_model_ready）与下载管理（ensure_model）——下载前探测镜像可达性自动选择下载源（HF_ENDPOINT 优先级：用户显式设置 > hf-mirror.com 可达 > huggingface.co）、下载异常分类（网络不可达/超时/磁盘不足/仓库不存在/离线模式）映射为 AsrEngineError 专属 code 与中文提示（含重试建议与手动下载指引）。
- 下载失败提示新增错误码 ASR_DOWNLOAD_FAILED（含具体原因），经 IPC classifyError 与前端 collect-error.js 透传到采集页错误横幅。
- locale zh/en 成对新增下载失败文案。
- PRD 补充 §7.2.1「模型下载管理」：预检流程图、失败场景矩阵（镜像不可达/直连不可达/磁盘不足/下载中断）、提示文字、手动下载兜底指引。

## Capabilities

### New Capabilities
- `aggregation-asr-model-download`: faster-whisper 模型首次使用下载管理——下载源自动选择、预检、失败分类与用户提示契约。

### Modified Capabilities
- `aggregation-asr-engines`: FasterWhisperEngine 行为扩展——转写前确保模型就绪（预检+下载），下载失败返回专属错误码与可操作提示而非笼统失败。

## Impact

- Python：packages/python-backend/src/multi_publish/aggregation/asr_engine.py（下载管理逻辑）。
- 前端：apps/desktop/src/utils/collect-error.js（新错误分类）+ locales zh/en。
- 测试：test_aggregation_video.py 扩展（下载预检/镜像选择/失败分类）+ collect-error.test.js。
- 文档：PRD §7.2.1。
