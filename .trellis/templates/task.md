# Trellis 任务模板

```json
{
  "id": "<task-id>",
  "title": "<任务标题>",
  "status": "in_progress",
  "complexity": "S|M|L+",
  "risk": "low|medium|high",
  "domain": "<backend|frontend|release|docs|security|ops>",
  "currentPhase": "analysis|planning|implementation|review|completed",
  "nextAction": "<下一步要做什么>",
  "createdAt": "<YYYY-MM-DDTHH:mm:ssZ>",
  "branch": "<git-branch-name>"
}
```

## 任务摘要

- 一句话说明这个任务要解决什么
- 一句话说明为什么现在要做

## 范围

- 这次要改哪些文件或模块
- 哪些文件明确不动

## 依赖

- 上游依赖
- 外部服务依赖
- 需要先确认的前置条件

## 实施步骤

1. 先确认现有代码和规范
2. 再写最小改动方案
3. 再实施
4. 再验证

## 验收标准

- 功能描述清楚
- 变更范围清楚
- 验证方式清楚
- 回滚方式清楚

## 风险与回滚

- 最坏会出什么问题
- 出问题时怎么退回

## 结论记录

- 完成时间
- 最终验证结果
- 需要补回规范的点
