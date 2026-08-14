# 审查记录：fix-stale-token-401-redirect

## 审查方式（降级记录）
- 按 CCG 规范对 M 复杂度任务执行双模型审查：
  - antigravity：Eligibility check failed（当前地区不可用，与仓库历史记录一致）
  - claude CLI：连续两次 `exit 1`（分析 + 审查各一次，无输出）
- 依据机制硬化规则「子代理降级：后端不可用时立即降级为主代理执行」→ 本次由主代理完成自审。

## 自审结果

### 已修复（自审发现）
- **[Warning] `atob` 无填充 base64url 稳健性**（`stores/auth.js`）：严格模式下长度非 4 倍数的输入可能解码失败，导致有效 token 被误判过期。
  - 修复：补齐 `=` padding 后解码（`+ '='.repeat((4 - (b64.length % 4)) % 4)`），11 例测试覆盖回归后全绿。

### 审查结论（剩余）
- **0 Critical / 0 Warning**
- **Info 记录**：
  1. 客户端 exp 预检仅为 UX 提前拦截，后端 HS256 验签 + exp 仍是权威校验（代码注释已说明）。
  2. 无 exp 的旧 token 不做本地拦截，交由后端判定（兼容历史 token）。
  3. 登录请求走 `stores/auth.js` 的裸 axios（`/api/auth/login`），不经过统一客户端 401 拦截器，无重定向循环风险。
  4. 401 重定向为幂等操作（重复触发仅重复写同一 hash）。
  5. `package-lock.json` 仅新增依赖树（+904/-2），未改动既有依赖版本；`.npmrc` 记录 `legacy-peer-deps=true` 防止 npm 10.9.x arborist 崩溃复现。

## 回归保护
- `tests/auth-store.test.js`（8 例）：过期/有效/损坏/无 exp/损坏本地存储/无 token
- `tests/http-client.test.js`（3 例）：Bearer 注入、401 → 清理+跳转、非 401 不动
