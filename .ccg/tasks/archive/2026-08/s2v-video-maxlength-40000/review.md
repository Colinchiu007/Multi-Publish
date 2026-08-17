# 审查报告：s2v-video-maxlength-40000（视频提示词上限 20000 → 40000）

> 变更：桌面契约 videoMaxLengthMax/standalone range 20000→40000；videoPrompt 落库 safeText 视频专属 20000→40000（图片 prompt 20000 不动）；引擎侧 models.py le=20000→40000（外部仓 change video-maxlength-40000）。

## 审查通道

- **antigravity**：不可用（wrapper exit 1，地域资格拒绝；与上轮 #906 同证据）。
- **claude**：本次通道曾恢复（ping exit 0），正式审查运行 ~12 分钟（thinking_tokens 1800+ 持续增长）后 wrapper 报 `claude completed without agent_message output` exit 1——CLI 通量/输出捕获问题，未取得审查文本；已有可用 MESSAGE 无，按 10 分钟介入规则停止，不盲等。
- **降级结论**：按机制硬化既有先例，降级主代理直审（0 Critical / 0 Warning / Info 2 条见下）。

## 审查内容与结论（主代理直审）

**Critical：0**

**Warning：0**

**Info：**
1. `generateSceneAiVideo` 入模型提示词 `safeText(videoPrompt||prompt||text, 20000)` 保持 20000——视频素材生成走模型供应商各自长度契约（Seedance 等普遍远小于 40000），不属于「视频优化词」域上限；若后续供应商支持更长输入可单独放开（记录不纳入本次）。
2. `VideoEvaluateRequest.max_length`（8020 独立评测 API）le=20000 保持——桌面契约不调用该端点，属独立语义；本次放宽面仅优化请求与 feedback 闭环。

## 核对清单（PASS）

- 契约：videoMaxLengthMax=40000、standalone [200,40000]、legacy [50,2000] 与 refined 5000/batch 1800 默认不动；W2 锚点测试（standalone.max === videoMaxLengthMax）仍成立。
- 落库：videoPrompt 三处（normalizeComposeScenes 两处含 fallback / updateSegments / video 优化落库）→ 40000；图片 prompt 20000 与 promptTranslation 20000 不动。
- 测试：契约 clamp（99999→40000、22000/30000 范围内透传、40000 精确边界、legacy 2000）；服务层 max_length=40000 透传 + 25000 字符（>旧 20000 上限）完整落库；定向 186 passed + 视频域回归 146 passed。
- 门禁：engine 全量 pytest 951 passed；桌面 QM-1 win-unpacked 构建 + asar 含 40000 + require 链 + 8s 启动冒烟通过（完整安装器 NSIS 步骤因机器页面文件不足 os error 1455 失败，环境性，CI 正式构建覆盖）；`git diff --check` PASS（引擎 CHANGELOG CRLF 文件除外，repo 既有约定）。
