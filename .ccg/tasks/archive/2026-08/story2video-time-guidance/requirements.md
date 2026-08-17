# 需求（用户原话）

流水线进度区域加上文字说明：

- 整体完成的时间，和视频的时长有关系。时长越长，合成越久。同时，也与内容的复杂程度、大模型的推理时间长短有关系。
- 合成时间参考：1 分钟视频—合成时长 5-8 分钟；3 分钟视频—合成时长 15-20 分钟；6 分钟视频—合成时长 35-45 分钟；以上合成时间长度都是正常的。

## 落地文件

- apps/desktop/src/views/video-creation/StageProgress.vue（模板新增提示块，文案全部走 $t）
- apps/desktop/src/styles/stage-progress.css（提示块样式）
- apps/desktop/src/locales/zh.js / en.js（stageProgress 块成对新增键，CI Gate 7）
- apps/desktop/src/views/video-creation/StageProgress.test.js（回归：zh/en 渲染）
