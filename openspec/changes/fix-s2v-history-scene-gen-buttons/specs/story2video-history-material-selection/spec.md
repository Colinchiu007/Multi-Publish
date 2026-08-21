## MODIFIED Requirements

### Requirement: 详情页布局与交互（ResultView）

详情页 SHALL 保持原有内容不变，每个 segment 新增「场景素材」区并稳定显示四个视觉卡（图 1、图 2、视频 1、视频 2）。缩略图只打开预览；radio 只能通过 change 事件选择当前使用素材；选中槽显示高亮边框与「当前使用」徽标。图 1/图 2 卡内都显示一次【生成新图】（同一场景级动作，调用 `generateSceneImage`，写入目标由选中态规则决定：图 2 槽为空时从图 2 卡点击补入该空槽；已有备选图时按「替换未选中」规则落位），视频 1/视频 2 卡内都显示一次【生成 AI 视频】（同一场景级动作，调用 `generateSceneAiVideo`，结果写入 canonical 视频槽并显示在 video1 卡；video2 保持视觉别名、不新增持久化身份）；busy 态显示本地化「生成中...」并沿用 `segmentBusy` 防抖；生成 AI 视频按钮仅当 `videoPrompt`/`prompt`/`text` 全为空时禁用（提示词回退契约与后端 `generateSceneAiVideo` 一致）；【再次合成视频】入口继续使用既有服务流程。预览 modal SHALL 使用 xl 尺寸，video1/video2 均按视频元素预览。

#### Scenario: 四槽位渲染与选中态
- **WHEN** 详情页加载项目且 segment 有任意素材组合
- **THEN** 该 segment 恰好渲染 image1、image2、video1、video2 四张卡；空卡显示固定尺寸「未生成」占位；选中槽有高亮与「当前使用」徽标，video2 不重复显示 canonical 视频徽标

#### Scenario: 三槽位渲染与选中态
- **WHEN** 详情页加载项目且 segment 有素材
- **THEN** 既有三种持久化身份 image1、image2、video 的 selectedMaterial 语义保持不变，并通过四张视觉卡呈现；点击空卡不触发选择，点击有内容卡的 radio 更新选中态

#### Scenario: 缩略图预览与选择隔离
- **WHEN** 用户点击有内容图片或视频缩略图
- **THEN** 只打开对应预览，不调用选择 IPC；只有 radio change 事件触发选择 IPC

#### Scenario: 生成按钮与 busy 态
- **WHEN** 用户点击【生成新图】或【生成 AI 视频】
- **THEN** 对应卡内按钮进入「生成中...」busy 态并禁用（`segmentBusy`），完成或失败后恢复；并发双击不产生重复调用；同一场景全部生成入口在 busy 时统一禁用

#### Scenario: 生成按钮归属明确且不重复
- **WHEN** 一个 segment 被显示
- **THEN** image1/image2 卡内各有一个【生成新图】按钮，video1/video2 卡内各有一个【生成 AI 视频】按钮；它们都是同一场景级动作的入口，写入目标由选中态/身份规则决定，不改变持久化身份

#### Scenario: 空卡也有生成入口
- **WHEN** image2 或 video2 槽为空（未生成）
- **THEN** 图 2 卡内仍显示【生成新图】、视频 2 卡内仍显示【生成 AI 视频】；从图 2 空卡点击【生成新图】补入该空槽（`alternateImages` 为空时先写图 2），从任何视频卡点击【生成 AI 视频】写入 canonical 视频槽并显示在 video1 卡

#### Scenario: AI 视频门控与后端回退契约一致
- **WHEN** segment 无 `videoPrompt` 但 `prompt` 或 `text` 任一 trim 非空
- **THEN** video1/video2 卡的【生成 AI 视频】按钮可用，点击不静默拦截，调用 `story2videoGenerateSceneAiVideo(projectId, segmentId)`
- **WHEN** `videoPrompt`/`prompt`/`text` 三者全为空
- **THEN** 按钮禁用，title 显示「请先编辑或重新生成视频优化词，再生成 AI 视频」

#### Scenario: 预览弹窗尺寸与媒体类型
- **WHEN** 用户打开缩略图预览
- **THEN** modal 使用 xl 尺寸，图片使用图片元素，video1 和 video2 使用可控视频元素并受响应式预览边界约束

#### Scenario: 再次合成并列入口
- **WHEN** 分段编辑区头部渲染
- **THEN** 【再次合成视频】与【重新合成】并列可见，点击调用 recompose-project，成功/失败均有 toast

#### Scenario: 响应式布局
- **WHEN** 视口宽度 ≤ 720px
- **THEN** 四张卡以两列换行，媒体框保持稳定尺寸且卡内按钮不溢出；宽屏使用四列
