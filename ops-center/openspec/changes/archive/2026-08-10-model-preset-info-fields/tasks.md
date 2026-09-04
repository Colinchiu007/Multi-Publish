## 1. 后端字段与校验

- [ ] 1.1 models.py 新增 models_url/rate_per_minute/limit_per_5h 列
- [ ] 1.2 service：字段校验（URL/正整数可空/default_model∈models/7能力键）+ _to_dict 输出
- [ ] 1.3 种子 PRESET_CATALOG 补充新字段
- [ ] 1.4 测试：合法/空值/非法 URL/非法数字/default 不在列表/未知能力键

## 2. 获取模型端点

- [ ] 2.1 新增 httpx 依赖 + fetch-models 端点（SSRF 防护/超时/大小/JSON 契约/回写）
- [ ] 2.2 测试：成功契约、超时、非 JSON、SSRF 拒绝（私网/重定向）、未配置 models_url

## 3. 前端

- [ ] 3.1 api/modelPresets.js 新增 fetchModelIds
- [ ] 3.2 ModelPresets.vue：新字段表单 + 默认模型下拉 + 获取模型按钮 + 7 能力文档输入 + 限流列
- [ ] 3.3 前端构建通过（npm run build）

## 4. 文档与归档

- [ ] 4.1 docs/PRD.md、CHANGELOG 更新（字段/校验/交互/提示文案）
- [ ] 4.2 openspec validate + 归档（三同步）
