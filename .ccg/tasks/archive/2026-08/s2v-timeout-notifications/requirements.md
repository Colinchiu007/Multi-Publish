# Story2Video 长成片超时与通知修复

## 门禁评估

- 变更类型：Bug 修复 + 性能预算 + 前端错误提示 + 文档同步。
- 复杂度：M（Electron 主进程、renderer 通知、双语 locale、规格与 PRD）。
- 风险：中（改变现有 ffmpeg 子进程超时行为，但不改变 50 分钟产品上限）。
- 路由：质量节拍 Phase 2，执行 QM-5、TDD、OpenSpec、审查、打包与 PR。

## 基线差异审计

### 已交付

- Story2Video 成片与旁白总时长默认上限已调整为 50 分钟。
- 成片、旁白、单段时长预检及动态分钟文案已存在。
- xfade 合并与单片段编码已有按输出时长估算的动态超时。

### 待办

- concat、旁白合并、BGM 混音、WebM 转码、输出完整解码校验仍使用固定超时。
- xfade 动态超时缺少最高上限。
- Story2Video renderer 未识别成片/旁白时长超限、单段旁白超限及合成阶段超时，仍回退通用文案。
- PRD、视频创作 PRD、CHANGELOG、learnings 与质量门禁记录需同步。

### 待确认

- 无。采用现有“按媒体时长估算 + 最小/最大边界”的仓库模式。

## QM-5

1. 第一性原因：`e39e22cfa` 首次加入 concat 60s；`e1b46eba0fe7bf08b85961f4b71549ba0d983ab1` 补齐旁白/BGM/WebM/校验时加入 120s/120s/180s/60s，均未建立输入规模合同。`fed08eed979587eaa1f83df3a5faa1583e3315c5` 建立通知模型时只覆盖当时已知错误，其余有意回退通用文案。
2. 逃逸分析：单元测试 mock 掉耗时方法；真实 ffmpeg 集成仅覆盖约 0.25-4 秒短媒体；E2E 未覆盖接近 50 分钟输出；审查缺少“所有耗时 ffmpeg timeout 随媒体规模变化”和“合成错误必须映射稳定通知 key”检查项。
3. 系统性漏洞：测试场景缺失 + 审查盲区；`feffc5daee5a82e34d35b576b15a7ccfaa7ebfd7` 只局部修复片段编码，没有统一下游预算。
4. 回归保护：在 compose engine 单测覆盖 helper 下限/上限/非法时长/50 分钟预算及调用参数；在 notification 单测覆盖中英文总时长、单段时长、四类合成超时和未知错误脱敏回退。
5. 预防措施：PRD 与 `.quality-gates.md` 增加动态 ffmpeg 预算合同；`01-docs/learnings.md` 沉淀统一规则；OpenSpec 场景映射测试。

## 验收标准

- 50 分钟成片在 WebM 转码、旁白、BGM 与输出校验路径获得随时长增长且有上限的预算。
- 短片保持原最小预算；无效时长 fail-safe 回退最小预算；所有动态预算有硬上限。
- 时长超限和合成超时显示 zh/en 专属友好文案，不泄漏 ffmpeg stderr、文件路径或命令。
- 定向测试、locale/CJK 门禁、Vite build、Electron 打包与 OpenSpec validate 通过。
- 分支推送并创建 PR，记录远程状态。
