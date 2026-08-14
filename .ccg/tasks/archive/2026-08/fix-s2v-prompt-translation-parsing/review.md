# fix-s2v-prompt-translation-parsing — 根因分析

## 现象
- 分段1 中文翻译显示字面 `json`
- 分段2 中文翻译显示 `{"0":"...","1":"..."}` JSON 对象文本

## 根因
`translatePromptsForLocale` 函数（story2video-stages.js:97）调用 LLM 翻译英文提示词，
LLM 被要求返回 JSON `{"0":"译文一","1":"译文二"}`。

部分 LLM 模型（如 DeepSeek）会在 JSON 外包裹 markdown 代码块：
```
```json
{"0":"译文一","1":"译文二"}
```
```

`JSON.parse(raw)` 对带代码块的文本失败 → 进入逐行回退 → 按 `\n` 分割后：
- 第1行 `json`（从 ````json` 去掉反引号）→ 被当作分段0的译文
- 第2行 `{"0":"...","1":"..."}` → 被当作分段1的译文

## 修复
1. JSON.parse 前剥离 markdown 代码块（正则匹配 ```...``` 包裹）
2. JSON 解析成功路径：验证译文不是 JSON 对象文本或 `json` 标记
3. 逐行回退路径：后置清理排除 JSON 对象文本和代码块标记

## 测试
- 新增 7 个回归测试，覆盖：正常解析、fence 解析、无标签 fence、回退路径防御、null input、空列表
- 全量测试 92/92 通过
