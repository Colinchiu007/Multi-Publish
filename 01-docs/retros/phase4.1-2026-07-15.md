# Phase 4.1 质量体检 — 全项目健康度评估

**日期**: 2026-07-15 | **项目**: Multi-Publish | **阶段**: 质量节拍 Phase 4.1

---

## 目标

在 Phase 5.1 零失败基线基础上，执行全项目质量体检，评估 6 大维度健康度，识别改进机会。

## 成果

| 维度 | 评分 | 状态 |
|------|------|------|
| Type check (tsc) | 10/10 | ✅ CLEAN |
| Tests JS (vitest) | 9.5/10 | ⚠️ 1 偶发 timeout |
| Tests Python (pytest) | 9/10 | ⚠️ 3 预存失败 |
| Lint (ruff) | 9/10 | ⚠️ 8 unsorted-imports |
| Circular deps (madge) | 10/10 | ✅ CLEAN |
| Dead code (depcheck) | 7/10 | ⚠️ 4 unused deps |
| Security (npm audit) | 6/10 | ⚠️ 6 high CVE |

**Composite Score: 8.7 / 10** (较 07-11 基线 8.6 ↑0.1)

## 关键发现

### 1. TSC 类型检查满分 (10/10) ✅

Phase 5.1 修复 test-setup.js mock 路径匹配 bug 后，TSC 维持零错误。

### 2. JS 测试接近满分 (9.5/10) ⚠️

- 1981/1992 passed, 10 skipped, 1 偶发 timeout
- IntelligenceView 测试全量跑时 timeout (10000ms)，单独跑 6048ms 通过
- 根因：环境资源竞争，非代码 bug
- 建议：提高 timeout 到 30000ms 或限制 vitest 并发数

### 3. Python 测试 3 个预存失败 (9/10) ⚠️

与 07-11 基线完全一致，属历史技术债务：
- test_crypto.py (2 failed): CredentialCrypto._salt 属性不存在 (API 变更未同步测试)
- test_hf_html_gen.py (1 failed): Windows 路径分隔符 `\` vs `/` 不匹配

### 4. 安全漏洞减半 (6/10 → 较基线 14→6) ⚠️

6 个 high vulnerabilities：
- electron <=39.8.4 (多个 CVE)
- form-data 4.0.0-4.0.5 (CRLF injection)
- tar <=7.5.15 (路径遍历) → @mapbox/node-pre-gyp → canvas → resemblejs 链

npm audit fix 可非破坏性修复 form-data。Electron 升级需单独处理。

### 5. 零循环依赖 (10/10) ✅

madge 扫描 309 文件，零循环依赖。架构健康。

## 改进优先级

### P3 短期 (1-2 周)
1. 修复 IntelligenceView 测试 timeout
2. 修复 Python test_crypto.py (2 失败)
3. 修复 Python test_hf_html_gen.py (1 失败)
4. 清理 4 个真实未使用依赖
5. `ruff check --fix` 自动修复 import 排序

### P4 中期 (1 月)
6. Electron 升级 (解决 6 CVE)
7. npm audit fix (form-data)
8. 评估 resemblejs 降级到 3.2.5

## 下一步

Phase 4.1 完成。可进入：
- **Phase 5.2** 性能优化 (/benchmark)
- **Phase 5.4** 安全运营 (/cso daily) — 处理 6 个 CVE
- **Phase 2** 启动 P3 技术债务清理循环
- 或 **Phase 0/1** 新功能开发

---

*生成工具: 质量节拍 Phase 4.1 /health | 评分: 8.7/10*
