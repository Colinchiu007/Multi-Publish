## 1. 桥接层（R1）

- [x] 1.1 `base-python-bridge.js`：`_post(path, body, timeout, traceId)` 增加可选 traceId → `X-Request-Id` 头 + `traceId=` 日志；测试（HTTP mock 断言头/无头两态）
- [x] 1.2 `splitter-bridge.js` / `aligner-bridge.js`：业务方法接受 traceId（options 提取）→ `_post`
- [x] 1.3 `prompt-bridge.js`：optimize/optimizeBatch/optimizeVideo/optimizeVideosBatch + `_postStandalone` 接受 traceId（options 提取，不进 payload；对象形态/回退分支同带 traceId）

## 2. 编排层（R2/R3）

- [x] 2.1 `stage-executor.js`：SPLIT/OPTIMIZE/OPTIMIZE_BATCH 内置执行器把 runId 作为 options.traceId 传给 serviceBus；测试断言 traceId=runId 且 payload 无 traceId
- [x] 2.1b `story2video-stages.js`：story2video_optimize(:1514) / GENERATE_ASSETS 内 optimizeVideoPrompt(:620/:1855) / FINALIZE_ASSETS alignScenes(:2435) 补 runId→traceId；测试（Claude C1-C3）
- [x] 2.2 `service-bus.js`：splitText/optimizePrompt/optimizePromptsBatch/optimizeVideoPrompt/optimizeVideoPromptsBatch 提取 options.traceId 透传（不进 payload）；测试
- [x] 2.3 `subtitle-align-service.js` alignScenes 透传 traceId → AlignerBridge（GENERATE_ASSETS :2184 与 FINALIZE_ASSETS :2435 两处）；测试断言 transcribeAudio 第 2 参含 traceId

## 3. Python 消费（R4）

- [x] 3.1 `audio-aligner/aligner/api.py`：`/align` 读取 `X-Request-Id` 头 → 日志含 request_id（成功/异常）；**补 `logging.basicConfig(INFO)` 防生产静默（W1）**；pytest 覆盖（caplog 断言成功/异常两条）

## 4. 契约与边界（R5）

- [x] 4.1 设计/合同文档标注外部边界（外部 sidecar 消费、server.py 白名单对接）
- [x] 4.2 回归：desktop 相关测试全绿（base-python-bridge / stage-executor / service-bus / story2video / subtitle-align）；**bridge 层 body 无 traceId 断言（splitter/aligner/prompt 三处）**；`_postStandalone` 头断言（W4）

## 5. 验证与交付

- [x] 5.1 本地测试全绿 + `openspec validate cross-process-traceid` 通过
- [x] 5.2 提交、推送、PR、合并、三同步归档（含 learnings + 文档门禁同步）
