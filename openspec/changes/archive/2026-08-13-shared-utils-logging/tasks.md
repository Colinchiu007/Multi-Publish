## 1. 脱敏与注释（R1）

- [x] 1.1 修正文件头注释（真实实现差异说明）
- [x] 1.2 内联 SECRET_PATTERNS 5 组 + redact()，writeLog 对 tag/msg 脱敏后同源写文件与控制台
- [x] 1.3 测试：Bearer/sk-/access_token/cookie/JWT/password 不落盘原文

## 2. 可注入（R2）

- [x] 2.1 新增 `setLogOptions({ file, maxSize, level })`（默认行为不变）
- [x] 2.2 测试：注入临时路径写入、超限轮转 .1、默认路径不污染

## 3. 验证与交付

- [x] 3.1 shared-utils vitest 通过（logger.test.js + scheduler 等既有测试）
- [x] 3.2 引用方回归：format-adapter/cover-processor 相关测试
- [x] 3.3 `openspec validate shared-utils-logging` 通过
- [x] 3.4 提交、推送、PR、合并、三同步归档（含 learnings + 文档门禁同步）

