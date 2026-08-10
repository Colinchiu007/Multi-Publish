## 1. ops-center 目录端点

- [x] 1.1 config.py OPS_CATALOG_API_KEY + routers/model_presets.py catalog 端点 + service 序列化
- [x] 1.2 测试：正确/错误/未配置 key、is_visible 过滤、自洽断言

## 2. 桌面端同步服务

- [x] 2.1 ops-center-sync.js（fetch 目录 + 安全校验 + 错误分类）+ settings 加密存储
- [x] 2.2 model-provider-manager.applyCatalog（冲突语义 + governor 重应用）
- [x] 2.3 IPC handlers + bootstrap 接线 + 启动自动同步
- [x] 2.4 测试：sync 服务（成功/401/超时/大小）、applyCatalog（覆盖/不覆盖）、IPC

## 3. 前端

- [x] 3.1 ModelProviders.vue：同步区域 + 限流字段只读 + 模型列表已同步只读
- [x] 3.2 composable/测试 + vue build

## 4. 文档/记忆/交付

- [x] 4.1 PRD 7.4.4 / ops-center 12A 详细（数据校验/流程/交互/提示文案）+ CHANGELOG
- [x] 4.2 记忆更新 + 推送 + PR + 合并 + 归档（三同步）
