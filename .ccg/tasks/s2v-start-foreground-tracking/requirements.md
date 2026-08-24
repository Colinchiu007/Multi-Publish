# 需求（用户原话摘要 + 增强）

- 视频创作启动流水线后，前端在创作页轮询展示进度；离开此界面后任务转为后台运行，只能在历史记录中查看。
- 再次进入视频创作启动页时，回到初始新建任务状态，可在并发上限内再次启动流水线。
- 历史记录中新增「已中断」：与「已暂停（用户手动暂停/检查点）」「执行失败（真实错误终态）」区分；确认为必要状态，独立历史页须同样按此语义展示。

## 交付契约

1. 启动前台跟踪：三条编排启动路径成功后保留 runId、立即拉取全量快照、3s 轮询展示 StageProgress 与 running-controls。
2. 离开页面：beforeUnmount 停止轮询与事件订阅，run 继续后台执行、仅历史可见、不弹结果页。
3. 重进初始态：mounted 不重挂任何 run。
4. 保留并发门禁（maxConcurrentRuns / PIPELINE_CONCURRENCY_LIMIT）与 scene_asset_selection 检查点例外。
5. 卸载竞态守卫：_s2vAlive === false 时丢弃在飞响应，禁止已卸载组件跳转。
6. 独立历史页 CreateHistory.vue：stale running → interrupted、标签/路由/紫色样式、文案走 locale。
7. locale zh/en 成对；renderer 不新增硬编码中文；CJK 基线按行号位移重锚。
8. PRD/OpenSpec/CHANGELOG/i18n-glossary/CCG task 全量同步；PR 推送合并后归档，memory 更新。
