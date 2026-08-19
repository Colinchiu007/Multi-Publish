## Context

历史页在 renderer 中合并 story2video:list-projects 和 pipeline:history。项目列表按 projectId 标识，流水线历史按 id 标识；项目服务的 deleteProject() 只在当前 owner 的项目索引中接受 projectId。历史状态页和父组件删除路由必须维持这两个身份边界。

## Goals / Non-Goals

**Goals:**

- 让 completed 项目和 completed 运行记录都按真实身份选择正确的删除后端。
- 对项目索引缺失、运行记录不匹配、接口返回失败和异常保持 fail-closed。
- 用测试覆盖组件事件、父组件分流、真实/近真实持久化删除和 IPC 错误映射。

**Non-Goals:**

- 不改变项目 owner 隔离、认证权限、路径安全或删除运行中任务的既有规则。
- 不把无法证明属于某个项目的运行记录强行迁移到项目索引。

## Decisions

1. 以显式项目索引匹配决定项目身份。历史合并只在运行标识能与项目列表中的 projectId 对齐时合并字段；否则保留运行记录身份。这样避免 run.id 缺少项目时被当作项目键。
2. 保留现有双删除后端。有 projectId 的项目走 story2video:delete-project，只有 id/runId 的运行记录走 pipeline:delete-run。相比把所有记录都交给项目服务，这能遵守当前持久化边界并保留运行中拒删语义。
3. 删除成功按相同身份移除。项目按 projectId 过滤，运行按 id/runId 过滤，避免同一列表中同名或关联记录被过度删除。
4. 失败不改本地列表。UI 只在对应接口明确返回 code === 0 后移除记录；错误使用已有稳定消息键并传入受控 detail 供日志/诊断，不把后端技术栈直接展示给用户。

## Risks / Trade-offs

- [Risk] 历史接口可能在不同版本返回旧字段 -> [Mitigation] 兼容读取 id/runId，并以项目列表的显式 projectId 做匹配。
- [Risk] owner 在加载与删除之间切换 -> [Mitigation] 删除失败时不清理 UI，下一次加载按当前 owner 重新建立身份；覆盖 owner 分区单测。
- [Risk] 现有测试只 mock 成功返回 -> [Mitigation] 增加 completed 的端到端式父组件分流和项目服务缺失索引失败测试。
