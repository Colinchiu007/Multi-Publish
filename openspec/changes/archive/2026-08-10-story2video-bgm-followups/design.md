# Design: story2video-bgm-followups

## 1. compose BGM 校验失败区分原因

`resolveReadableMediaFile` 返回 null 的成因：扩展名不支持 / 不在 allowedRoots / 不存在 / 符号链接 / 不可读 / 超过单文件上限。扩展名与根目录在调用前可低成本判定；判定顺序：

1. 扩展名不在 `.wav/.m4a/.mp3` → `reason='format_unsupported'`（warning 文案「BGM 格式不支持，已跳过背景音乐」）。
2. `fs.existsSync` + `fs.statSync` 可读且 `size > MAX_BGM_FILE_BYTES` → `reason='size_exceeded'`（「BGM 文件超过大小上限，已跳过背景音乐」）。
3. 其余（不存在/不可读/越界/符号链接）→ `reason='unreadable'`（「BGM 文件不存在或不可读，已跳过背景音乐」）。

实现：在 compose() BGM 分支先用 `getMediaRule('bgm')` + 轻量 lstat/stat 判定，仍以 `resolveReadableMediaFile` 为最终裁决（fail-closed）；`data.bgmSkippedReason` 输出机器可读码，`data.warnings` 保留中文文案（i18n 接线为后续项）。

## 2. 通知正则收窄与英文覆盖

`MODEL_API_KEY_PATTERN`：
- 原 `(?:decrypt failed|解密失败)` 收窄为 `(?:api[ _-]?key.{0,20}(?:decrypt failed|解密失败)|(?:decrypt failed|解密失败).{0,20}api[ _-]?key)`（API-key 上下文内才匹配）。
- 新增 `(?:missing api key|api key required|no api key|api key.{0,16}(?:missing|required|not found|未找到))`。

`resolveMessageKey` 顺序不变（MODEL_API_KEY 先于 MODEL_CONFIGURATION）。

## 3. models 回填清洗

多模态 models 合并前对存量项 `map(trim).filter(Boolean)` 去重后合并；预设下架模型的残留（只增不删）在注释中记录「需人工迁移」。

## 4. selected-media 老化 GC

`story2video-paths.js` 新增：

```
function gcImportedMedia (options = {}) {
  const baseDir = path.resolve(options.baseDir || IMPORTED_MEDIA_DIR)
  const maxAgeMs = positiveLimit(options.maxAgeMs, DEFAULT_IMPORTED_MEDIA_MAX_AGE_MS) // 7 天
  // 遍历 baseDir：仅普通文件、非符号链接、mtime 超过 maxAgeMs → 删除（有界重试同 copyImportedMedia）
}
```

启动接线：`container.setup.js`（或 story2video ipc-handlers 注册处）调用一次；失败静默（warn）。BGM 被 GC 删除后，compose 走已合并的降级路径（`bgmSkippedReason='unreadable'`），不会硬失败。

## 测试映射

| 场景 | 测试 |
|---|---|
| BGM 超限 → size_exceeded + 降级成功 | story2video-compose-engine.test.js |
| BGM 缺失 → unreadable + 降级成功 | story2video-compose-engine.test.js（已有，补 reason 断言） |
| decrypt 无 api-key 上下文不误归类 | notifications.test.js |
| Missing API key 等英文 → MODEL_API_KEY_REQUIRED | notifications.test.js |
| models 存量空串/空格清洗 + 去重 | model-provider-multimodal.test.js |
| GC 过期删除 / 新鲜保留 / 符号链接跳过 | story2video-paths.test.js |
