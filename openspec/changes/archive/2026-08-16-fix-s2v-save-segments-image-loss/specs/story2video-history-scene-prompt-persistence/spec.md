# story2video-history-scene-prompt-persistence Delta

## ADDED Requirements

### Requirement: 保存分段/编辑落库后媒体 URL 必须重新解析

结果页/历史记录中，凡以 IPC 返回数据整体替换 `this.segments` 的落库操作（保存分段、旁白替换等）完成后，渲染端 SHALL 重新解析本地媒体 URL（`imageUrl`/`alternateImageUrls`/`videoUrl` 为渲染端派生字段、不落库），不得使分段图片/素材槽/视频槽因 URL 字段缺失而消失。

#### Scenario: 保存分段后图片继续显示
- **WHEN** 用户在历史记录结果页点击【保存分段】且主进程返回含 `imagePath` 的非空分段
- **THEN** 保存成功后逐段经 `story2videoCreateShareUrl` 重新解析 `imageUrl` 且非空，分段图片不消失

#### Scenario: 保存返回空分段
- **WHEN** 保存分段返回 `segments: []`
- **THEN** 保留当前分段且媒体 URL 仍有效，图片继续显示

#### Scenario: 旁白替换后素材不消失
- **WHEN** 用户替换分段旁白且主进程返回新分段
- **THEN** 替换成功后媒体 URL 重新解析，图片/素材槽不消失

## Test Mapping

- `apps/desktop/src/views/ResultView.test.js`：保存分段非空返回 → createShareUrl 重建 URL；空返回 → 旧 URL 保留；旁白替换 → refresh 调用且图片 URL 非空。
