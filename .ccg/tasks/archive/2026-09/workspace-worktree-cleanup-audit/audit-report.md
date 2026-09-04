# 工作区/工作树可清理审计报告

审计时间：2026-09-04

## 当前工作树（5 → 3）

| 工作树 | 分支 | 状态 | 已合并 | 体积 | 处理 |
|--------|------|------|--------|------|------|
| Multi-Publish (main) | main | CLEAN | - | 7818MB | 保留 |
| mp-e2e-run | fix/dev-electron-windows-spawn | CLEAN | 否（1个commit ahead） | 1496MB | 保留 |
| mp-fix-pipeline-error-code-transparency | codex/fix-pipeline-error-code-transparency | CLEAN | 是 | 67MB | ✅ 已移除 |
| mp-start-win | (detached HEAD = main) | CLEAN | N/A | 1496MB | ⚠️ 目录占用 |
| mp-video-history-download-sort-duplicate | codex/video-history-download-sort-duplicate | CLEAN | 否（2个commit ahead） | 1484MB | 保留 |

## 处置详情

### ✅ 已移除
- **mp-fix-pipeline-error-code-transparency**：分支已合并到 main，无未提交变更，已通过 `git worktree remove --force` 移除。

### ⚠️ 部分移除（需手动清理）
- **mp-start-win**：detached HEAD 指向 main，工作树元数据已移除，但目录被占用（electron.exe/dll 被其他进程锁定）。需在进程退出后手动删除：
  ```cmd
  rmdir /s /q D:\Data\projects\mp-worktrees\mp-start-win
  ```

### 保留
- **mp-e2e-run**：分支 `fix/dev-electron-windows-spawn` 有 1 个独特 commit（修复 Windows spawn ENOENT），尚未合并到 main。建议合并或创建 PR 后清理。
- **mp-video-history-download-sort-duplicate**：分支有 2 个独特 commit（视频历史下载/排序/去重），任务已归档但代码未合并。建议创建 PR 合并后清理。

## 空间节省
- 已移除 67MB（mp-fix-pipeline-error-code-transparency）
- 待手动清理 1496MB（mp-start-win）
- 剩余可清理 2980MB（mp-e2e-run + mp-video-history 在合并后可移除）

## 结论
- 实际工作树 5 个（非标题声称的 62 个），已清理 1 个，1 个因进程占用待手动清理。
- 2 个分支有未合并代码，建议合并后一并清理其工作树以释放约 3GB 磁盘空间。
