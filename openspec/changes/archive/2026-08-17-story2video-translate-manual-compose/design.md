# Design: 手动选材模式翻译与视频合成并行

## Data Flow

```text
optimize
  └─ non-en manual: context.prompt_translations_pending
      └─ generate_assets(manual candidates)
          └─ scene_asset_selection checkpoint
              └─ finalize_assets (candidateId/index + TTS)
                  └─ compose
                      ├─ composeVideo
                      └─ bounded prompt translation
```

## State Contract

- `prompt_translations_pending` 是可 JSON 序列化对象，包含 `uiLocale` 与 `{ index, prompt, translation? }[]`。
- `index` 是唯一场景身份；翻译响应不得按请求完成顺序或数组位置回填。
- 手动候选阶段允许 `promptTranslation: null`。这是“尚未完成”或“不可用”的可选字段，不是候选生成失败。
- `finalize_assets` 必须继续完整保留 `candidates`、`selection`、`scenes`、候选 ID 和媒体路径。并行任务只能更新场景的 `promptTranslation`。
- 已有有效翻译优先复用；翻译失败/超时保留 pending 和有效部分结果。

## Interaction Contract

- 候选素材 checkpoint 先展示，用户可直接选择图片/视频并确认，不出现“等待提示词翻译”的阻塞状态。
- 翻译不在候选选择面板中作为选择依据，也不改变候选排序。
- 合成阶段沿用既有 compose 进度；翻译为后台可选增强，不覆盖视频合成失败。
- 结果页/历史页仅在非英语 locale 且存在非空翻译时展示只读翻译。

## Failure Handling

- 空响应、非法 JSON、错误 index、错误 prompt、网络错误、单批超时和总预算耗尽均标记 translation degraded，保留原 prompt 和可用素材。
- compose 失败优先；并行翻译必须取消或安全收尾，不产生 unhandled rejection。
