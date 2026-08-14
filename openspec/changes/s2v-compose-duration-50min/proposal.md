# Proposal: s2v-compose-duration-50min

## Why

Story2Video 流水线的视频合成（compose）把成片总时长硬限制为 10 分钟、旁白音频总时长上限 15 分钟，且该上限未在 PRD/OpenSpec 契约中声明。真实用户输入 3752 字被拆成 68 个分镜、TTS 总时长 709.6s（≈11.8 分钟）时，compose 预检直接失败并返回「成片总时长不能超过 10 分钟」；前端没有该错误的映射，回退显示通用文案「当前操作未能完成，请稍后再试」，从断点重试因素材不变而必然再次失败。产品需要支持最长 50 分钟的成片。

## What Changes

- **BREAKING（上限变更）**：compose 成片总时长上限从 10 分钟提升到 50 分钟（`DEFAULT_MAX_DURATION_SECONDS` 600s → 3000s）。
- **BREAKING（旁白上限对齐）**：旁白音频总时长上限从 15 分钟提升到 50 分钟（`DEFAULT_MAX_AUDIO_DURATION_SECONDS` 900s → 3000s），与成片上限一致，避免长成片被旁白预检提前拦截。
- 时长类错误文案改为按实际配置动态生成，不再硬编码「10 分钟 / 15 分钟 / 3 分钟」。
- 单段旁白 3 分钟上限保持不变，仅文案动态化。
- PRD 补充成片/旁白 50 分钟上限合同。

## Capabilities

- **New Capabilities**:
  - `story2video-compose-duration-limit` — 成片与旁白总时长上限、预检时机与错误文案契约。

## Impact

- `apps/desktop/electron/services/story2video-compose-engine.js`（上限常量与错误文案）
- `apps/desktop/electron/services/story2video-compose-engine.test.js`（断言更新 + 边界用例）
- `01-docs/PRD.md`（视频合成时长合同）
