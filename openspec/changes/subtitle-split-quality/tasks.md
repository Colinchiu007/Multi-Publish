## 1. 规格与测试

- [x] 1.1 完成在线/本地根因审计并记录用户样例复现输出
- [x] 1.2 在 Electron 分句合同测试中补充用户样例、本地短语边界、在线坏边界、在线错序和在线合法结果
- [x] 1.3 在共享向量中加入用户样例，锁定 TS/JS 输出与短语边界不变量

## 2. 实现

- [ ] 2.1 将共享 no_cut_bigrams 语义泛化为任意长度短语，并加入“蒙古”“江南”“包税人”“大汗”规则
- [ ] 2.2 同步 TypeScript 与 Electron JS 镜像的短语边界检查
- [ ] 2.3 在在线字幕归一化前增加顺序覆盖和短语边界质量门，坏场景整体回退并记录原因
- [ ] 2.4 同步 smart-sentence-splitter 规则副本与对应 Python 回归测试
- [x] 2.1 将共享 no_cut_bigrams 语义泛化为任意长度短语，并加入“蒙古”“江南”“包税人”“大汗”规则
- [x] 2.2 同步 TypeScript 与 Electron JS 镜像的短语边界检查
- [x] 2.3 在在线字幕归一化前增加顺序覆盖和短语边界质量门，坏场景整体回退并记录原因
- [x] 2.4 同步 smart-sentence-splitter 规则副本与对应 Python 回归测试

## 3. 验证与交付

- [ ] 3.1 运行 MP 字幕定点测试、TS/JS parity、sidecar 向量测试和规则同步检查
- [ ] 3.2 执行 node scripts/verify-worktree-deps.js 与 Electron QM-1 打包验证
- [ ] 3.3 完成双模型审查、QM-5 逃逸复盘、提交并记录 remoteStatus
- [x] 3.1 运行 MP 字幕定点测试、TS/JS parity、sidecar 向量测试和规则同步检查
- [x] 3.2 执行 node scripts/verify-worktree-deps.js 与 Electron QM-1 打包验证
- [x] 3.3 完成双模型审查、QM-5 逃逸复盘、提交并记录 remoteStatus
