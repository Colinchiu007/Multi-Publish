## 1. 规格与实现

- [x] 1.1 R1：`saveSegments()` 替换 segments 后调用 `refreshSegmentImageUrls()`
- [x] 1.2 R3：`replaceSegmentAudio()` 替换 segments 后调用 `refreshSegmentImageUrls()`
- [x] 1.3 R2：`ResultView.test.js` 回归——非空返回 URL 重建 / 空返回保留 / 旁白替换不消失

## 2. 验证与交付

- [x] 2.1 vitest：`ResultView.test.js` 全绿（含既有保存/编辑/离开守卫用例）
- [x] 2.2 openspec validate + 双模型审查（antigravity/claude 并行；后端不可用则记录降级）
- [ ] 2.3 推送 `codex/fix-s2v-save-segments-image-loss` → PR → CI 全绿 → 合并回 main
- [ ] 2.4 三同步归档（openspec archive + CCG task 归档 + learnings 复盘条目）
