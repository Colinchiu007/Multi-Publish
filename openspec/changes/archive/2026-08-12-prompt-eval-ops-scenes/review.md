# Review — prompt-eval-ops-scenes（2026-08-12）

## 双模型审查
- **antigravity**：wrapper 启动后 agy 退出码 1（与历史一致：antigravity 区域不可用）→ 降级记录。
- **Claude**（codeagent-wrapper --backend claude，约 12 分钟）：1 Critical + 5 Warning + 8 Info。已核查无问题项：鉴权（场景接口先 _can_access 再校验 scene.case_id）、XSS（全插值无 v-html）、Windows GBK 子进程 encoding=utf-8、幂等缓存（prompt_en_cache_zh==prompt_zh + 7 天）、ORM expire_on_commit=False 快照安全、run 状态机。

## 审查结论 → 修复（全部落地并有回归测试）
| 级别 | 问题 | 修复 |
|------|------|------|
| C1 | 存量库缺 source_mode/scene_id 列 → 上线全线 500 | 新增 `services/prompt_eval_migration.py` `ensure_prompt_eval_scene_columns`（PRAGMA 探测 + ALTER 幂等补列），main.py lifespan 注册；`tests/test_prompt_eval_migration.py`（旧库建表→补列→幂等） |
| W1 | subtitle_timing 校验通过但从未生效（equal 不可达） | create_case_scene 向 segment_subtitles 传 `config={"timeCalculationMethod": subtitle_timing}`；`test_scene_subtitle_timing_equal_effective` 断言各块时长一致 |
| W2 | Python 分句与 TS 不一致（target<10 无钳制、超长无标点文本、顿号枚举位移缺失） | 对齐 TS：budget 钳制 [minWordsPerSegment=10, maxWordsPerSegment=50]（calculateTargetWords）；maxSentenceLength=200 强制分段 + splitLongSentence；_find_split_pos 顿号最低优先级；applyEnumerationShift/enumerationEnd（subtitle-rules.json 常量）；CORPUS 扩到 9 条（target 8/1/200、440 字无句号、顿号枚举），node 对照 20 例全绿 |
| W3 | scene run 未 fail closed（prompt_zh 空仍可生成） | router create_scene_run 校验 `scene.prompt_zh` 非空 → 400「请先生成中英对照」；前端按钮 `:disabled="!s.prompt_zh"`；测试断言 400 + 文案 |
| W4 | 前端轮询重分句/openCase 后不停（8s 无限） | doSplitScenes/openCase 开头 stopScenePolling；manual case 清空 scenes/sceneRunMap；轮询 in-flight 守卫（sceneRunsInFlight） |
| W5 | 轮询每次拉全量 case（≤20000 字 + 50 场景） | 新增轻量 `GET /cases/{id}/runs`（仅 runs 列表）；前端 loadSceneRuns 改用 listPromptEvalCaseRuns；测试断言无 source_text 字段 |
| Info | 死代码 context_ctx 未用 | 删除 |
| Info | translate_scene 所有异常 502 且透出 provider 细节 | ValueError→400（结果为空是校验失败）；其余 502 归一化文案（不透 e） |
| Info | scene_snapshot json 冗余往返 | 直接用 scene.scene_context |
| Info | 重复 @pytest.mark.asyncio 装饰器 | 清理 |
| Info | openCase manual 不清空 scenes | 已随 W4 修复 |
| Info | 轮询并发堆叠 | 已随 W4 修复（in-flight 守卫） |
| Info | 枚举位移/末块时长舍入漂移（低危） | 枚举位移已实现；末块 endTime 语义与 TS buildSubtitleTimelineV2 一致（末块置总时长），字幕文本为测试契约，保留现状并记录 |

## 最终门禁
- pytest 205 全绿（分句一致性 20 例含 9 条语料 / API 13 / 迁移 1 / 契约 5 / 场景上下文 5 / services 6 + 既有）
- 前端 `npm run build` 通过
- `openspec validate prompt-eval-ops-scenes` 通过
