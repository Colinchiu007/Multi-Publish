{
  "schemaVersion": 1,
  "issues": [
    {
      "id": "i1",
      "severity": "Critical",
      "dimension": "consistency",
      "finding": "P0-2（M-2）的处置在三处互相矛盾：§2.3 仍写「倾向 (a)」持引用；§4 第 5 步写「需先定 (a)/(b)」；§11.1 已结论选 (b) 别名表。这正是 v2 被判 Critical 的「三处矛盾」同类问题，而 v3 头部声称已修正。实现者按 §2.3 落地会违反方案自己采纳的单一真相源纪律。",
      "suggestion": "将 §2.3 改为直接引用 §11.1 的结论 (b) 并删除倾向表述；§4 第 5 步改为「按 §11.1 已决策 (b) 实施」；三处口径统一为同一结论。"
    },
    {
      "id": "i2",
      "severity": "Critical",
      "dimension": "consistency",
      "finding": "M-5（P0-4）的修复规格自相矛盾且有设计缺陷：§2.5 示例代码仍是裸 console.error(message, err)，而 §9.3 i9 已明确「不采用裸 console.error 进生产」、§10.1 写「脱敏」；同时 §10.1 的「成功即重置闸门」意味着第一次 IPC 失败后 reporting 闸门永不复位，后续所有错误上报被永久静默。",
      "suggestion": "改写 §2.5 为项目 logger 加脱敏并删除裸 console.error 示例；闸门改为在 finally 中复位或每次调用独立处理，不使用跨调用粘滞布尔；验收标准增加「单次上报失败不得永久关闭上报」的可检查断言。"
    },
    {
      "id": "i3",
      "severity": "Warning",
      "dimension": "consistency",
      "finding": "M-4 失败阈值两处不一致：§2.4 写「达 3~5 次即停止」，§11.4 已改为「10 次（约 20 秒）」，但 §2.4 未标注被取代。只读 §2 修复方案的实施者会按 3~5 次实现。",
      "suggestion": "在 §2.4 就地更新为 §11.4 的 10 次口径，或显式标注「失败阈值与恢复策略以 §11.4 为准」。"
    },
    {
      "id": "i4",
      "severity": "Warning",
      "dimension": "consistency",
      "finding": "评审意见编号跨轮冲突且不完整：§10.4 引用「评审 i7」指 m-11 去重，但 §9.2 的 i7 是 P0-2 (a)/(b)；§11.2 引用 i8 指 M-6 阈值，但 §9.2 的 i8 是 P0-1 调用方核对；§11.2 与 §11.4 引用的 i13、i14 在全文从未定义；第 2 轮的 14 条问题清单整体缺失，无法核对回应完整性。",
      "suggestion": "为评审意见加轮次前缀（如 r1-i8、r2-i14），并在 §10 之前附第 2 轮 14 条问题的完整清单，保证每条引用可追溯到原始意见。"
    },
    {
      "id": "i5",
      "severity": "Warning",
      "dimension": "consistency",
      "finding": "§8「待决策项」与正文已做出的决策冲突：第 1 项问 M-6 是否排最前（§3.1 与 §4 已定为第 0 步）；第 2 项问 P0-2 (a)/(b)（§11.1 已定 (b)）；第 4 项问回归测试位置（§3.3 已定迁模块旁并删目录）；第 5 项问 P0-5 是否降级（§10.1 已列 A 类第 4 步）。",
      "suggestion": "将 §8 改写为决策记录：逐项列出结论、依据与替代方案被否的原因；已被正文回答的问题不再以开放决策形式保留。"
    },
    {
      "id": "i6",
      "severity": "Info",
      "dimension": "clarity",
      "finding": "§10 对账口径有未声明例外：§10.4 表头写「13 条 + 1 项」且实际列出 14 行（含附录 A.3），§10.5 只按 13 条计算并宣布合计 28 与 100%；全部列出的行数实际为 29，占比 46.4% 的分母排除了附录项但未在 §10.5 说明，与「精确对账」声明相比留有歧义。",
      "suggestion": "在 §10.5 增加一行或脚注：「报告外附录 1 项，不计入 28 条与占比分母」，使行数、占比与声明完全自洽。"
    },
    {
      "id": "i7",
      "severity": "Warning",
      "dimension": "feasibility",
      "finding": "契约测试取数口径前后不一致且缺一种形态：§2.1 写「遍历 src/api/ 全部导出方法名」断言暴露面，§12 却按 invokeWithFallback 通道字符串（扁平/命名空间）与 bridgeOn 事件三种形态映射；导出名与通道名不是同一目标。§9.2 i5 统计的 40 处直调 getApi()/api.* 的导出在 §12 三种形态中没有对应映射规则，无法按现规格被断言。",
      "suggestion": "统一为按调用通道字符串提取并改写 §2.1 描述；为 getApi 直调形态补充静态提取规则，或将其明确列入豁免清单并逐项写明理由。"
    },
    {
      "id": "i8",
      "severity": "Warning",
      "dimension": "completeness",
      "finding": "契约测试只校验 src/api 声明能在 preload 暴露面找到，不校验 preload 内 invoke 的通道字符串与主进程 ipcMain.handle 注册一致；通道字符串拼写错误这类同类缺陷仍不会被拦截，而 §4 声称契约测试「会长期拦住同类缺陷」，覆盖声明强于测试实际能力。",
      "suggestion": "在同一契约测试中增加通道名与主进程 handler 注册清单的比对；若本轮不做，则在方案中显式声明该缺口并列为后续独立任务。"
    },
    {
      "id": "i9",
      "severity": "Warning",
      "dimension": "completeness",
      "finding": "§9.2 i6 的采纳承诺「在方案中写明 HMR / 多窗口场景的行为边界」未兑现：§2.6 与 §10.1 对 _writeChain 的描述均无 HMR、多窗口相关内容，采纳声明与正文规范部分脱节。",
      "suggestion": "在 §2.6 或 §10.1 补充一段：模块级 _writeChain 在 HMR 重建与多窗口各自模块实例下的行为边界、剩余风险及可接受理由。"
    },
    {
      "id": "i10",
      "severity": "Warning",
      "dimension": "feasibility",
      "finding": "§11.2「有测试目录维持现状（statements 55 / branches 40 / functions 60 / lines 55）」包含 utils，但 §3.1 明确说明 utils 以及 features/api/services 当前缺失于 coverage.include，其真实覆盖率从未被测量；直接沿用现值可能使第 0 步立即变红，与「不阻塞其他工作」的目标冲突。三层阈值表也没有覆盖 §3.1 新增的 features/api/services 目录。",
      "suggestion": "将 utils 与 features/api/services 一并按「先实测基线再定阈值」处理，或在提交阈值前用实测数据验证 55/40/60/55 在这些目录成立；补齐阈值表对应目录行。"
    },
    {
      "id": "i11",
      "severity": "Warning",
      "dimension": "feasibility",
      "finding": "§4 称「第 2~5 步互相独立，可并行分支」不成立：第 2 步 P0-1 修改 usePublishFlow.js（:283/:285/:414 一带），第 5 步 P0-2 按 §11.1 方案 (b) 也要改消费侧 usePublishFlow.js（:116-122 的匹配条件），两步存在同文件依赖。",
      "suggestion": "修正依赖描述：第 2 步与第 5 步显式串行，或按文件归属重排步骤，避免并行改动同一 composable。"
    },
    {
      "id": "i12",
      "severity": "Warning",
      "dimension": "consistency",
      "finding": "M-6 的变更边界两处口径不同：§3.1 与 §4 第 0 步写「只补 include + 记基线，不得在同一次变更里提阈值」，§10.1 A 类却把「补 include + 三层阈值」列为本轮修复内容并以 §11.2 作为验收；三层阈值究竟随第 0 步落地还是属于后续变更未定义。",
      "suggestion": "明确唯一口径（建议：第 0 步同一 PR 完成 include 补全、实测基线与按实测值落三层阈值），并同步修订 §3.1、§4、§10.1 的表述。"
    },
    {
      "id": "i13",
      "severity": "Warning",
      "dimension": "consistency",
      "finding": "§11.2 验收第 3 条「任何维度都不得提额」与同节 SFC 目录策略「后续 PR 逐步抬升」直接冲突：按现文字，后续任何阈值抬升都违反本方案的验收标准。",
      "suggestion": "将该条限定为「本次变更内任何维度不得提额」，并写明后续抬升所需的流程（新基线证据、记录与复审）。"
    },
    {
      "id": "i14",
      "severity": "Warning",
      "dimension": "completeness",
      "finding": "§7 验收标准未覆盖 B 类随附项（m-4/m-5/m-6/M-9）与 M-5：这些条目被列入本轮同链路处理，但没有任何可机械检查的完成判据或证据等级说明；§9.1 i1 要求的对照用例「记录失败证据」也未说明证据存放位置与格式。",
      "suggestion": "为每个 B 类项补最小验收判据（如 m-4 重入拦截测试、m-6 标志位时序断言），M-5 按方案声明标注证据等级；明确变异验证证据的落盘路径。"
    },
    {
      "id": "i15",
      "severity": "Warning",
      "dimension": "consistency",
      "finding": "§11.3 数字自相矛盾：写「X = 2%（约 1900 行/季）」，同一表又写「按前端 27 项 36586 行计，2% 约 732 行/季」；1900 没有对应任何已给出的统计口径（98 项台账总行数未提供），分母在 98 项与 27 项之间摇摆，而 v3 声称「§11 补齐全部可验收数值」。",
      "suggestion": "明确统计分母：给出 98 项台账总行数并据此重算 2% 的目标值，或将 X 限定为仅作用于 27 项前端并采用 732；删除无出处的 1900。"
    },
    {
      "id": "i16",
      "severity": "Warning",
      "dimension": "completeness",
      "finding": "§10.3 分类与处置矛盾：m-9 放在「明确不修」但处置写「建议删……属独立 change」，实为 D 类另立任务语义；M-15 放「不修」却引用「先 el-pagination」的替代建议，分页方案未落入 §10 任何任务，该条处置实际未闭合。",
      "suggestion": "将 m-9 移入 D 类对应任务；为 M-15 的 el-pagination 给出明确结论（采纳并归入某任务，或拒绝并写明理由）。"
    },
    {
      "id": "i17",
      "severity": "Info",
      "dimension": "clarity",
      "finding": "文档结构与状态陈旧：§8「待决策项」排在 §9 评审回应之后，阅读顺序断裂；§9.4 末行仍是 v1 时代的「v2 需补齐 §10 全量处置表与 M-7 数值后重新送审」，与 v3 已含 §10/§11/§12 的现状不符。",
      "suggestion": "重排或重编号章节使决策项先于评审回应；将 §9.4 收尾更新为 v3 当前的送审状态。"
    },
    {
      "id": "i18",
      "severity": "Info",
      "dimension": "feasibility",
      "finding": "§12 将单一模块（film-engineering）的工厂形态验证推广到全部 preload 模块：其他模块若存在顶层 Electron 副作用或非工厂导出，在 vitest Node 环境直接 require 会失败；示例路径 @/../electron 依赖脆弱的别名拼接，未经验证。",
      "suggestion": "先做一次性验证：在 vitest Node 环境逐个 import 全部 preload 模块确认无顶层副作用，再固化测试设计；为 electron/preload 配置显式 alias。"
    }
  ],
  "dimensionScores": {
    "completeness": 6,
    "consistency": 4,
    "clarity": 6,
    "feasibility": 6,
    "security": 7
  }
}