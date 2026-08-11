# Review — fix-appnavbar-identity-mock

## 审查方式
S 复杂度、低风险（测试 mock 修复，不改生产代码）。单文件 1 行 + 注释。自审即可。

## 审查结论
🔴 CRITICAL：0　🟠 MAJOR：0　🟢 MINOR：0

## 逐项核对
1. 根因：AppNavbar.test.js 的 useIdentity mock 返回 user: null（非 ref），IdentityMenu.vue:91 computed `user.value?.sub` 对 null 取 .value → TypeError。测试 mock 与组件契约不符（真实 useIdentity 返回 ref user）。
2. 修复：mock user 改为 `{ value: null }`（满足 .value 访问，组件判空为 false），并加注释说明。
3. 影响面：grep 确认仅 AppNavbar.test.js 使用 useIdentity（composable）mock；其它文件为 useIdentityStore mock（形状不同且测试通过）。
4. 验证：AppNavbar.test.js 3/3 通过；src 全量 118 文件 1904/1904 全绿（修复前 1901/1904）。
5. 该修复同时消除 main CI 的一个既有失败源（gui-test / gui 相关单元测试）。
