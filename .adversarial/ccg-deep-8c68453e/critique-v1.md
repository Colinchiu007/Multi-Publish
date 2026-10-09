{
  "schemaVersion": 1,
  "issues": [
    {
      "id": "i1",
      "severity": "Critical",
      "dimension": "correctness",
      "finding": "文档 01-docs/UX-…研究方案.md 尾部把「## 8 Wave 0.4 执行记录 + ## 9 P4 执行记录 + 相关文档页脚」整段重复追加两遍，与既有第 8/9 章并存共 3 份，章节锚点、页脚与标题序号结构损坏，属复制粘贴失误。",
      "suggestion": "删除两份重复追加副本，仅保留既有第 8/9 章与单个页脚；本批内容改写在变更记录表即可。"
    },
    {
      "id": "i2",
      "severity": "Warning",
      "dimension": "correctness",
      "finding": "台账声明「QM-6 CCG 双模型评审 PASS」，但新增 .ccg/reviews 两条记录（1b6615528、f77693d66）deepReview 均 pending、performedBy/findings 为 null，且 head 8c68453e8 无任何评审记录——PASS 声明无提交物支撑。",
      "suggestion": "对 head 8c68453e8 补跑 Deep 评审并回填 findings，否则将 QM-6 标记为 PENDING 而非 PASS。"
    },
    {
      "id": "i3",
      "severity": "Warning",
      "dimension": "maintainability",
      "finding": "gate-record-debt-ledger.json 直接改写他会话 error-message-fix 条目（reason 全换、status 执行中→PENDING、line 2118→4479），与同文件内「不代其他会话改写其执行记录」惯例自相矛盾。",
      "suggestion": "恢复原条目文本与 line 2118，另新增独立登记项说明 L4479 状态异常，不覆盖原记录。"
    },
    {
      "id": "i4",
      "severity": "Warning",
      "dimension": "maintainability",
      "finding": "tokens.css 新增规则用无前缀泛化类 .history-tab/.secondary-action/.toolbar-button/.icon-action，dark 下全局命中所有同名元素；被删 ProfileMenu 块注释明确要求「类名带组件前缀避免全局污染」，本次未延续该约束。",
      "suggestion": "为这些选择器加组件级前缀（如 .mp-publish-history 包一层），或先全库确认类名唯一。"
    },
    {
      "id": "i5",
      "severity": "Info",
      "dimension": "correctness",
      "finding": "计数口径混用：台账称登录 strong 18 处、publish-history 20 处（元素级），而基线 36→19 为样本计数（总降仅 17），两组数字无法互相复现核对，修复归因不可追踪。",
      "suggestion": "台账注明元素计数与审计样本计数为两套口径，并给出 19 的样本级分解来源。"
    },
    {
      "id": "i6",
      "severity": "Info",
      "dimension": "maintainability",
      "finding": "变更记录表 v1.4/v1.5/v1.6 三行行尾多一个竖线（|| 产生空单元格），与其余行单竖线收尾风格不一致。",
      "suggestion": "去掉行尾多余的第二个竖线，保持表格列数一致。"
    },
    {
      "id": "i7",
      "severity": "Info",
      "dimension": "correctness",
      "finding": "本 PR 新增 f77693d66 的 .ccg/reviews 文件，该 commit 属另一 PR #3189，与本 PR 主题无关；且两份评审 JSON 均无结尾换行符。",
      "suggestion": "移除无关 commit 的评审文件或说明纳入理由，并补齐行尾换行。"
    }
  ],
  "dimensionScores": {
    "correctness": 4,
    "security": 10,
    "performance": 9,
    "maintainability": 5
  }
}