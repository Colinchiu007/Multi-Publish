## Purpose

定义聚合采集（aggregation）的核心数据模型契约：CollectResult 承载图文与视频两类采集结果，字段向后兼容，下游改写/发布无需感知来源类型。

## ADDED Requirements

### Requirement: CollectResult 采集结果数据模型
CollectResult SHALL 在现有字段（title, content, original_title, source_url, author, word_count, summary, tags, metadata）基础上新增可选字段：media_type（"article" | "video"，默认 "article"）、video_url（str，默认空）、duration（float，默认 0）、transcript（str，默认空）。字段全部带默认值，保证旧客户端与旧数据完全兼容。视频采集结果中 content 与 transcript 均为转写文案；图文采集结果的 content 语义不变。

#### Scenario: 图文采集响应不变
- **WHEN** 通过现有 /aggregation/collect 采集普通网页
- **THEN** 响应 JSON 含全部原有字段，media_type 为 "article"，新增字段为默认空值

#### Scenario: 视频采集响应字段
- **WHEN** 通过 /aggregation/collect-video 采集抖音视频成功
- **THEN** 响应含 media_type="video"、video_url、duration、transcript、word_count（转写文案字数）、metadata.platform
