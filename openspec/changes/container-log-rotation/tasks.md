## 1. compose 轮转配置（R1）

- [x] 1.1 `packages/api-publish-engine/docker-compose.yml`：publish-api 加 logging 轮转
- [x] 1.2 `deploy/logto/docker-compose.yml`：postgres + logto 加 logging 轮转
- [x] 1.3 `deploy/logto/docker-compose.monitoring.yml`：blackbox/prometheus/alertmanager 加 logging 轮转

## 2. 契约测试

- [x] 2.1 `logto-deploy-contract.test.js` 补断言：logto/postgres/publish-api 的 logging.driver + options；monitoring compose 断言
- [x] 2.2 `docker compose config` 语法校验（可选本地）

## 4. Claude 审查修复

- [x] 4.1 契约断言语义化（String() 归一化，接受 50M/50MB、数字 5 等 Docker 合法写法）
- [x] 4.2 可读守卫（options/服务缺失时给中文断言而非 TypeError）
- [x] 4.3 spec 补作用域说明（仅 Compose 容器；systemd/journald 豁免）

## 3. 验证与交付

- [x] 3.1 logto-deploy-contract.test.js + 相关 production 测试通过
- [x] 3.2 `openspec validate container-log-rotation` 通过
- [ ] 3.3 提交、推送、PR、合并、三同步归档（含 learnings + 文档门禁同步）
