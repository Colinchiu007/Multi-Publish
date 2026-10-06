{
  "schemaVersion": 1,
  "issues": [
    {
      "id": "i1",
      "severity": "Critical",
      "dimension": "correctness",
      "finding": "report_backends 的 CMD 分支不设 _rb_rc 也不计 _rb_ok：两后端都只有 .cmd 时打印『没有任何评审后端可用』却返回 0，--check-deps 跟着 exit 0 并打印『体检通过：后端可用』，与自身文案及 fail-closed 意图相反。测试②只断言输出、不查 rc，拦不住。",
      "suggestion": "CMD 分支同样 _rb_rc=2；给测试②补 rc≠0 断言，覆盖两后端均仅 .cmd 的用例。"
    },
    {
      "id": "i2",
      "severity": "Warning",
      "dimension": "correctness",
      "finding": "for _rb_d in $(candidate_dirs) 未加引号，含空格的候选目录被按词拆分。文档自己举的真实路径 D:\\Program Files\\npm-global 就含空格，该候选在 shell 里被拆成两段而漏检后端。",
      "suggestion": "改用 while IFS= read -r 按行消费 candidate_dirs 输出，或令其以换行分隔并由 read 逐行读取。"
    },
    {
      "id": "i3",
      "severity": "Warning",
      "dimension": "maintainability",
      "finding": "主流程 report_backends || true 之后无条件打印『依赖体检通过，开始深度审查…』并继续跑；后端全 MISS 时上一行刚打印『深度审查根本起不来』，两句自相矛盾，且仍会带着坏环境往下执行到 wrapper 才失败。",
      "suggestion": "主流程根据 _rb_ok 分支文案：无可用后端时打印阻断说明并提前 exit 2，或至少不再打印『体检通过』。"
    },
    {
      "id": "i4",
      "severity": "Info",
      "dimension": "maintainability",
      "finding": "文档称『修复前 5/5 全红，修复后 7/7 全绿』，但测试共 7 例，且用法锁、dirname 锁、结构锁在旧实现下同样必红，前后数字无法对应。",
      "suggestion": "按实际断言逐条标注修复前红/绿状态，或改为『修复前 6/7 全红』等可核对口径。"
    },
    {
      "id": "i5",
      "severity": "Info",
      "dimension": "maintainability",
      "finding": "注释称候选目录清单『不依赖 PATH 本身』，但 npm prefix -g 依赖 command -v npm，posix_dir 依赖 cygpath/sed/cut/tr；PATH 坏到本方案针对的场景时这些分支会静默不生效。",
      "suggestion": "要么用纯参数展开实现盘符归一，要么在注释中明确该候选在 PATH 全坏时不可用。"
    },
    {
      "id": "i6",
      "severity": "Info",
      "dimension": "maintainability",
      "finding": "测试注释编号混乱：出现 ⑥b、两个并列 ⑦、缺 ⑤，与文档『7 例』的指代不易对上，后续增删测试易引错编号。",
      "suggestion": "按 ①…⑦ 顺序重新编号，并让注释里的编号与 test() 顺序一一对应。"
    },
    {
      "id": "i7",
      "severity": "Info",
      "dimension": "maintainability",
      "finding": "⑦ 结构锁用正则精确匹配 _self_dir=\"${_self_dir%/*}\" 的具体实现串，属于脆弱的字符串级锁；合法重构（换写法但保留不依赖 dirname）会误报红。",
      "suggestion": "改断言为『ROOT 计算不含 dirname 且含参数展开』的行为级匹配，宽容实现细节。"
    }
  ],
  "dimensionScores": {
    "correctness": 5,
    "security": 9,
    "performance": 9,
    "maintainability": 6
  }
}