# Stage 1.2 CCG 评审材料：AdapterRegistry 接线方案

**日期**：2026-09-02
**评审请求**：将 model-provider-manager.js 中的 61 个硬编码 require() 迁移到 AdapterRegistry 注册表

## 1. 背景

### 1.1 当前状态

`apps/desktop/electron/services/model-provider-manager.js`（1,212 行）中，61 个 Adapter 通过硬编码 `require('./adapters/xxx')` 加载，每个 Adapter 在需要时才实例化。这种模式有以下问题：

- **扇出过高**：61 个 require 调用，任一 Adapter 路径变更或模块缺失都会导致整个文件加载失败
- **无法动态扩展**：新增 Adapter 必须修改 model-provider-manager.js
- **测试困难**：无法独立测试单个 Adapter 的注册行为
- **与已有基础设施重复**：`adapters/_base/registry.js` 已实现 `AdapterRegistry` 类（注册/注销/按能力筛选/版本校验），`registry.test.js` 已有测试覆盖

### 1.2 目标状态

每个 Adapter 自注册到全局 AdapterRegistry，model-provider-manager.js 通过 registry 按需获取 Adapter 实例，不再硬编码单个 require。

## 2. 方案设计

### 2.1 架构变更

**当前**：
```
model-provider-manager.js
  ├── require('./adapters/openai')        → 静态加载
  ├── require('./adapters/anthropic')     → 静态加载
  └── ... (61 个)
```

**目标**：
```
model-provider-manager.js
  └── registry.getAdapter(id)             → 动态查找

adapters/openai.js
  └── registry.registerAdapter('openai', new OpenAIAdapter(config))  → 自注册

adapters/anthropic.js
  └── registry.registerAdapter('anthropic', new AnthropicAdapter(config))  → 自注册
```

### 2.2 实施步骤

1. **创建全局 registry 单例**（`adapters/_base/registry-singleton.js`）：导出共享的 `AdapterRegistry` 实例
2. **改造一个 Adapter 作为模板**（如 `openai.js`）：添加自注册逻辑
3. **批量迁移其余 60 个 Adapter**：每个文件末尾添加自注册
4. **改造 model-provider-manager.js**：移除硬编码 require，改用 registry
5. **更新测试**：确保所有现有测试通过

### 2.3 风险与缓解

| 风险 | 等级 | 缓解措施 |
|------|------|---------|
| 61 个 Adapter 同时变更，引入语法错误 | 高 | 分 PR 递进：先 registry singleton，再逐个 Adapter 迁移 |
| 自注册时机问题（require 时 registry 未初始化） | 中 | registry singleton 在 require 链的最早位置初始化 |
| 现有测试依赖 model-provider-manager 的 require 行为 | 中 | 迁移前先跑全量测试建立基线，逐步验证 |
| 循环依赖（registry singleton ↔ adapter） | 低 | registry singleton 是纯数据容器，不依赖任何 adapter |

### 2.4 测试策略

- 先跑全量测试建立基线（当前多少 passed）
- 每迁移一个 Adapter，跑对应 adapter 的测试
- 全部迁移完成后，跑全量测试确认无回归
- 新增 registry 集成测试：验证所有 Adapter 自注册成功

## 3. 决策点

| 决策点 | 推荐方案 |
|--------|---------|
| registry singleton 位置 | `adapters/_base/registry-singleton.js`（与 `registry.js` 同目录） |
| 自注册方式 | 每个 Adapter 文件末尾 `require('./registry-singleton').register(...)` |
| 迁移顺序 | 按字母序逐个迁移，每批 5-10 个，每批独立 PR |
| 回退策略 | 保留旧代码路径一期（双写），验证通过后删除旧代码 |

## 4. 评审请求

请 CCG 评审以下内容：
1. 方案是否合理？是否有更好的替代方案？
2. 风险缓解措施是否充分？
3. 迁移顺序是否合理？
4. 是否有遗漏的边界情况？

## 5. 验证结果（待补充）

- [ ] 迁移前基线测试结果
- [ ] registry.test.js 测试覆盖
- [ ] 迁移后全量测试结果
