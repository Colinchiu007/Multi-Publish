 # QM-5 Bug 复盘：历史记录已完成任务缩略图误显示未生成 + 打开报错
 
 ## 1. 第一性原因
 
 story2video_projects_v1 项目索引（SQLite settings 表）持久化的是创建时刻的媒体绝对路径。
 当前设备根白名单 = getAllowedMediaRoots([projectsDir])（当前 userData 的 story2video-projects + 导入临时目录）。
 当索引在不同数据目录之间迁移（本次为调试 profile 的 DB 被合并进新 profile，49 条索引全部指向旧 profile 路径），
 索引项目仍被列出且状态为 completed，但所有媒体解析（缩略图 getThumbnail、预览 URL createShareUrl、分段素材、导出 ZIP）都被白名单拒绝：
 
 - getThumbnail 全部候选解析失败 status=missing，前端渲染「未生成」；
 - ResultView resolveLocalUrl(videoPath) 失败，弹「生成已完成，但未找到可预览的视频」。
 
 任务本身全部成功（video.mp4 存在且可播放），状态显示错误，用户误判为失败任务。
 
 ## 2. 逃逸链分析（为什么没拦住）
 
 | 测试层 | 为什么没拦住 |
 |--------|--------------|
 | 单元测试（project-service） | 既有 getThumbnail/IPC 测试都只在当前 projectsDir 内构造 fixture，从不覆盖索引路径在其他根的场景 |
 | 集成/视觉 | 历史页截图测试数据均生成于同一 profile，无跨 profile 迁移夹具 |
 | E2E | 真实 E2E 用独立新 profile 跑流水线，新项目索引与媒体根一致，不触发 |
 | 代码审查 | 审查焦点在路径校验强度（防越权），未覆盖合法索引 + 根迁移的可用性路径 |
 
 ## 3. 系统性漏洞定位
 
 - 测试场景缺失：白名单解析缺少「索引路径不属于当前根但文件真实存在且属于本应用持久化项目」的契约测试。
 - 审查盲区：安全收紧（根白名单）与数据可移植性（profile 迁移/DB 合并）之间的张力无人值守。
 
 ## 4. 修复与回归保护
 
 - getProjectMediaRoot/resolveProjectMedia：仅当目录含 project.json、manifest.projectId 与目录名一致、
   清单明确引用该文件时才把该目录作为该项目的只读媒体根（防伪造 manifest 越权读）。
 - getThumbnail 候选解析失败时回退到项目清单目录；_ensureVideoThumbnail 先补齐当前项目目录
   （跨 profile 项目当前目录可能不存在，ffmpeg 输出无目录可写）。
 - IPC validateFilePath 增加项目清单回退；create-share-url/get-thumbnail/copy-path/show-in-folder/save-as/export-zip 统一受益。
 - 回归测试：服务 4 例（放行/伪造拒绝/图片出图/视频首帧+目录补齐）+ IPC 5 例（放行/全路径拒绝/缩略图/导出成功/导出拒绝）。
 
 ## 5. 预防措施
 
 - 测试模板/审查清单补充条目：任何根白名单相关修改必须覆盖「合法项目但根外」的正反用例；
 - 沉淀 learnings：profile 间合并 DB 会带入项目索引，缩略图/预览接口依赖的白名单解析必须提供项目清单目录回退。
 
 ## 验证证据
 
 - 单测：story2video-project-service.test.js 116 passed；story2video.test.js 35 passed。
 - 真机（重启后 CDP）：4 个样本项目缩略图 status=ready（image/video-frame 两类都覆盖）；
   点击已完成卡片进入 /create/result 结果页，无报错弹窗，video 元素 readyState=4（可完整播放）。
