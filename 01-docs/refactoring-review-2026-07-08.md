# 重构方案审查报告

> 审查对象: 另一 AI 的《Multi-Publish 全面深度重构方案（v2）》
> 审查框架: 质量节拍 Phase 1.1（架构审查）+ Phase 2 ④（上下文完整性审查）
> 审查日期: 2026-07-08
> 审查者: Codex

---

## 一、数据准确性校验

| 方案中数据 | 声明的值 | 实际值 | 状态 |
|-----------|---------|--------|------|
| 测试总数 | 1125+ | 1367 | 少 242 个 |
| video_compose 测试覆盖 | 0% | 28% 覆盖，21 例 | 已测试，非裸拆 |
| container.ts 未使用 | 有 eslint-disable | container.setup.js 已注册 25 服务，但 main.js 未使用 | 部分准确 |
| 文档双源不同步 | PRD 差 5.7KB | 已部分同步(v2.2.5 -> v2.3.40) | 部分过时 |
| 9 个冗余目录 | 待删除 | 部分已清理(tests/ 已迁移) | 部分过时 |
| flutter-skill-electron 路径 | apps/desktop/electron/services/ | packages/flutter-skill-bridge/ | 路径错误 |
| client.py 路径 | multi_publish/wechat_publisher/ | src/wechat_publisher/ | 路径错误 |
| 巨石 JS(1314/908/690) | 吻合 | 全部吻合 | 准确 |

## 二、结构合理性评估

### 做得好
- 测试铁律(不动断言/签名) -> 最高优先级保障
- 分阶段执行 + 依赖关系图清晰
- Python 基线强制(-q --tb=no)
- "不做什么"排除清单实用
- __init__.py re-export 保持兼容性

### 关键问题 1: Phase 3 DI 容器方向偏差

方案说"让 container.setup.js 真正生效",但 container.setup.js 已经写好了(25 个服务注册 + assertRequired)。真正的问题是 main.js 没有消费它——main.js 直接 new RpaViewManager() 而不走 container.get('rpaViewManager')。

**修正方向**: 不是"接入 DI 容器",而是"让 main.js 使用已有容器"

需要:
- main.js 创建 container 后,从 container.get(...) 获取服务
- 逐步替换 main.js 中的 25+ 处直接 new ...()
- 拆 main.js 为 bootstrap.js / window.js / shutdown.js

### 关键问题 2: 遗漏质量节拍嵌入

每个 PR 必须走质量节拍日常循环,方案中完全没有说明每个 PR 的质量验证流程。

### 关键问题 3: OpenMontage 视频生成未纳入

之前用户明确要求将 OpenMontage 的视频生成能力作为核心功能集成。方案 Phase 5 只说要"拆 video_compose",但没有说明这些模块是产品核心竞争力的技术基础。

### 关键问题 4: DI 容器测试缺失

container.setup.js 已有 25 个注册 + assertRequired,但方案说"补 container.setup.test.js(若无)"——这应该是"补"而不是条件判断。

## 三、分阶段评审

| 阶段 | 评审结论 | 建议 |
|------|---------|------|
| 1. 文档治理 | 合理 | 部分工作已完成,需先核对现状 |
| 2. 清理 TS 死代码 | 合理 | 25 .ts 文件确认存在,删除无风险 |
| 3. DI 容器 + 拆 main.js | 方向需调整 | 见关键问题 1 |
| 4. 拆 JS 巨石 | 合理 | 路径需修正为 packages/flutter-skill-bridge/ |
| 5. Python 拆分 | 前置条件过时 | video_compose 已有 21 测试,可先拆后补 |
| 6. 工程化统一 | 合理 | vitest 迁移、ESLint 根目录、madge 循环检测 |
| 7. 发布收口 | 合理 | 需补充 quality-summary 和 learnings 归档 |

## 四、高优先级修正建议

1. 更新基线数据: 测试 1367、video_compose 28%、目录清理状态
2. Phase 3 重写: 方向改为"让 main.js 消费已有容器",而非"创建容器"
3. 每 PR 嵌入质量节拍: 在验收标准中增加 daily cycle
4. Phase 5 增加 OpenMontage 集成说明

## 五、总体评分

| 维度 | 评分 | 说明 |
|------|------|------|
| 结构完整性 | 4/5 | 阶段划分清晰,依赖明确 |
| 数据准确性 | 3/5 | 5/8 数据偏差,部分过时 |
| 风险覆盖 | 4/5 | 测试铁律、回滚方案好 |
| 质量流程 | 2/5 | 缺质量节拍嵌入 |
| 可执行性 | 3/5 | 13 PR/2-3 周偏激进 |
| 总分 | 3.2/5 | |

**结论**: 批准执行,但需优先修复上述 4 个高优先级问题。建议先从 Phase 1(文档)+ Phase 2(TS 死代码)开始,这两个阶段零风险、不与现有工作冲突。
