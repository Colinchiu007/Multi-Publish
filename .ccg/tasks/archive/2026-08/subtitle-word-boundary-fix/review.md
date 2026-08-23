# Review: subtitle-word-boundary-fix

## 审查范围

- Multi-Publish：Electron JS 镜像、TypeScript 引擎、共享规则、共享向量。
- smart-sentence-splitter：Python 引擎、共享规则、单元与向量测试。
- 用户长文案：蒙古/江南语义边界、未闭合引号后正文、明代士绅完整文案、新一轮元明朝大儒长文案。

## 外部模型

- opencode reviewer：wrapper 启动后因命令行长/opencode 后端退出，返回 exit 1，未产出报告。
- Claude reviewer：wrapper 运行超过 10 分钟未返回，主代理按 10 分钟介入规则中断，exit 1；期间其临时测试文件已被识别并清理。
- 已按仓库既往惯例记录降级，本地完成逐项审查。

## 本地审查结论

- Critical：0
- Warning：0
- Info：
  - 长文案中仍有个别以虚词结尾或开头的切分（如“底层农民的|实际负担…”），属于现有词边界启发式边界，不落在本轮保护词内部。
  - `protectedPhrasePrefixAtEnd` 已修复：文本完整结束于受保护短语时，不再把末尾单字误判为另一短语前缀（修复了“江南”被“南宋灭亡时”前缀误伤）。

## 验证快照

- Electron：story2video-segmentation 37 passed；vectors+parity 104 passed。
- TypeScript：story2video-engine 169 passed；subtitle-vectors 99 passed；tsc --noEmit PASS。
- Python：test_subtitle_vectors + test_scene_subtitle 169 passed；ruff src PASS。
- 用户最新长文案经真实入口输出 221 个字幕块，未含本轮保护词内部断点。
