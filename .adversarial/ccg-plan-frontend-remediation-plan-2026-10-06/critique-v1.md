{
  "schemaVersion": 1,
  "issues": [
    {
      "id": "i1",
      "severity": "Critical",
      "dimension": "consistency",
      "finding": "§10.5覆盖率自查的数学与计数均不成立：25%+18%+68%=111%而非100%；声称19条明确不修但§10.3表格实际逐条展开仅约15项（m-3,m-7,m-8,m-9,M-7,M-15,M-11,M-12,M-13,M-14,M-16,m-1,m-2,m-10,A.3）；7+5+19=31≠28。此外§2.6提到的MAX_COPY_REWRITES=200静默丢弃问题未出现在任何处置表中，与'没有一条被静默忽略'声明矛盾。",
      "suggestion": "以报告原始编号逐条列出全部28项，每项分配到唯一类别（本轮/随附/不修/另立任务），重算百分比使总和=100%，并将MAX_COPY_REWRITES问题补入恰当类别或另立任务。"
    },
    {
      "id": "i2",
      "severity": "Critical",
      "dimension": "consistency",
      "finding": "M-7在三处自相矛盾：§4执行顺序第8步仍列出'M-7偿还配额'；§9.2 i10采纳回应明确写'在补齐前M-7不进入执行顺序，只作为方向性建议'；§10.3将M-7列入'明确不修'表。三处不可能同时为真。",
      "suggestion": "从§4执行顺序中移除第8步M-7（或标注'待参数补齐后激活'），确保§4与§9.2 i10回应及§10.3一致。"
    },
    {
      "id": "i3",
      "severity": "Warning",
      "dimension": "completeness",
      "finding": "§9.2 i7回应承诺'把两方案的生命周期对比（引用失效路径/内存泄漏面/别名表清理时机）补入§8'，但§8实际内容仅列出了6个待决策问题，未包含任何对比分析文本。承诺的交付物缺失。",
      "suggestion": "在§8.2下方补入P0-2方案(a)持引用与(b)别名表的逐维度对比表，包含：引用失效时activeSession行为、内存泄漏风险、别名表增长与清理时机、单一真相源符合度。"
    },
    {
      "id": "i4",
      "severity": "Warning",
      "dimension": "feasibility",
      "finding": "P0-4修复方案引入模块级`reporting`布尔闸门防重入，但未讨论恢复机制。若IPC因临时故障（如窗口最小化、主进程忙）reject一次，reporting=true后所有后续错误报告将被永久抑制直到页面刷新。这意味着一次瞬时IPC失败可能导致整个会话的错误日志静默丢失。",
      "suggestion": "为reporting闸门加时间窗口自动重置（如30秒后重置为false），或在成功调用api.logError后立即重置。在方案中明确写出重置策略。"
    },
    {
      "id": "i5",
      "severity": "Warning",
      "dimension": "feasibility",
      "finding": "C-1配套契约测试需在vitest Node环境中加载Electron preload模块（electron/preload/film-engineering.js），但preload文件通常调用contextBridge.exposeInMainWorld，该API在Node中不存在。方案未说明如何在vitest中mock contextBridge、如何获取filterApiByAccessLevel的fullApi入参、以及preload与src/api/的映射关系如何建立。没有这些前置说明，60行测试的可行性存疑。",
      "suggestion": "在§2.1中补充契约测试的技术路径：mock contextBridge捕获exposeInMainWorld调用以获取暴露面；说明fullApi的构建方式（从主进程导入或静态声明）；给出preload与api/目录方法名的映射约定。"
    },
    {
      "id": "i6",
      "severity": "Warning",
      "dimension": "clarity",
      "finding": "C-1修复描述'改走命名空间（invokeWithFallback(\"filmEngineering\", ...) 后取 retryShot）'语义不明。invokeWithFallback通常接受channel名+参数发起IPC调用并返回Promise结果，不可能'后取retryShot'。实际含义可能是：channel名改为'filmEngineering:retryShot'，或是先invoke获取命名空间代理再调方法，或是响应对象中取字段。不同理解导致不同实现。",
      "suggestion": "写出明确的修复后代码示例，展示invokeWithFallback的完整调用签名与参数，消除歧义。"
    },
    {
      "id": "i7",
      "severity": "Warning",
      "dimension": "feasibility",
      "finding": "§10.2将m-11（reportError无去重与采样）并入步6（P0-4 .catch修复），但去重与采样是独立的功能设计：需要确定去重窗口时长、按何种key去重（消息文本/堆栈/组件）、采样率、是否区分error/warn级别。这些设计决策均未在方案中给出，且会影响生产排障能力（过度去重可能吞掉真实新错误）。",
      "suggestion": "将m-11从步6剥离为独立子任务，在步6中仅做.catch+脱敏。m-11的去重/采样设计作为后续PR单独推进，方案中标注为P1排期。"
    },
    {
      "id": "i8",
      "severity": "Warning",
      "dimension": "consistency",
      "finding": "M-6验收标准说'受影响的全局阈值同步下调'，但补入146个零覆盖SFC后，下调后的全局阈值（可能从60%降至约15-20%）将失去对已充分测试目录的保护作用。方案§3.1同时提出'按目录拆分阈值'，但未说明两者关系：是全局阈值下调+目录阈值维持旧值，还是全局阈值仅作兜底。",
      "suggestion": "明确写出：全局阈值下调至当前全仓真实覆盖率的-2%作为兜底；对有测试的目录（composables/stores/utils等）设目录阈值维持原60%+；对SFC密集目录设较低起步阈值。给出具体数值表。"
    },
    {
      "id": "i9",
      "severity": "Warning",
      "dimension": "completeness",
      "finding": "P0-5修复使用模块级_writeChain，但方案仅提到HMR下状态会重建，未讨论多窗口场景。Electron多窗口各自有独立的渲染进程和模块实例，若两个窗口同时触发useCopyLibrary的写入操作，模块级队列无法跨进程串行化，并发丢数据仍然存在。方案应明确声明多窗口是否是受支持的使用场景。",
      "suggestion": "在§2.6中增加一段：明确useCopyLibrary当前是否可能在多窗口中同时实例化；若是，说明模块级队列不覆盖多窗口并发，需主进程侧排队或接受该边界；若否，声明单窗口假设及其依据。"
    },
    {
      "id": "i10",
      "severity": "Warning",
      "dimension": "consistency",
      "finding": "§8.5明确提出'P0-5风险窗口窄——是否还值得现在修，还是排到P1/P2优先级？'，但§10.1已将P0-5锁定为步4（本轮修复）。方案同时在质疑其优先级并已承诺排期。若评审者同意推迟，§10.1和§4需同步修改，但当前文本呈现出已决和未决的矛盾状态。",
      "suggestion": "要么在§10.1中将P0-5标注为'待§8.5决策确认后执行'，要么撤回§8.5的疑问并给出维持步4的理由。二选一，不可同时处于提问和已决状态。"
    },
    {
      "id": "i11",
      "severity": "Info",
      "dimension": "clarity",
      "finding": "§2.5 P0-4修复伪代码中，API调用使用变量名msg，但catch回调引用message和err，后者在所示作用域中未定义。若直接照抄此伪代码会产生ReferenceError。",
      "suggestion": "统一变量命名，写出完整可编译的代码片段，或在伪代码旁标注'变量名需对齐实际函数签名'。"
    },
    {
      "id": "i12",
      "severity": "Info",
      "dimension": "clarity",
      "finding": "文档节序为§7→§9→§8→§10，§8（待决策项）出现在§9（评审回应）之后，打断了逻辑流。§9回应中引用'补入§8'时，读者需跳过§9才能找到§8。",
      "suggestion": "重排为§7→§8→§9→§10的自然顺序，或在§9开头加目录索引指向§8和§10的位置。"
    },
    {
      "id": "i13",
      "severity": "Info",
      "dimension": "completeness",
      "finding": "§2.4 P0-3修复方案规定连续失败后stopBatchPolling+batchError+notifyError，但未说明停止时已成功收集的部分数据如何处理：是丢弃全部、保留部分并标记不完整、还是展示已获数据+错误提示。不同选择对用户影响差异显著。",
      "suggestion": "在§2.4中补充部分数据策略：建议保留已收集数据+batchError提示'部分数据获取失败，请重试'，避免已有进度被清空。写明选择及理由。"
    },
    {
      "id": "i14",
      "severity": "Info",
      "dimension": "feasibility",
      "finding": "§7.3 M-6验收标准'include命中.vue文件数>0'过弱。若只命中1个SFC文件即满足字面条件，无法证明146个SFC均已纳入覆盖率计算。",
      "suggestion": "改为'coverage报告列出的.vue文件数>=146（或等于src/**/*.vue glob的实际文件数），且其中至少包含composables以外的组件目录'，并附coverage输出的文件计数证据。"
    }
  ],
  "dimensionScores": {
    "completeness": 5,
    "consistency": 4,
    "clarity": 6,
    "feasibility": 5,
    "security": 6
  }
}