{
  "schemaVersion": 1,
  "issues": [
    {
      "id": "i1",
      "severity": "Warning",
      "dimension": "correctness",
      "finding": "暗色 --coral 全局 #ff8866→#c2410c，只验证了「白字压底」场景；若任何元素以 --coral 作前景文字/图标，#c2410c 在暗画布 #1a1a1e 上仅约 3.35:1，新跌破 AA 4.5:1；「无退化 exit=0」只覆盖探针样本，未覆盖未采样的消费点。",
      "suggestion": "grep 全库 --coral 消费点按前景/背景分类验证；前景场景保留高亮变体（如 --coral-text），并为各消费点补审计样本。"
    },
    {
      "id": "i2",
      "severity": "Warning",
      "dimension": "correctness",
      "finding": "仅桥接 --el-*-light-9 与 --el-fill-color-blank 主档，EP 派生档（light-3/5/7/8、--el-fill-color-light/lighter）仍为浅色默认，暗色下按钮悬停/下拉选中等交互态可能仍亮底；contrast-audit 为静态探针，测不到交互态。",
      "suggestion": "补 light-3/5/7/8 及 fill-color-light/lighter 暗色映射，或在审计中加入悬停/聚焦态断言。"
    },
    {
      "id": "i3",
      "severity": "Warning",
      "dimension": "maintainability",
      "finding": "QM-6 双家族 CCG 与远程同步两关门禁以 PENDING 随 PR 合并进 main，评审提交后才跑，门禁未被强制；「同一次提交销账」与 squash 合并后不可改写冲突，实际需第二个 docs 回填 PR（历史 #3209/#3210 同款）而计划未写明。",
      "suggestion": "合并前先执行 ccg-review 回填 QM-6；远程同步改为显式的「后续独立 docs PR 回填」两步流程，避免自相矛盾。"
    },
    {
      "id": "i4",
      "severity": "Warning",
      "dimension": "maintainability",
      "finding": "Dashboard 用硬编码 #a5a0ff 覆盖章节标题，未走 token，且偏离本批「dark 规则集中迁 tokens.css 视图级集中区」的统一模式（HomeGreeting 用 var），日后改色需多处同步。",
      "suggestion": "在 tokens.css 增 --deep-purple 暗色档（或复用 --color-sidebar-accent 系），Dashboard 改引用 var，保持集中模式。"
    },
    {
      "id": "i5",
      "severity": "Info",
      "dimension": "correctness",
      "finding": "同一对 #f87171/#3a1d1d 的对比度两处注释矛盾：.quality-gates 与记录写 5.53:1，tokens.css 注释写 4.6:1，必有一处错误，误导后续门禁复核。",
      "suggestion": "核算后统一为实测值（约 5.53:1），删除过时的 4.6 说法。"
    },
    {
      "id": "i6",
      "severity": "Info",
      "dimension": "correctness",
      "finding": "基线将 create(2)/model-providers(1)/first-run(1)/copy-library(1) 清零，正文归因只显式列出 el-message/coral/accounts 等；未逐视图归因，无法区分「已修复」与「探针未覆盖」。",
      "suggestion": "记录中补 19→0 逐视图归因表并与探针样本对账；未覆盖视图不得直接清零。"
    },
    {
      "id": "i7",
      "severity": "Info",
      "dimension": "maintainability",
      "finding": "gate-record-debt-ledger.json 新条目含 line: 0，其余条目无此字段，其语义（待回填的行号？）未定义，回填脚本无从消费，易与 status 混淆。",
      "suggestion": "删除未定义字段，或在 schema 注释中说明其在 .quality-gates.md 的回填目标行含义。"
    }
  ],
  "dimensionScores": {
    "correctness": 6,
    "security": 10,
    "performance": 10,
    "maintainability": 6
  }
}