## Tasks

- [x] W4：`story2video.js` 6 个写通道接入 `_serializeProject`（replace-segment-audio / retry-segment / select-scene-material / generate-scene-image / generate-scene-video / delete-project，审查 M3）
- [x] W5：`story2video-stages.js` 导出 `withAssetTransientRetry`（+`excludeMessages` 可选排除）；service 构造器注入 `assetRetry`（默认排除轮询超时/任务终态，M1）；`generateSceneAiVideo` 包装重试 + 守卫读 `error||message`（M2）
- [x] 测试：IPC 队列计数 6→12 + 4 通道断言；service +4 用例（注入包装重试 / 默认重试 / 耗尽 fail-closed 保留文案（M2/m5）/ 非瞬时不重试（m5））；替换旁白用例 mock 补 `_serializeProject`
- [ ] 全量桌面 vitest 通过
- [ ] QM-1 打包 + 8s 冒烟
- [ ] 文档：PRD 3.1.29.2 + CHANGELOG
- [ ] PR + CI 全绿 + 合并 + 归档
