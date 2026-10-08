{
  "schemaVersion": 1,
  "issues": [
    {
      "id": "i1",
      "severity": "Critical",
      "dimension": "correctness",
      "finding": "详情弹窗外层 div 的 v-if 为 `kind!=='absent' || postId || platformWorkId`。当 kind==='absent' 且无 postId/platformWorkId（真·无任何记录）时外层不渲染，`detailLinkAbsent`「未记录作品链接」永不显示。V7 因带入 postId='1000000001' 恰好使外层为真，掩盖了此缺陷。",
      "suggestion": "外层 v-if 改为仅判 `kind!=='absent'`；absent 分支独立成不受该条件约束的块，避免被 postId/platformWorkId 兜底条件遮蔽。"
    },
    {
      "id": "i2",
      "severity": "Warning",
      "dimension": "correctness",
      "finding": "isPublicContentUrl 对 `pathname+search` 跑 $ 锚定 regex。真实内容页带 query 时（如 `zhuanlan.zhihu.com/p/123?from=share`）search 非空使 `/^\\/p\\/\\d{4,}\\/?$/` 不匹配，本可 recorded 采用的页面被误判非内容页而诚实降级。youtu.be 短链带 query 同理。",
      "suggestion": "contentPathRe 改为只匹配 pathname；search 仅在明确白名单（baijiahao `/s?id=`、toutiao `w=`、youtube `v=`）时单独放行，其余平台忽略 query。"
    },
    {
      "id": "i3",
      "severity": "Warning",
      "dimension": "correctness",
      "finding": "douyin contentPathRe 允许 `note/[0-9a-f]{16,32}` 为内容页，但 postIdRe 仅 `^\\d{6,}$`、template 恒为 `/video/{id}`。note 型（hex id）内容页可被识别却无法派生，返回 none，同平台两条规则自相矛盾。",
      "suggestion": "douyin postIdRe 兼容 note 的 hex 形态，或在识别到 note 时用对应模板派生；否则将 note 型标注为不可派生并用用例锁定。"
    },
    {
      "id": "i4",
      "severity": "Info",
      "dimension": "maintainability",
      "finding": "多处声称「对既有四平台逐字 no-op」，但 §6.4 与测试 M6 均明确 kuaishou 在 resultUrl 为内容页时优先采用（行为实证变化）。声称与实现自相矛盾，易误导后续维护者。",
      "suggestion": "统一口径为「zhihu/baijiahao/bilibili 逐字 no-op，kuaishou 为唯一行为修正」，全文检索替换该表述。"
    },
    {
      "id": "i5",
      "severity": "Info",
      "dimension": "performance",
      "finding": "详情模板对 selectedRecord 在单次渲染中调用 linkRenderState 至多 4 次、publicLinkHref 至多 3 次，每次重复触发 postId/URL 归一与正则/URL 解析，为纯计算冗余。",
      "suggestion": "用 computed 缓存 linkRenderState(selectedRecord) 一次，模板各处引用同一结果，避免重复解析。"
    }
  ],
  "dimensionScores": {
    "correctness": 6,
    "security": 7,
    "performance": 8,
    "maintainability": 6
  }
}