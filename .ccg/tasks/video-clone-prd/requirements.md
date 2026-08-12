# 视频克隆（视频对标拆解与再创作）— 需求摘要

> 状态：需求已确认（2026-08-12，§8 全部拍板）；完整 PRD v1.0 见 01-docs/PRD-VIDEO-CLONE-2026-08-12.md

## 一句话需求
输入线上视频链接（抖音/小红书/快手/B站/视频号/YouTube/TikTok/Ins）或本地视频文件 → 自动拆解分析（剧情/文案/文案风格/画面风格/画面元素/节奏/听觉/平台参数）产出可编辑报告 → 按报告生成「同款结构+同款风格+内容再创作」成片，尽量接近 100% 一样（以复刻层级 L0-L3 量化，L3 不做）。

## 参考调研（2026-08-12）
GitHub 调研完成：01-docs/RESEARCH-VIDEO-CLONE-REFERENCE-2026-08-12.md（无完整开源成品；LuoGen 家族最接近；组件成熟可复用）。

## 已定决策（2026-08-12 拍板）
- 产品形态：独立 VideoClonePipeline（ingest→analyze→plan→generate→compose→publish），与 Story2Video 编排隔离；
- 共享底层引擎：splitter、scene-context、prompt-engine(8013)、ModelProviderManager、TTS、ffmpeg 合成、PublisherRouter、StageExecutor 模式；
- 新增组件：8 平台下载器、分析报告引擎、CloneReport schema、复刻模式/相似度自检、AI 标识/授权确认；
- 合规边界：不做 L3 素材级复刻/去水印/规避反爬/一键搬运；不克隆真实人脸身份/换脸（参考图/一致性保持技术可借鉴用于风格化形象，不克隆真实身份）。

## 决策记录（§8，已拍板）
1. 「100% 一样」指哪一层（L0/L1/L2）？
2. 目标用户是对标创作者还是搬运矩阵号？
3. 是否必须复刻真人声音/人脸？
4. 第一优先视频类型（口播/B-roll/录屏/剧情短剧）？
5. 单条成本与耗时预算上限？

## 后续
已确认 → 进入 OpenSpec（/opsx:propose）→ 实施计划（/create-plan）。
