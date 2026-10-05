# QM-6 前端评审任务书（命名 / 模式 / 可维护性 / 集成风险）

被审对象：worktree `D:/Data/projects/mp-worktrees/mp-bilibili-bvid-extract`，commit `6a534bd8292df31970a6471d3e83b70c7a8818ec`
diff：`.ccg/bvid-impl.diff`；规格：`docs/PRD-BILIBILI-PUBLISH-ID-EXTRACT-2026-10-06.md`
模块：`apps/desktop/electron/services/rpa-publish-id-extract.js`；测试：同目录 `rpa-publish-id-extract.test.js`

## 背景（一句话）
为一个纯函数模块新增「B 站作品标识按值形态识别」判据 + 新建该模块的首个行为测试文件。

## 必须逐条回答
1. 该模块自称「纯函数、无平台耦合」。新加的 `BILIBILI_HOST`/`BILIBILI_WORK_ID_SHAPE` 是否破坏了这一契约？
   若后续接入抖音/快手/视频号的视频形态，现有结构是**可扩展**还是要再抄一份？给出具体重构建议与代价。
2. 命名与注释是否符合本仓既有风格（中文注释说明「为什么」，不解释「是什么」）？是否有注释把未观测事实写成事实？
3. `matchBilibiliWorkIdKey` 同时被 query 与 response-body 两条链复用，但只有 query 链有主机限定——
   这个不对称是否应该显式写出来（函数名/注释/拆成两个）？给出你认为最小的可维护写法。
4. 测试组织：10 例分两个 describe 是否合理？负例（A5/A6/A7）与正例是否成对且互相可区分？
   有没有「断言实现细节而非行为」的用例？
5. 集成风险：`rpa-view-platforms.js` 对非 strict 平台的取值顺序是
   `explicitId || responseId || extractPublishIdFromUrl(result.url) || extractPublishIdFromUrl(currentUrl)`。
   本次改动是否会让**抖音/小红书**等未取证平台意外产出 id？逐个平台给结论。
6. 该模块此前无独立测试文件（AGENTS.md 有「测试文件必须显式接进 CI，否则等于没写」的纪律）。
   请确认新测试文件是否真会被 CI 执行（本仓 vitest `include` 含 `electron/services/**/*.test.js`），
   并指出若有遗漏应如何登记。

## 输出要求（硬性）
把结论**写入文件** `D:/Data/projects/mp-worktrees/mp-bilibili-bvid-extract/.ccg/qm6-bvid-frontend-findings.json`，
JSON 数组，每项 `{"severity":"Critical|Warning|Info","file":"...","line":0,"issue":"...","fix":"..."}`。
不得只在 stdout 输出；文件必须存在且非空。
