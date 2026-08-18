# film-kit 数据资产 Schema（《Hell Grind》影视工程）

> 本目录由 `scripts/film-engineering/fetch-hell-grind-kit.py` 从公开语料重建（可复现）。
> 加载与校验实现：`apps/desktop/electron/services/film-engineering/kit-loader.js`（fail-closed）。
> 校验不通过 → 整体返回 `FILM_KIT_UNAVAILABLE`，不允许部分降级。

## 文件清单

| 文件 | 必填 | 说明 |
|------|------|------|
| `film-manifest.json` | ✅ | 电影元数据 + 162 场景树 |
| `shot-library.json` | ✅ | 153 个分镜（每场景代表性真实提示词） |
| `reference-registry.json` | ✅ | token → 参考素材索引（332 条，100% 解析） |
| `prompt-doctrine.json` | ✅ | 提示词架构（7 blocks / 10 rules / 6 glossary，中英双语） |
| `prompt-doctrine.zh.md` | 否 | 方法论文档（人类可读版，随包交付） |
| `images/` | 否 | 精选参考图（4 角色定妆 + 6 场景缩略，512px webp）+ `images-manifest.json` |

体积目标：< 6MB（当前约 2.8MB）。

## 一、film-manifest.json

```jsonc
{
  "schemaVersion": 1,                       // 必须 === 1
  "filmMeta": {
    "title": "Hell Grind",                  // 非空字符串
    "durationSec": 5706,                    // 正数
    "logline": "…",                         // 非空字符串
    "characters": [{ "name": "ROKO", "descriptor": "…" }],  // 非空数组，每项含非空 name
    "source": { "projectUrl": "…", "skillRepo": "…", "apiBase": "…" }
  },
  "scenes": [
    { "id": "<uuid>", "name": "…", "count": 3, "parentId": "<uuid|null>", "level": 0 }
  ]
}
```

校验规则（kit-loader）：
- `scenes` 非空；`id` 唯一非空；`name` 非空；`count >= 0`；`level >= 0`。
- 树校验：`parentId` 必须指向已存在场景或为 `null`；禁止自引用（环）。

## 二、shot-library.json

```jsonc
[
  {
    "shotId": "<uuid>",          // 唯一非空
    "sceneId": "<uuid>",         // 必须存在于 manifest.scenes
    "prompt": "EXACT 3 CHARACTERS…",  // 非空；上限 50000 字符（真实提示词最高约 39470）
    "model": "seedance_2_0",     // 非空
    "refTokens": ["<uuid>", …],  // 可选；数组，每项字符串 ≤64 字符
    "resultUrl": "https://…",    // 可选；https URL
    "thumbnailUrl": "https://…", // 可选；https URL
    "width": 1920,               // 可选；正数或 null
    "height": 1080               // 可选；正数或 null
  }
]
```

- 每个场景取最后一个 `completed` 的视频类 job（按 `created_at` 升序）作为代表分镜。

## 三、reference-registry.json

```jsonc
{
  "<uuid-token>": {
    "kind": "character | scene | prop | unknown",
    "name": "REIN | museum | crystal_sword | null",  // 若存在必须非空
    "category": "character | auto:character | environment | prop …",  // 可选
    "folder": "<来源文件夹名>",       // 可选（job-id 兜底解析时才有）
    "imageUrls": ["https://…"]      // 可选；仅允许 https
  }
}
```

- **key 必须是 UUID**（36 字符）；非 UUID key（如统计占位）一律非法。
- 解析顺序：`params.reference_elements[].id` 主索引 → job id 兜底 → `unknown`。
- `unknown` 条目允许存在（保留少量样例），但分镜 refTokens 应尽量全部解析为 known。

## 四、prompt-doctrine.json

```jsonc
{
  "blocks": [{ "key": "scene_context", "label": "SCENE CONTEXT", "zh": "…", "en": "…" }],  // 非空
  "rules": [{ "key": "assets-first", "title": "…", "zh": "…", "en": "…" }],               // 非空
  "glossary": [{ "term": "seedance_2_0", "zh": "…", "en": "…" }]                          // 数组
}
```

## 五、images/images-manifest.json

```jsonc
{
  "char_1.webp": { "name": "ROKO" },                       // 角色定妆图
  "scene_1.webp": { "shotId": "<uuid>", "sceneId": "<uuid>" }  // 场景缩略图
}
```

- 所有图片统一 `512px` 最长边 webp（q82），单张 < 20KB，合计 < 120KB。
- 角色图按 `ROKO / JAXX / LULU / REIN` 优先，缺失时取其他 character 条目兜底。

## 六、生成与重建

```bash
python scripts/film-engineering/fetch-hell-grind-kit.py \
    --source-dir D:/Data/projects/mp-research/hell-grind-full \
    --out-dir apps/desktop/electron/film-kit
```

- 语料为公开 API 一次性抓取（155,123 jobs / 161 jsonl），脚本本地离线重建，无需登录。
