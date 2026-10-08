{
  "schemaVersion": 1,
  "issues": [
    {
      "id": "i1",
      "severity": "Warning",
      "dimension": "correctness",
      "finding": "风控文本轨的多宿主循环零覆盖：全部用例都把风控文案放进 hosts[0]，删掉 hosts[1:] 的循环仍全绿；且 test_risk_wording_in_second_visible_host_is_caught 实为同一宿主内第 2 个元素，名字与行为不符，跨宿主轮询从未被测。",
      "suggestion": "补用例：hosts[0] 良性可见、hosts[2] 命中风控文案，断言仍抓到；将该测试改名并单独钉住跨宿主扫描。"
    },
    {
      "id": "i2",
      "severity": "Warning",
      "dimension": "maintainability",
      "finding": "拆分后盲 sleep 守卫只扫 xiaohongshu.py：守卫读了 dom 却只断 wait_until( 存在；set_cover 的 sleep(2) 已随拆分进 dom，未来在 dom 里加 sleep(30) 会静默绿。",
      "suggestion": "守卫对 dom 同样断言无 asyncio.sleep(≥阈值)，或把 set_cover 的固定 sleep(2) 改为轮询等待。"
    },
    {
      "id": "i3",
      "severity": "Info",
      "dimension": "correctness",
      "finding": "test_upload_wait_poll_count 断言 1<=calls<50 过宽：0.05s/0.01s 下先查再睡约 6 次、先睡后单查约 5 次，退化成非轮询的脆弱等待仍落在区间内，守卫识别不了回归。",
      "suggestion": "用哨兵 interval/timeout 推导确定性区间（ceil(timeout/interval) 上下各±1），并保留命中即返回的快路径断言。"
    },
    {
      "id": "i4",
      "severity": "Info",
      "dimension": "maintainability",
      "finding": "CI 门禁硬编码 5 个测试文件，新增发布器测试文件静默不入门禁；无任何结构校验把 tests/ 目录与 workflow 文件清单绑定，重蹈「回归不阻断」旧洞。",
      "suggestion": "加守卫断言：tests/ 下发布器测试文件集合与 CI 步骤所列一致，新增必须显式登记。"
    },
    {
      "id": "i5",
      "severity": "Info",
      "dimension": "maintainability",
      "finding": "守卫只断言 NAVIGATE_READY_* 被发布器引用与两个 timeout 值；UPLOAD_FALLBACK_POLL_INTERVAL_S 若在调用处被硬编码成 0.5，任何用例都不会变红。",
      "suggestion": "把上传轮询间隔常量并入「发布器引用 + 生效值」断言。"
    },
    {
      "id": "i6",
      "severity": "Info",
      "dimension": "performance",
      "finding": "每次存草稿 risk_present 最多扫 5 宿主×8 元素，逐元素 is_visible+inner_text、每宿主一次 count，最高约 85+ 次 DOM 往返，慢网下逐次叠加延迟。",
      "suggestion": "按命中概率给宿主排序并命中即短路返回；或先 count 后仅对可见元素读 inner_text，显式化预算。"
    },
    {
      "id": "i7",
      "severity": "Info",
      "dimension": "maintainability",
      "finding": "静态守卫仍用源码字面量断 helper 名（f\"async def {helper}(\"、src.count(\"await self._await_control(\")），重命名即假红——与 CCG i4 刚移除的格式化耦合同类，只是把 label 换成符号名。",
      "suggestion": "降为最少结构断言（_await_control 存在 + 两处调用点），其余交由行为用例承担。"
    }
  ],
  "dimensionScores": {
    "correctness": 6,
    "security": 8,
    "performance": 7,
    "maintainability": 6
  }
}