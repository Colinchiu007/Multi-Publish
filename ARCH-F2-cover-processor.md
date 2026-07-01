# 封面图自动处理 — 技术方案

> **架构师**: PROJECT-003 | **日期**: 2026-06-13
> **依赖**: PM-PRD-v1.1.md F2

---

## 一、方案对比

### 方案 A：sharp 库处理

```javascript
const sharp = require('sharp')
await sharp(input)
  .resize(width, height, { fit: 'cover' })
  .jpeg({ quality: 85 })
  .toFile(output)
```

| 维度 | 评分 |
|------|:----:|
| **性能** | ⭐⭐⭐⭐⭐（C++ 原生，极快） |
| **格式支持** | ⭐⭐⭐⭐⭐（JPEG/PNG/WebP/AVIF） |
| **安装体积** | ⭐⭐（~25MB 原生模块） |
| **推荐** | ✅ **采纳** |

### 方案 B：jimp 纯 JS 库

| 维度 | 评分 |
|------|:----:|
| **性能** | ⭐⭐（纯 JS，慢 10x） |
| **安装** | ⭐⭐⭐⭐⭐（纯 JS，无原生编译） |
| **推荐** | ❌ 太慢，大图处理会阻塞主进程 |

### 方案 C：canvas API（Electron 内置）

| 维度 | 评分 |
|------|:----:|
| **性能** | ⭐⭐⭐⭐（Chromium 内置） |
| **限制** | ⭐⭐（需要 BrowserWindow，不能纯后端） |
| **推荐** | ❌ 只能 Electron 环境用，不能纯 Node 测试 |

**结论**：方案 A，用 **sharp** 库处理。

---

## 二、详细设计

### 2.1 文件结构

```
packages/shared-utils/src/
  cover-processor/
    index.js          ← 入口：processCover(inputPath, platform, outputDir)
    presets.js        ← 各平台封面预设（尺寸/格式/质量）
```

### 2.2 核心接口

```javascript
// index.js
async function processCover(inputPath, platform, outputDir) {
  // 1. 读取原图
  // 2. 获取平台预设（尺寸、格式、质量）
  // 3. 裁剪到目标比例（中心裁剪 fit: cover）
  // 4. 压缩到大小限制内（二分法 quality 调整）
  // 5. 输出到 outputDir
  // 6. 返回 { path, width, height, size, format }
}
```

### 2.3 数据流

```
输入图片 (任意尺寸/格式)
    │
    ├─ 1. 读取元数据 (sharp.metadata)
    │
    ├─ 2. 中心裁剪到目标比例
    │     例: 输入 2000×1500 → 目标 900×500 → 裁剪 2000×1111 → resize 900×500
    │
    ├─ 3. 格式转换 (PNG→JPEG 等)
    │
    ├─ 4. 质量压缩 (quality从90向下调整到满足大小限制)
    │
    └─ 5. 输出 + 返回结果
```

### 2.4 平台预设（presets.js）

```javascript
const PRESETS = {
  wechat_mp: { width: 900, height: 500, format: 'jpeg', maxSize: 10 * 1024 * 1024, quality: 85 },
  zhihu:     { width: 1280, height: 720, format: 'jpeg', maxSize: 5 * 1024 * 1024, quality: 85 },
  weibo:     { width: 980, height: 550, format: 'jpeg', maxSize: 20 * 1024 * 1024, quality: 85 },
  douyin:    { width: 1080, height: 1440, format: 'jpeg', maxSize: 20 * 1024 * 1024, quality: 85 },
  xiaohongshu: { width: 1080, height: 1080, format: 'jpeg', maxSize: 10 * 1024 * 1024, quality: 85 },
  // ...
}
```

### 2.5 TDD 测试策略

| 测试 | 说明 |
|------|------|
| 裁剪比例 | 输入 4:3 → 目标 16:9 → 输出准确 |
| 格式转换 | PNG 输入 → JPEG 输出 |
| 大小限制 | 超大图片压缩到 ≤maxSize |
| 失败处理 | 损坏图片 → 返回错误，不崩溃 |
| 空输入 | 空路径/不存在文件 → 错误提示 |

---

## 三、与 F1 的集成

```
F1 输出 { title, content, coverSize: '900x500' }
              ↓
F2 读取 coverSize → 匹配 PRESETS 预设 → 处理封面图
              ↓
F3 发布时使用处理后的封面图
```

## 四、风险

| 风险 | 应对 |
|------|------|
| sharp 安装失败（原生编译） | 降级为 jimp |
| 超大原始图片（>50MB） | 限制输入大小，超时处理 |
| 格式不支持 | 统一转为 JPEG |

---

> **请 CEO 确认**：方案 A（sharp）是否接受？
