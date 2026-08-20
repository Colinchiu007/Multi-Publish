## MODIFIED Requirements

### Requirement: 场景素材槽位数据模型
每个 segment SHALL expose four stable visual material cards in the ResultView in this order: image1 from imagePath, image2 from alternateImages[0].path, video1 from the primary scene-video display path, and video2 from the alternate scene-video display path when present. The visual video aliases SHALL NOT expand the persisted data contract: selectedMaterial and the selection IPC SHALL continue to accept only image1 | image2 | video. The UI SHALL treat video1 and video2 as aliases of persisted video for selected-state display and selection requests.

#### Scenario: 四个视觉卡位保持固定顺序
- **WHEN** a segment is rendered regardless of which paths are present
- **THEN** the editor renders exactly four cards in the order image1, image2, video1, video2, and missing paths render an empty card instead of collapsing the grid

#### Scenario: 视频视觉别名不改变数据枚举
- **WHEN** a user selects either populated visual video card
- **THEN** the renderer sends persisted kind video to the existing selection IPC and never sends video1 or video2

#### Scenario: 新字段缺省即旧行为
- **WHEN** an older project has no alternateImages or selectedMaterial field
- **THEN** the editor keeps the four visual cards, shows Image 2 and missing video aliases as empty when their paths are absent, and does not require data migration

#### Scenario: 槽位文件纳入引用与清理
- **WHEN** a segment contains an alternate image or a scene-video display path
- **THEN** URL resolution and existing project-file reference/cleanup behavior continue to use the underlying persisted paths without changing slot identity

#### Scenario: manual 模式候选富化
- **WHEN** a manual run provides image/video candidates
- **THEN** the existing service enriches Image 1, Image 2, and the persisted video path according to its image1/image2/video contract; the four-card renderer only reflects the returned paths

### Requirement: 素材选择（select-scene-material）
Only a populated card's radio input SHALL change the current material. The radio SHALL be rendered below the thumbnail and before the material label. Thumbnail activation SHALL open preview only and SHALL NOT call the selection IPC or change selectedMaterial. Empty cards SHALL have a disabled radio and SHALL not call selection IPC.

#### Scenario: 单选项是唯一选择入口
- **WHEN** the user changes a populated card's radio
- **THEN** the renderer calls the selection IPC with image1, image2, or normalized video; after success image1/image2 show their own selected state, while canonical video selection shows the selected state and current-use badge only on video1 and video2 remains an alternate visual alias

#### Scenario: 点击缩略图只预览
- **WHEN** the user activates a populated image or video thumbnail
- **THEN** the preview modal opens with the corresponding media and the selection IPC is not called

#### Scenario: 空卡位不可选择
- **WHEN** the user focuses or attempts to activate an empty card
- **THEN** the card keeps its fixed empty frame, the radio is disabled, the localized empty label is shown, and neither preview nor selection IPC is invoked

#### Scenario: 合法选择
- **WHEN** the user changes a populated Image 1, Image 2, or visual video radio
- **THEN** the service receives image1, image2, or normalized video, persists the selection, and returns the complete project without changing unrelated material paths

#### Scenario: 非法选择
- **WHEN** the renderer attempts to select an empty card or a kind outside image1, image2, or video
- **THEN** the request is rejected by the existing validation path and the current project selection remains unchanged

### Requirement: 详情页布局与交互（ResultView）
The material area SHALL keep four stable cards. Each card SHALL place its radio below the media frame and before its label. The Image 1 card SHALL contain one Generate New Image action, and the Video 1 card SHALL contain one Generate AI Video action. The other cards SHALL not render duplicate scene-level generation actions. The preview modal SHALL use the large preview size and SHALL render both visual video aliases as video media.

#### Scenario: 生成按钮归属明确且不重复
- **WHEN** a segment is displayed
- **THEN** exactly one Generate New Image button is inside image1, exactly one Generate AI Video button is inside video1, and no matching button is rendered inside image2 or video2

#### Scenario: 生成中保持忙碌保护
- **WHEN** the segment is busy generating an image or AI video
- **THEN** both scene-level generation buttons are disabled, their busy labels are localized, and repeated clicks cannot start a second request

#### Scenario: 预览弹窗尺寸与媒体类型
- **WHEN** a thumbnail preview is open
- **THEN** the modal uses the xl size, images render as images, and either video1 or video2 renders as a controllable video element within the responsive preview bounds

#### Scenario: 三槽位渲染与选中态
- **WHEN** an existing project is opened
- **THEN** the historical editor preserves the existing selectedMaterial persistence and current-use badge semantics while presenting four visual cards; the three persisted material identities remain image1, image2, and video; the canonical persisted video selection is represented by video1 only and video2 remains an alternate visual alias

#### Scenario: 生成按钮与 busy 态
- **WHEN** the segment is busy with image or AI-video generation
- **THEN** the in-card generation controls are disabled, show their localized busy labels, and remain protected from duplicate requests

#### Scenario: 四槽位渲染与选中态
- **WHEN** the historical editor loads a project with any mixture of generated and missing image/video assets
- **THEN** it renders exactly four visual cards in the fixed image1, image2, video1, video2 order; empty cards keep fixed media geometry, populated selected cards show the current-use state, and video2 does not duplicate the canonical video badge

#### Scenario: 缩略图预览与选择隔离
- **WHEN** the user activates a populated image or video thumbnail
- **THEN** only the corresponding preview opens; the selection IPC is not called, and only a radio change event can select the material

#### Scenario: 再次合成并列入口
- **WHEN** the segment editor is displayed
- **THEN** the existing Save/Recompose/Recompose Video controls remain available in the bottom action bar and this change does not alter their service flow

#### Scenario: 响应式布局
- **WHEN** the viewport is narrow
- **THEN** the four visual cards wrap into the responsive two-column layout while preserving equal media-frame geometry

### Requirement: 文案与可访问性
All new or changed visible material labels SHALL exist in paired zh/en locale dictionaries. Each populated thumbnail button and each radio SHALL have a localized accessible name. Empty cards SHALL display only the localized empty label in their media frame and SHALL not expose raw visual kind names or unexplained fallback English text. A video radio SHALL be selectable only when the canonical persisted video path is present; video metadata alone MAY support preview but SHALL NOT create a selectable persisted material.

#### Scenario: 空槽没有额外英文残留
- **WHEN** an AI-video visual card has no media URL
- **THEN** its media frame contains only the localized empty-state text and no raw video1, video2, Video 1, Video 2, or second unexplained English line

#### Scenario: 中英文键成对
- **WHEN** the editor is built or locale synchronization is checked
- **THEN** every material key used by ResultView exists in both zh.js and en.js

#### Scenario: locale 成对与通知键
- **WHEN** material labels or generation-state text changes
- **THEN** zh.js and en.js contain matching keys and existing notification keys remain unchanged

#### Scenario: 视频选择边界
- **WHEN** a video visual card has only a legacy videoMeta path and no canonical segment videoPath
- **THEN** the path may still be previewed, but its radio is disabled and no persisted material selection is sent

### Requirement: 响应式布局
The four-card layout SHALL use four columns on wide screens and two columns at narrow widths. Every card's media frame SHALL keep the same stable aspect ratio and background whether the asset is present or absent; card actions SHALL wrap without overlapping the radio, label, or media frame.

#### Scenario: 空槽与有素材槽位几何一致
- **WHEN** a scene contains any mixture of generated and missing image/video assets
- **THEN** all four cards retain equal media-frame geometry and the four-item order remains visually aligned

#### Scenario: 窄屏不遮挡
- **WHEN** the viewport is at or below 720px
- **THEN** cards render in two columns, each media frame remains stable, and action buttons stay inside their owning card without overflow

### Requirement: 测试与回归矩阵
Implementation SHALL cover the four-card rendering, radio-only selection, preview-only thumbnail activation, normalized video selection kind, large preview modal, button ownership, busy guards, empty-frame output, paired locale keys, and fixed-layout behavior in focused ResultView tests and the repository locale/build checks.

#### Scenario: 场景-测试可追踪
- **WHEN** the change is validated
- **THEN** each interaction and layout scenario above is represented by an automated assertion or an explicit visual/build check before the change is archived
