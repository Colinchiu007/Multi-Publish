# Trellis 接入说明

这个目录是 Multi-Publish 的 Trellis 入口层。

## 定位

- `AGENTS.md` 仍然是项目级强约束
- `.quality-rhythm` 仍然负责阶段门禁与质量流程
- `.ccg` 仍然保留当前的任务追踪方式
- Trellis 负责把 spec、task、workspace 变成可复用的日常开发上下文

## 使用方式

1. 先读 `AGENTS.md`
2. 再读 `.trellis/workflow.md`
3. 再读 `.trellis/spec/`
4. 新任务放到 `.trellis/tasks/`
5. 会话记录放到 `.trellis/workspace/`

## 这个仓库的约定

- 后端约定放在 `.trellis/spec/backend/index.md`
- 前端约定放在 `.trellis/spec/frontend/index.md`
- 通用规则放在 `.trellis/spec/guides/index.md`
- 项目级默认值放在 `.trellis/config.yaml`
- 工作流说明放在 `.trellis/workflow.md`
- 日常开发模板放在 `.trellis/templates/`
- 会话记录索引放在 `.trellis/workspace/index.md`
- 当前这套接入是最小可用版本，先不覆盖已有 `.codex/skills` 和 `.cursor/commands`

## 后续补充

如果要启用 Trellis 的自动注入能力，再在本机的 Codex 配置里打开 hooks，并按 Trellis 官方文档执行 `trellis init --codex` 一类的初始化流程。
