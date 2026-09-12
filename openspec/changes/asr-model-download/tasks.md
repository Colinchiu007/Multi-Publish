## 1. Python 下载管理

- [ ] 1.1 asr_engine.py：新增 _probe_endpoint（HEAD 5s 探测）、_resolve_download_endpoint（优先级选择）、_classify_download_error（异常分类映射）、_get_model_cache_dir（缓存目录）；FasterWhisperEngine 增加 is_model_ready（local_files_only 预检）与 ensure_model（预检+下载+失败分类）
- [ ] 1.2 测试：test_aggregation_video.py 新增下载管理用例（镜像可达/不可达/用户显式设置/预检已缓存/各失败分类/提示含手动下载 URL）

## 2. 前端错误透传

- [ ] 2.1 collect-error.js 新增 asr_download_failed 分类（不可重试，透传后端具体提示）；locale zh/en 成对新增文案
- [ ] 2.2 collect-error.test.js 补分类用例

## 3. 文档与交付

- [ ] 3.1 PRD §7.2.1 模型下载管理：流程图/失败场景矩阵/提示文字/手动下载兜底指引
- [ ] 3.2 双模型审查 + 全量测试 + PR 合并
