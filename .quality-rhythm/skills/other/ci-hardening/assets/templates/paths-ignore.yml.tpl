# paths-ignore 黑名单门控（ci-hardening M6 模板）— 只排除"肯定无关"路径，代码/依赖/CI 一律保留（fail-closed）
# 契约守护：把下方清单固化为契约测试断言（单一来源，防漂移）；tag(v*) 推送不受路径过滤影响（GitHub 官方行为）
# 占位：{{DOCS_DIRS}} 文档目录（逗号分隔）；{{PROCESS_DIRS}} 流程目录；其余按项目调整，删除不存在的项
on:
  push:
    branches: [{{DEFAULT_BRANCH}}]
    tags: [v*]
    paths-ignore:
      - '{{DOCS_DIRS}}/**'
      - '**/*.md'
      - 'LICENSE'
      - '.gitignore'
      - '.editorconfig'
      - '{{PROCESS_DIRS}}/**'
      - '{{LOCKFILE}}'
  pull_request:
    branches: [{{DEFAULT_BRANCH}}]
    paths-ignore:
      - '{{DOCS_DIRS}}/**'
      - '**/*.md'
      - 'LICENSE'
      - '.gitignore'
      - '.editorconfig'
      - '{{PROCESS_DIRS}}/**'
      - '{{LOCKFILE}}'
# 注意：
# - PR 事件按整个 PR diff 评估（最后一个提交只改被忽略路径不会跳过）
# - 不得排除：package.json / lockfile 之外的代码/配置/CI 路径（app/src、packages、.github/workflows）
# - 若该 workflow 是 required check，跳过可能导致合并卡死（main 无保护时无此问题）
