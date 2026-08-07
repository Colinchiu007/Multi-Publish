---
title: "Story2Video 重复错误提示、场景上限与未本地化文案"
date: 2026-08-02
type: bug-reflection
---

## 问题

- 现象：Story2Video 执行失败时，同一错误同时出现在页面红色错误条和应用内弹窗；截图中的 `60` 场景限制错误为英文技术文本。
- 预期：错误只显示一次，使用用户可理解的默认中文文案；用户切换英文后显示对应英文文案。Story2Video 不按场景总数拒绝，只允许最多 6000 个 Unicode 字符的文案输入。
- 复现：在 Story2Video 输入能分为 61 个以上场景的长文案后开始生成；或使编排 API 返回失败。

## 根因（5 Whys）

1. 为什么用户同时看到红色错误条和弹窗？因为 `setOrchestrationError()` 同时写入 `orchestrationError` 和打开 `UiModal`。
2. 为什么同一状态被两个 UI 表面消费？因为原实现没有定义 Story2Video 通知的单一呈现渠道。
3. 为什么用户会看到英文技术错误？因为 renderer 直接显示后端/服务商返回的 `message`，没有稳定的用户提示键。
4. 为什么有 60 场景限制？因为路径安全常量被当成了产品输入限制，并在 optimize、资源生成和合成三层重复拒绝。
5. 为什么没有在输入处限制 6000 字符？因为文本合同沿用了通用 `String.length <= 20000`，未定义 Story2Video 专属 Unicode 边界和前后端统一校验。

**根因**：缺少“稳定通知键 + 本地化文本 + 单一呈现渠道”的 UI 合同，且将场景数组保护误设为产品限制，未在版本化文本合同中定义 Story2Video 的 Unicode 输入边界。

## 漏测分类

- PRD 缺口：是。未声明错误只能有一个呈现表面、默认中文/中英同步，以及“文本上限而非场景上限”。
- 代码缺陷：是。存在三处场景计数拒绝和直接透传底层文案。
- 测试缺口：是。缺少 modal 与 inline 同时渲染、6000/6001 Unicode、61 场景通过和 locale 回退用例。
- 流程缺口：是。评审清单未要求 Story2Video 通知使用稳定 message key，测试只覆盖单一失败返回。

## 推荐测试级别

- 单元测试：通知键解析、中文/英文回退、Unicode 6000/6001 边界。
- 状态覆盖测试：失败时只有 modal、无页面内错误条；未知英文技术错误显示友好本地化文案。
- 集成合同测试：61 个场景跨越 optimize/generate_assets/compose 的旧拒绝点，仍保留资源边界拒绝。

## 改进措施

- [P0] 代码：建立 `messageKey + params` 通知模型并在 CreateView/ResultView 统一使用；原始错误仅用于日志。
- [P0] 代码：在 `normalizeStory2VideoTextParams()` 使用 `Array.from()` 校验 6000 Unicode 字符，且删除所有 `MAX_SCENES` 拒绝。
- [P1] 测试：先 RED 后 GREEN 覆盖双语、单一呈现渠道、Unicode 边界和 61 场景。
- [P1] PRD：在 Story2Video 验收说明补充上述体验合同。
- [P2] Review Checklist：在 `.quality-gates.md` 加入 Story2Video 通知、本地化和输入/场景边界检查。

## 7 阶段回流映射

- Stage 2 (PRD)：需要更新验收标准。
- Stage 5 (TDD)：需要完成 RED → GREEN 测试。
- Stage 6 (评审)：需要更新质量检查项；外部双模型审查因私有代码外发风险未获授权而被策略阻断，改用本地审查并如实记录。

## 执行状态

- [x] 失败测试已写（RED 确认）
- [x] 代码修复（GREEN）
- [x] 回归测试全绿
- [x] PRD 同步
- [x] Review Checklist 更新
- [x] 任务归档
