{
  "schemaVersion": 1,
  "issues": [
    {
      "id": "i1",
      "severity": "Critical",
      "dimension": "correctness",
      "finding": "podcast:endpoints:list 处理器仍调无参 getService()；新 getService 对空 channelId 直接抛 PODCAST_CHANNEL_ID_REQUIRED，未注入环境该通道必然失败，播客页分发端目录加载即断。测试全走 injected 注入故全绿，掩盖此缺陷。",
      "suggestion": "endpoints:list 改走 getRegistry() 直取 listEndpoints，不经过带 channelId 校验的 getService；补一条非注入路径用例。"
    },
    {
      "id": "i2",
      "severity": "Warning",
      "dimension": "maintainability",
      "finding": "01-docs/DESIGN-…-2026-10-10.md 仍是 v1 全文（channels/default/、自动挤出、8 通道一律必填、注册期单飞，blob 与 proposal-v1 相同），而 openspec design.md 把它与 proposal-v5 并列为真源——被 v2-v5 撤销的语义残留两处，正是全流程反复防的「两处各自成为真源」（#27 同类）。",
      "suggestion": "DESIGN 文件改为指向 v5 的指针或删除被撤销语句，openspec 只保留单一真源 proposal-v5（含历史轮次说明）。"
    },
    {
      "id": "i3",
      "severity": "Warning",
      "dimension": "correctness",
      "finding": "ensureMigratedOnce 对任意 migrationStatus（含 error）提前返回，resolveMigration 只处理 conflict、error 时原样 return：IO 失败后 _assertWritable 把写路径永久 fail-closed，错误文案称「可重试」却无任何重试或清除 error 的入口，用户只能删数据。",
      "suggestion": "增加迁移重试通道（error→重新执行复制并清状态），或提供显式重试按钮与错误码文案，确保 error 态可退出。"
    },
    {
      "id": "i4",
      "severity": "Warning",
      "dimension": "correctness",
      "finding": "_runMigration 判 conflict 时先 _saveIndex 把候选 entry 落进 channels[] 再 throw，但频道目录从未创建；resolveMigration(keep_existing) 后该无目录幻影频道仍在列表，channel:get 返回 null，UI 出现不可用频道行且删除不了。",
      "suggestion": "conflict 时不写 channels[]，仅存 migrationCandidateChannelId；resolve 成功后再补 entry 并建目录。"
    },
    {
      "id": "i5",
      "severity": "Warning",
      "dimension": "correctness",
      "finding": "契约承诺「已被持则立即拒绝（PODCAST_CHANNEL_BUSY）」与实现不符：withKey 实为排队等 250ms 再抛未登记代码 PODCAST_LOCK_WAIT_TIMEOUT，且消息含硬编码中文、无 zh/en 成对文案、不在 §6 错误码表；突发并发时后到写者全数超时。",
      "suggestion": "锁等待改「未获即抛 CHANNEL_BUSY/INDEX_BUSY」或把 LOCK_WAIT_TIMEOUT 补进错误码表与 locales 成对文案。"
    },
    {
      "id": "i6",
      "severity": "Warning",
      "dimension": "correctness",
      "finding": "等待预算从到达时刻起算而非到队首：持锁临界区略长，排队者相继超时全部失败；若临界区永久挂住（IO 卡死），未被 resolve 的 tail 常驻 queues，该键从此每次调用都超时且无人清理，频道静默不可写。",
      "suggestion": "以「轮到我」为计时起点或把超时限制改为持有者心跳；检测到持锁超预算时清队列并报 busy，防键泄漏。"
    },
    {
      "id": "i7",
      "severity": "Warning",
      "dimension": "security",
      "finding": "registry.writeHosting 对 pathPrefix 仅 trim 后落盘，未按 §6 判据拒绝空值/以 / 开头/含 ..，PODCAST_HOSTING_PREFIX_UNSAFE 无落地校验；刀 2 接线即存在跨前缀路径逃逸面（对象 key 由 pathPrefix 派生）。",
      "suggestion": "writeHosting 落盘前复用同一判据校验 pathPrefix，违规抛 PODCAST_HOSTING_PREFIX_UNSAFE，并配路径逃逸负例测试。"
    },
    {
      "id": "i8",
      "severity": "Info",
      "dimension": "performance",
      "finding": "withKey 每 5ms 新建 sleep 定时器轮询竞态，短临界区也持续空转；atomicWriteJson 的 Windows 重试用自旋忙等占满 CPU；saveEpisode 每次全量重写 episodes.json，随集数增长线性放大。",
      "suggestion": "轮询改条件 Promise（持锁者释放时直接唤醒等待者）；忙等改 setTimeout 退避；重写开销如实注释或预留增量写。"
    }
  ],
  "dimensionScores": {
    "correctness": 4,
    "security": 6,
    "performance": 6,
    "maintainability": 5
  }
}