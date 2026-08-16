# fix-s2v-save-segments-image-loss — Design

## 技术方案

### R1: saveSegments 保存后重建媒体 URL

`ResultView.vue` `saveSegments()` 成功分支（L1115-1118 替换 `this.segments`/`this.project` 之后）追加：

```js
// 主进程返回的分段不携带渲染端派生 URL 字段（imageUrl/alternateImageUrls/videoUrl），
// 必须重新解析本地媒体 URL，否则替换后分段图片/素材/视频全部消失（2026-08-16 Bug）。
await this.refreshSegmentImageUrls()
```

- 放在 `this.project = result.data || this.project` 之后、置 `segmentsDirty=false` 之前/之后均可（刷新是异步派生，不改变保存语义；参考 `retrySegment` L1195-1201 先替换再刷新）。
- 无条件执行（不等 `segments.length` 守卫）：返回空 segments 时保留当前分段，刷新对其重新解析（`resolveLocalUrl(filePath, previousUrl)` 复用有效令牌）。
- `refreshSegmentImageUrls` 与 `refreshSceneMaterialUrls`（L537-571）本身对缺 `imagePath`/缺 alternate/缺 videoPath 的分段跳过或置空，单段失败不影响其它段。

### R3: replaceSegmentAudio 媒体 URL 重建（同类缺陷）

`replaceSegmentAudio()`（L1175-1177 替换 `this.segments`）之后追加同一句 `await this.refreshSegmentImageUrls()`；音频播放走项目级 `audioSrc`（loadProject/重合成维护），不在本次媒体 URL 重建范围。

### R2: 回归保护测试（ResultView.test.js）

- 用例 1（非空返回）：mock `story2videoUpdateSegments` → `{ code:0, data:{ projectId:'p1', dirty:true, segments:[{ id:'s1', imagePath:'C:/img1.png', status:'completed' }] } }`；mock `story2videoCreateShareUrl` → `{ code:0, data:{ url:'file:///C:/img1.png' } }`；断言保存后 `createShareUrl` 以 `'C:/img1.png'` 被调用、`w.vm.segments[0].imageUrl === 'file:///C:/img1.png'`。
- 用例 2（空返回）：mock 返回 `segments: []`；预置带 `imageUrl` 的 segments；断言保存后 `segments[0].imageUrl` 仍非空（保留路径）。
- 用例 3（旁白替换）：mock `story2videoReplaceSegmentAudio` 返回含 imagePath 分段；断言替换后 `createShareUrl` 被调用、`segments[0].imageUrl` 非空。

## 已知取舍（审查记录，2026-08-16）

- 无条件刷新会增加 N 次 `create-share-url` IPC/令牌签发；`replace-then-refresh` 与 retry/regenerate 等既有路径同语义，旧令牌由 TTL 自然过期（非空返回分支替换发生在刷新前，无法携带 previousUrl 回收；空返回分支会以旧 URL 作为 `previousUrl` 复用/回收）。无感令牌建立在已有模式上，不在本次扩大重构。
- 单段 URL 解析失败仅置空该段（fail-closed 粒度不变），保存仍提示成功——与既有 `refreshSegmentImageUrls` 行为一致，软提示（未解析段计数）列为后续优化。
- `applyProjectSegments(data)` 帮助函数收敛 10+ 替换点属结构性重构，列为后续 follow-up。

## 不做的事

- 不改主进程存储/清文件逻辑（图片文件未丢，仅渲染端 URL 字段缺失）。
- 不引入响应式 watcher / 全局 URL 派生重构（超范围；沿用既有「替换后显式 refresh」模式）。
- 不动音频播放 `audioSrc` 派生与 trim/下载等无关路径。
