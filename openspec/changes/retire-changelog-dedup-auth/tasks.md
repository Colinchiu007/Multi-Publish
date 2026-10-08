# Tasks：退役已消费的 CHANGELOG 去重授权

## 1. 判据实现

- [ ] 1.1 把退役判定抽成纯函数 `evaluateRetirement({ baseRawText, headRawText, authBaseText, authHeadText })`
      → `{ retired: boolean, reason: string, shape?: { baseTitles, headTitles, baseCopies } }`
      （`scripts/check-changelog-growth.js`，与 `evaluateAuthorization` 同级导出）
- [ ] 1.2 在默认判据红之后、授权通路之前接入（design 的判定流 3b）
- [ ] 1.3 通过时输出 `retired: true` + 形状计数

## 2. 测试（真实 blob 回放）

- [ ] 2.1 用例：base=`23822b73fecc` + head=`88669579b1dc`、均无授权文件 ⇒ 放行
- [ ] 2.2 用例：base 已是单副本形状 ⇒ 不触发（走默认判据）
- [ ] 2.3 用例：head 出现多副本 ⇒ 不放行
- [ ] 2.4 用例：base 含授权文件 ⇒ 不触发
- [ ] 2.5 用例：head 缺 base 的某标题 ⇒ 不放行
- [ ] 2.6 变异反证：①②③④ 逐条去掉，对应用例转红

## 3. 授权退役

- [ ] 3.1 删除 `scripts/changelog-dedup-authorization.json`
- [ ] 3.2 `check-changelog-growth.test.js` 中依赖该文件存在性的用例改为退役条款用例
      （既有 11 条默认判据断言一字不动）

## 4. openspec 收尾

- [ ] 4.1 `dedup-changelog-history/tasks.md` 追加收尾节：授权已消费、由本 change 退役
- [ ] 4.2 本 change 归档时同步标注 `dedup-changelog-history` 完成

## 5. 验证与记录

- [ ] 5.1 `node --test scripts/check-changelog-growth.test.js` 全绿（含新增用例）
- [ ] 5.2 变异反证记录（四条判据逐条去除断言转红）
- [ ] 5.3 用 PR #3076 的真实坐标（base `f210f191`/head `e94f1c18`）复放门禁，确认放行
- [ ] 5.4 执行记录 `openspec/records/` + CCG 双模型评审 + 行尾对账