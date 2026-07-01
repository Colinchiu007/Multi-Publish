---
name: fuse-nullbyte-corruption
description: FUSE Write/Edit 工具写入文件时注入 null 字节导致语法错误，以及 heredoc/Python 修复方法
type: feedback
---

# FUSE null byte corruption

**规则：** 不通过 FUSE 文件工具（Write/Edit）写入 `.js`/`.py` 等可执行文件。改用 bash heredoc 或 Python 文件写入。

**Why:** FUSE mount（D:\Data\projects 挂载到 WSL）的 Write/Edit 工具在文件末尾注入 `\x00` 字节（约 70+），触发 `SyntaxError: Invalid or unexpected token`。

**How to apply：**
- 读文件：Read 工具正常
- 小改动：用 `python3 -c "..."` 在 bash 中直接做文本替换并写回
- 大改动：用 Python heredoc 写整个文件：`python3 << 'PYEOF'\n...\nPYEOF`
- 新增文件：用 Write 工具创建骨架，再用 bash heredoc 写入实际内容
- 检测：写入后始终执行 `node --check <file>` 验证语法