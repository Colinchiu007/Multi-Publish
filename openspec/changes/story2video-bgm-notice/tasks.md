# Tasks: story2video-bgm-notice

## 1. 通知层

- [x] `story2video-notifications.js`：BGM_SKIPPED key（zh/en）+ bgmSkippedReasonText + formatBgmSkippedNotification
- [x] `MODEL_API_KEY_PATTERN` 拆分命名子模式
- **测试目标**：notifications.test.js（4 原因中英、key 完整性、既有 decrypt/missing 用例）

## 2. CreateView 提示条

- [x] 模板 + computed `story2videoBgmSkippedNotice` + 关闭按钮 + 新运行重置 + 结果页透传（ResultView）
- **测试目标**：CreateView.test.js（显示/隐藏/关闭）

## 3. GC 惰性触发

- [x] `importUserSelectedMedia` 惰性 GC（gcEnabled 门控 + gcIntervalMs 默认 1h + 按 baseDir 节流）
- **测试目标**：story2video-paths.test.js（到期触发/节流）

## 4. 门禁与交付

- [x] 受影响 vitest 套件全绿（6 文件 275 用例，jsdom）
- [x] 双模型审查（Claude Critical 0，Major1-3 + Minor 已修复；antigravity 降级记录）
- [ ] PR + 合并回 main；openspec/CCG/learnings 三同步
