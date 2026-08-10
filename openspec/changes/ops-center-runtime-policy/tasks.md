## 1. ops-center 后端

- [ ] 1.1 models.py 新增 Announcement/UpdatePolicy/ContentPolicy + runtime_service + runtime router + main.py 注册
- [ ] 1.2 测试：CRUD 校验、bootstrap 鉴权/活动过滤/upsert

## 2. 桌面端服务

- [ ] 2.1 OpsCenterSync 扩展：_fetchRuntime + applyRuntime（公告/敏感词重建/更新策略）
- [ ] 2.2 RuntimePolicyStore + auto-updater applyPolicy（强制/灰度/最低版本）
- [ ] 2.3 IPC ops-center-sync:runtime + sensitive 走远程词库 + access-control

## 3. 前端

- [ ] 3.1 ops-center 管理页：Announcements/UpdatePolicy/ContentPolicy + 路由/侧边栏
- [ ] 3.2 桌面端公告横幅 AnnouncementBanner + composable + vue build

## 4. 文档/交付

- [ ] 4.1 PRD（01-docs/PRD.md + ops-center PRD）+ CHANGELOG + .env.example
- [ ] 4.2 测试全量 + 外部审查 + 推送/PR/合并/归档 + 记忆
