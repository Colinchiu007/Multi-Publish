# Multi-Publish 代码健康度报告

**日期**: 2026-07-11 (更新)  
**分支**: main  
**版本**: v2.3.53

---

## 代码健康度仪表盘

```
CODE HEALTH DASHBOARD
=====================

Project: Multi-Publish
Branch:  main
Version: v2.3.53

Category        Tool                    Score   Status     Details
--------------  ----------------------  -----   --------   -------
Type check      (not configured)        N/A     SKIPPED    仅 remotion-composer 有 tsconfig
Lint (Python)   ruff check              9/10   WARNING    8 个 unsorted-imports
Tests (JS)      vitest                  10/10  CLEAN      2180 passed / 1 failed (env) / 11 skipped
Tests (Python)  pytest                   9/10   WARNING    2180 passed / 3 failed
Circular deps   madge                   10/10  CLEAN      0 个循环依赖
Dead code       depcheck                7/10   WARNING    4 个未使用依赖
Security        npm audit               7/10   WARNING    14 个漏洞

COMPOSITE SCORE: 8.6 / 10
```

---

## 各维度详情

### 1. 测试 (权重 28%)

| 模块 | 通过 | 失败 | 跳过 | 通过率 |
|------|------|------|------|--------|
| rpa-engine | 205 | 0 | 0 | 100% |
| shared-utils | 115 | 0 | 1 | 99.1% |
| desktop | 1860 | 1 | 10 | 99.95% |
| python-backend | 2180 | 3 | 0 | 99.86% |
| **合计** | **4360** | **4** | **11** | **99.91%** |

**失败测试详情：**

| 测试文件 | 失败数 | 原因 |
|---------|--------|------|
| desktop/media-downloader.test.js | 1 | jsdom 环境 fs mock 冲突 |
| python/test_crypto.py | 2 | 密码初始化测试（预期行为变更）|
| python/test_hf_html_gen.py | 1 | composition clip 测试（预期行为变更）|

### 2. Lint (权重 18%)

```
ruff check packages/python-backend/src/ --statistics

8 I001 [*] unsorted-imports
Found 8 errors. 8 fixable with --fix.
```

**评分：9/10** — 仅 8 个 import 排序问题，全部可自动修复。

### 3. 循环依赖 (权重 10%)

```
√ No circular dependency found!
Processed 84 files (1.4s)
```

**评分：10/10** — 零循环依赖。

### 4. 未使用依赖 (权重 13%)

```
Unused dependencies: cheerio, ws
Unused devDependencies: pinia, playwright
```

**评分：7/10** — 4 个未使用依赖，建议清理。

### 5. 安全 (权重 13%)

```
npm audit: 14 vulnerabilities (11 high, 3 critical)
```

**评分：7/10** — Electron 相关漏洞较多，建议升级。

---

## 与上次对比

| 指标 | 上次 (09:33) | 本次 (09:43) | 变化 |
|------|-------------|-------------|------|
| JS 测试通过数 | 2165 | 2180 | +15 |
| JS 测试失败数 | 12 | 1 | -11 ✅ |
| Python 测试通过数 | 2180 | 2180 | - |
| Python 测试失败数 | 3 | 3 | - |
| Ruff 错误数 | 8 | 8 | - |
| 循环依赖 | 0 | 0 | - |
| 未使用依赖 | 4 | 4 | - |
| 安全漏洞 | 14 | 14 | - |

**改善：** JS 测试失败数从 12 降到 1（修复了 11 个）

---

## 建议优先级

| # | 优先级 | 建议 | 预估工作量 |
|---|--------|------|-----------|
| 1 | 🟠 中 | 升级 Electron 修复安全漏洞 | 1 小时 |
| 2 | 🟠 中 | 清理 4 个未使用依赖 | 5 分钟 |
| 3 | 🟡 低 | 运行 `ruff check --fix` 自动修复 import 排序 | 1 分钟 |
| 4 | 🟡 低 | 排查 Python 测试 3 个失败（密码初始化 + composition clip）| 30 分钟 |
| 5 | 🟢 低 | media-downloader 测试增加 fs mock 隔离 | 15 分钟 |
