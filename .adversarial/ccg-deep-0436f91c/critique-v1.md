{
  "schemaVersion": 1,
  "issues": [
    {
      "id": "i1",
      "severity": "Warning",
      "dimension": "correctness",
      "finding": "编辑器就绪上限被从原30s(UPLOAD_FALLBACK_WAIT_TIMEOUT_S)改成NAVIGATE_READY_TIMEOUT_S=10s，tolerance被砍20s；但PRD 4f/i3宣称「上限沿用原时长，只收紧快路径」，编辑器就绪并非快路径，与自述原则矛盾，慢网首屏会在10s即发超时告警。",
      "suggestion": "若编辑器就绪也属非快路径，保留30s上限，仅上传路径用30s、编辑器用独立不收紧的时长；或在PRD明示编辑器就绪主动收紧为有意取舍。"
    },
    {
      "id": "i2",
      "severity": "Warning",
      "dimension": "correctness",
      "finding": "dom.await_control在wait_until返回True后再次resolve_visible，二次解析与首查间控件若被移除/隐藏会返回None；上传路径把此None当fail-closed报CODE_UPLOAD_FAILED，把「刚可见又消失」的瞬时抖动误判为上传失败。",
      "suggestion": "wait_until的谓词直接返回可见locator或在成功后复用本次可见结果，避免二次解析引入竞态。"
    },
    {
      "id": "i3",
      "severity": "Info",
      "dimension": "correctness",
      "finding": "test_upload_wait_poll_count_matches_its_own_ceiling断言`1<=calls<50`上下界松散，0.01s/0.05s实际轮询约5-6次，但若实现改成先sleep后单查、或候选链多元素致查询次数倍增，仍可能落入区间造成假绿/不稳定。",
      "suggestion": "用哨兵值构造确定性poll计数区间（如严格=ceil(timeout/interval)±1），并依赖集成链路确定性而非宽区间。"
    },
    {
      "id": "i4",
      "severity": "Info",
      "dimension": "maintainability",
      "finding": "守卫test_p4_wait_until仍用`\"await dom.await_control(\" in src`、`async def _await_upload_input(`等源码字面量与helper名循环断言；重命名helper、调整调用形式即假红，正是本PR在i4声称要除的「源码措辞耦合」失效类，只是把label换成了符号名。",
      "suggestion": "把「发布器确经dom轮询、且上传/编辑器各有一处」降为最少结构断言，其余交由行为用例（日志留痕/sentinel值）承担。"
    },
    {
      "id": "i5",
      "severity": "Info",
      "dimension": "maintainability",
      "finding": "test_host_scan_limit_is_imported_and_bounded只断言RISK_HOST_SCAN_LIMIT被import且在(0,16]，未验证该值经visible_texts实际生效为扫描上界；与「overlay轨独立成立」同类，删掉limit接线仍会绿。",
      "suggestion": "加一条哨兵用例：monkeypatch RISK_HOST_SCAN_LIMIT=1，断言visible_texts只读1个元素，证明上限真被落地。"
    },
    {
      "id": "i6",
      "severity": "Info",
      "dimension": "performance",
      "finding": "visible_texts对每个host先loc.count()再limint限个nth取inner_text；overlay轨与文本轨逐host重复扫描，且文本轨host有5个 selector，每次发布全量执行；SPA多宿主多条候选链成本可叠加放大。",
      "suggestion": "缓存/合并宿主扫描，overlay抉择与文本轨命中即短路返回，避免无上限的逐宿主全量inner_text叠加。"
    }
  ],
  "dimensionScores": {
    "correctness": 6,
    "security": 9,
    "performance": 8,
    "maintainability": 7
  }
}