{
  "schemaVersion": 1,
  "issues": [
    {
      "id": "i1",
      "severity": "Critical",
      "dimension": "security",
      "finding": "auto-start 断言接受「plan 对象」或「auto-plan 同参+confirmed」两形态；plan 路径下 shots[].refPaths 未列入重校验（校验列仅 confirmed/taskId）。被控渲染进程可伪造 plan 传受控根外路径，generateShotVideo 将其当参考帧读取并上送 provider，直接绕过 §4.7 受控媒体根纵深防御。",
      "suggestion": "auto-start 只收 taskId+confirmed，服务端一律按 auto-plan 落盘的计划重建 shots，refPaths 逐项在受控根内重校验，杜绝客户端 plan 直达。"
    },
    {
      "id": "i2",
      "severity": "Warning",
      "dimension": "consistency",
      "finding": "A1（§4.1）与 A2（§4.2）各含一次「K>N 相邻合并/K<N 句级补齐」同规则；且 A1 引用的「目标镜数」到 A2 才由 T/s 算出，实施会产生双重合并或顺序矛盾，K 已对齐后 A2 恒为空转。",
      "suggestion": "A1 只做句级拆分（只增不减），K>N 的合并收敛到 A2 单一处，并前置定义目标镜数=N_target。"
    },
    {
      "id": "i3",
      "severity": "Warning",
      "dimension": "consistency",
      "finding": "输入域下 N_target=round(T/s) 最大 round(600/5)=120，MAX_AUTO_SHOTS=200 及 R1「200镜≈16h、20批」在实际表单永远不可达；AUTO_TOO_MANY_SHOTS 成死码，风险口径误导决策。",
      "suggestion": "上限与 R1/W5 口径改为 120 镜/12 批；若保留 200，需先放开 duration 或秒数枚举，否则先对齐文案。"
    },
    {
      "id": "i4",
      "severity": "Warning",
      "dimension": "completeness",
      "finding": "状态机 failed/cancelled 均可「续跑（台账+磁盘双核）」，但 6 条 IPC 无续跑通道：auto-status 只读，auto-start 语义为「确认并开始」且要求 confirmed；续跑是否重触成本闸、是否复用原 taskId 均未定义。",
      "suggestion": "明确续跑=auto-start 复用同一 taskId，服务端读台账跳过已完成镜、不二次确认成本；补用例锁定该语义。"
    },
    {
      "id": "i5",
      "severity": "Warning",
      "dimension": "security",
      "finding": "taskId 在确认卡可改且 auto-start 仅 path.basename 校验未查重：复用已存在 taskId 会覆盖其 project.json 与 shot_NNN.mp4，造成数据丢失且可被误操作触发。",
      "suggestion": "auto-start 遇已存在 taskId 返回 AUTO_TASK_EXISTS，或要求显式 overwrite=true，并加单测覆盖。"
    },
    {
      "id": "i6",
      "severity": "Warning",
      "dimension": "completeness",
      "finding": "R2 缓解声称「UI 可改角色名/删除」，但 §5.1/5.2 无角色更名数据路径：characterMap 不在任何 patch 字段内，删除参考图也无入口，缓解声明与数据契约不符。",
      "suggestion": "补角色/参考图管理通道（如 auto-update-role），更名回写 characterMap 并校验同受控根规则。"
    },
    {
      "id": "i7",
      "severity": "Info",
      "dimension": "completeness",
      "finding": "原文直送（§5.4）为核心信任点，但 §8 测试计划仅断言「确认前 provider 调用=0」，未列 auto 路径 prompt 逐字符直送、不进优化链的等价契约断言（对照 video-gen.test.js:74 的 CONTRACT VIOLATION 锁）。",
      "suggestion": "在 auto-regenerate-shot 契约用例显式断言 prompt 未被改写且不经优化器，补防回归锁。"
    },
    {
      "id": "i8",
      "severity": "Info",
      "dimension": "clarity",
      "finding": "§4.5 称 auto-plan「纯计算+落盘预览」，但 §5.1 只定义 project.json：预览文件路径、生命周期、auto-start 是读落盘还是重算均未定义，留歧义。",
      "suggestion": "明确落盘物（preview 文件路径/TTL）并约定 start 复用该结果附一致性校验，避免服务端双算。"
    }
  ],
  "dimensionScores": {
    "completeness": 7,
    "consistency": 6,
    "clarity": 7,
    "feasibility": 7,
    "security": 5
  }
}