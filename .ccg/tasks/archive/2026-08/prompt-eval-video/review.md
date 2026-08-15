# Review — prompt-eval-video（运营后台提示词评测：视频模式）

> 分支：codex/prompt-eval-video（worktree D:/Data/projects/mp-worktrees/mp-prompt-eval-video，基线 main 9283fd80）
> 变更：Agnes Video V2.0 异步生成 → ffmpeg 抽首/中/尾 3 帧 → 复用评估 LLM 契约（media_type=video）

## 审查方式

- **antigravity 不可用（降级记录）**：`codeagent-wrapper --backend antigravity` Eligibility check failed（地区不可用，与历史一致），本次为单模型（Claude）审查。
- Claude 首轮审查：diff + 4 个新文件全文写入 `C:/tmp/prompt-eval-video-review-input.txt`（文件路径投喂，非 stdin），输出 2 Critical / 7 Warning / 若干 Info。
- Claude 复审：修复 delta 投喂，8/8 首轮问题确认修复，无 Critical，2 Warning（均为修复残留/副作用）+ 8 Info。

## 首轮发现与处置

### Critical（合并前必须修复 — 已全部修复）

| # | 问题 | 修复 |
|---|------|------|
| C1 | `run_owns_media` 越权（CWE-862）：`case_ids = {r.case_id for r in runs}` 收集全部媒体 run 的 case，授权从「拥有该文件所属 case」退化为「拥有任意产生过媒体的 case」；文件名确定（run_{id}_*.png/mp4），任意做过评测的用户可枚举读取他人媒体 | `owned_case_ids` 只在 `name in refs` 时收集该 run 的 case_id，授权仅基于该集合；新增 `test_media_auth_scoped_to_owning_case`（bob 有自己的媒体 case，读 alice 媒体必须 404） |
| C2 | `scene_snapshot()` 缺 `media_type` → 场景模式全部 run 100% 失败（`case["media_type"]` KeyError → `worker: 'media_type'`） | `scene_snapshot` 补 `media_type`；`run_pipeline` 改 `case.get("media_type","image")` 兜底；`start_run_pipeline` dict 路径改 `.get`；新增 `test_scene_snapshot_media_type_and_update_guards`（快照键 + dict 缺键兜底 + PUT 守卫） |

### Warning（生产可靠性 — 已全部修复，除 W7 部分接受）

| # | 问题 | 处置 |
|---|------|------|
| W1 | `generate_video` 共享 client 用 httpx 默认 5s 超时，覆盖各阶段精心设置的超时 | 共享 client 改 `httpx.Timeout(120.0, connect=30.0)` |
| W2 | 下载先整包缓冲后验 50MB，恶意超大 body 可耗尽内存 | `download_video` 改流式 `aiter_bytes()` 边收边限；`test_download_video_stream_cap` |
| W3 | `_probe_duration` 同步 subprocess.run 阻塞事件循环（最长 30s） | `extract_frames` 内经 `asyncio.to_thread` 调用 |
| W4 | 抽帧失败残留孤儿 MP4（清理逻辑与注释相反） | 成功标志区分：异常路径删除视频 + 部分帧；`test_extract_frames_failure_cleans_partial_media` |
| W5 | `audio_visual_sync` 被实际启用，与 PRD「保留待音频消费实现」矛盾 | 契约/prompt 保留帧代理评估（prompt 已注明「基于画面帧评估」），PRD §3.2/§14 措辞对齐为「音画同步以画面帧代理评估，独立音轨评估为后续版本」 |
| W6 | 轮询退避 `POLL_BACKOFF[attempt]` 数组越界（len=2 但 attempt 可达 2 → IndexError） | `min(attempt, len-1)` 夹取（submit/poll/HTTPError 三处统一）；`test_poll_retry_backoff_bounds` |
| W7 | 下载 URL 仅 scheme 校验，SSRF 纵深不足 | `_validate_download_url`：仅 https + http 仅限 loopback；`follow_redirects=False`；3xx Location 经白名单校验后有限跟随（≤3 跳）；`test_download_video_rejects_http_non_loopback` / `test_download_video_validated_redirect`。**接受项**：https 面未做解析后 IP 段拒绝（私有/元数据地址），信任边界为「video_url 来自运营配置 provider 的响应体」，已在代码注释与 CHANGELOG 声明 |

### Info（已修 / 接受）

- 已修：`create_run` ValueError → 400（原 500）；`_llm_cfg`（dual 缺 LLM key）并入 try → 400；轮询 env 参数非法 → `VideoGenerationError`；`/v1/?$` 正则（兼容尾斜杠）；未知终态 error/canceled/expired → failed 快速失败；`MAX_VIDEO_BYTES/VIDEO_FRAME_COUNT` 统一从 contract 导入；poll deadline 检查移入重试循环；测试桩 `async def fake_start`→同步、死代码 `if False` 清理。
- 接受（记录）：提交/轮询返回非 JSON 200 时错误信息较晦涩（fail-closed 正确）；`summary` 聚合混排图片/视频维度（前端卡片已按 run 展示，聚合 v1 语义）；`update_case` 允许 image↔video 切换且历史 run 不随迁（改 media_type 只影响新 run，前端始终全量提交）；https 面 host/IP 限制（见 W7 接受项）。

## 复审结论

- 8/8 首轮问题已解决；无 Critical；修复整体方向正确、fail-closed 一致、回归测试针对性强。
- 复审 W-2（follow_redirects=False 会让 CDN/预签名 3xx 下载失败）→ 已修复（白名单校验后有限跟随）。
- 复审 W-3（dual 缺 LLM key → 500）→ 已修复（并入 try → 400）。
- 复审 Info 7（design.md 轮询端点写 `GET {base}/videos/{taskId}`，实现走 `/agnesapi?video_id=`）→ design.md 已同步。

## 测试证据（本地重跑）

- 视频服务 24 passed / 视频 API 6 passed / engine dual 23 passed / 全量相关 10 套件 115 passed（1m 内）；前端 `npm run build` 通过。
- 真实 Agnes 视频生成 / 视觉评估为外部验收项（自动化测试全 mock）。