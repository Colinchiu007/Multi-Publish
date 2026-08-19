## 1. 规格与数据合同

- [x] 1.1 完成基线差异审计，确认 {sceneText} 在失败消息链路中的泄漏点及既有已交付能力边界
- [x] 1.2 定义 context、provider 和 provider 安全回退合同（对应 apps/desktop/src/utils/provider-name-map.js）

## 2. 实现与本地化

- [x] 2.1 在流水线 formatter 中移除 sceneText 参数并输出自然语言 context
- [x] 2.2 在 renderer 通知归一化中解析中英文场景号、provider 和素材生成上下文
- [x] 2.3 更新 zh/en 的限流、额度、空结果、素材生成、API Key 失败文案，明确具体模型账号

## 3. 测试与文档

- [x] 3.1 补充已知/未知 provider、双语言、二次格式化和技术细节脱敏回归测试
- [x] 3.2 更新视频创作 PRD、流水线页面 UX PRD、CHANGELOG 和 QM-5 learnings
- [x] 3.3 完成本地构建、文案同步和降级审查；远端 PR 合并核验在交付阶段完成
