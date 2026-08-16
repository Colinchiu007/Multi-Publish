# 根因分析：历史记录点击【保存分段】后所有图片消失

## 症状
视频创作-历史记录（ResultView，project 模式）打开项目后图片正常显示；
点击【保存分段】成功提示后，页面所有分段图片/素材槽/视频槽全部消失。

## 根因（第一性原因）
`apps/desktop/src/views/ResultView.vue` `saveSegments()`（L1098-1128）：

1. L1116：`this.segments = result.data.segments.map(segment => ({ ...segment }))`
   —— 用主进程 IPC 返回值整体替换分段数组。主进程 `story2video-project-service.js`
   `updateSegments()`（L634-672）返回的是落库的 project 数据，分段只含持久化字段
   （imagePath/videoPath/alternateImages 等），**不含渲染端运行时派生的**
   `imageUrl / alternateImageUrls / videoUrl`。
2. `saveSegments()` 替换后**没有调用** `refreshSegmentImageUrls()`（L537-547）重新解析
   本地媒体 URL —— 这是本项目在 retry/regenerate image/video/audio/prompt、
   selectSceneMaterial、loadProject 等所有媒体变更路径上的既有模式（L1201/655/704/774/801/631/852），
   唯独 saveSegments 漏掉。
3. 模板 L168 `v-if="segment.imageUrl"` 渲染缩略图、`sceneMaterialSlots()`（L587）渲染
   素材槽（url: segment.imageUrl）。新对象上这些字段全为 undefined → 所有图片/素材消失。

主进程字段未丢（updateSegments 白名单合并，...original 保留 imagePath），文件也未被清理；
纯渲染端 URL 字段丢失导致显示为空。修复方向：保存成功替换 segments 后
`await this.refreshSegmentImageUrls()`（无条件，兼容返回 segments 为空的分支）。

## 逃逸分析（为何没被拦住）
- 单元测试（ResultView.test.js L949/L975）：保存分段用例 mock 返回 `segments: []`
  或不含 imagePath 的分段 → 替换分支不执行（L1115 length 守卫）→ 测试环境 imageUrl
  从未被破坏，无法暴露。缺“mock 返回含 imagePath 的非空 segments + 断言保存后
  imageUrl 仍可解析”的真实数据路径用例。
- 集成/E2E/视觉回归：无“保存分段后截图对比”用例；imageUrl 是运行时字段不落库，
  纯 mock 不模拟 createShareUrl 派生态。
- 审查盲区：2026-08-15/16 多轮审查（scene-edit/prompt-persistence/ai-video-regen/
  fail-open）聚焦保存语义、busy 联动、队列串行、离开守卫，审查清单没有
  “替换 this.segments 后必须 refreshSegmentImageUrls()”这一检查项。

## 系统性漏洞定位
测试场景缺失（保存类用例只 mock 空数组）+ 审查流程盲区（媒体 URL 派生契约无检查项）。

## 修复 + 回归保护建议
- 修复：saveSegments 成功分支末尾（L1117 后）加 `await this.refreshSegmentImageUrls()`。
- 回归测试：ResultView.test.js 新增用例——mock `story2videoUpdateSegments` 返回
  `segments: [{ id, imagePath: 'C:/img1.png', status: 'completed' }]`，
  mock `story2videoCreateShareUrl` 返回 `{ code: 0, data: { url: 'file:///C:/img1.png' } }`，
  断言保存后 `w.vm.segments[0].imageUrl` 非空且 createShareUrl 以 imagePath 被调用。
- 顺带风险：`replaceSegmentAudio()`（L1163-1188）同样是无 refresh 的 segments 整体替换，
  属同类问题，应一并核查（建议同 PR 修复）。

## 预防措施
- 审查清单/质量门禁：任何“用 IPC 返回替换 this.segments”的路径必须紧跟
  refreshSegmentImageUrls()（URL 字段为渲染端派生、不落库的契约）。
- 测试模板：保存/更新类用例禁止只 mock 空 segments，至少一条“非空数据 → 渲染端
  URL 派生/转发”真实路径。
