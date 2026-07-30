# 任务要求

## 目标

完成 `codex/story2video-scene-subtitles` 与 `codex/desktop-baseline-fixes` 的剩余验证、提交、GitHub PR 合并和工作树清理，最终使本地 `main` 与 `origin/main` 一致。

## 约束

- 保护现有 merge 索引及其他会话变更，不使用宽泛暂存。
- Electron 主进程变更必须完成本地 Windows QM-1 打包、ASAR、真实 require 链和启动 stderr 验证。
- 桌面测试使用单 worker 串行执行；本机 ffmpeg 验证不转移到 ECS。
- coverage、构建或打包遇到 Windows 文件锁时，使用新的隔离输出目录或确认锁来源，不删除未知产物。
- 每个分支必须通过独立审查和 GitHub checks 后再合并。
- 最终审计所有本地/远端分支、PR 和工作树，删除已合并的临时资源。

## 验收标准

- 两个分支的必要本地门禁均有 fresh exit code 0 证据，无法执行的外部验收明确列为边界。
- 两个分支均通过 PR 合并到 `main`，远端 checks 无失败。
- 本地只保留主工作树，`main == origin/main`，无未提交或未推送的目标分支。
