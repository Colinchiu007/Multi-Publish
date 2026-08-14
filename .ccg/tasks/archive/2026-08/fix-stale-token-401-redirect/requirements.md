# 需求：修复运营后台"半登录态"缺陷

## 现象
- 打开页面不弹登录框直接进入主页；所有 `/api/v1` 接口返回 401「令牌无效」（后端 `middleware/auth.py` JWT 验签失败），提示词评测页报「加载评测列表失败：令牌无效」。

## 根因（第一性）
- `stores/auth.js` 的 `init()` 与 `router.beforeEach` 只检查 localStorage 是否有 `ops_token`，不校验有效性 → 旧/过期 token 直接放行进主页。
- 各 API 模块 401 拦截器只 `localStorage.removeItem`，不清理 Pinia 内存态、不跳转登录页 → 卡在半登录态。

## 修复方案
1. `stores/auth.js`：导出 `isTokenExpired()`，`init()` 时客户端预检 `exp`，过期/损坏 → 清理并视为未登录（后端 HS256 验签仍是权威，缺失 exp 交由后端判定）。
2. 新建 `src/api/http.js` 统一客户端：请求自动注入 Bearer；401 → `authStore.logout()` + 跳 `#/login`（Pinia 未初始化时兜底清理 + reload）。14 个 API 模块去重复用。
3. 引入 vitest + jsdom 回归测试 11 例（过期/有效/损坏/无 exp token、401 跳转、非 401 不动、Bearer 注入）。
4. `frontend/.npmrc` 固定 `legacy-peer-deps=true`（npm 10.9.x 解析 vitest 4 peer 崩溃）。

## 验收
- [x] 旧 token 打开页面 → 跳登录页
- [x] 中途 401 → 清理登录态并跳登录页
- [x] `npm test` 11/11 通过；`npm run build` 通过
