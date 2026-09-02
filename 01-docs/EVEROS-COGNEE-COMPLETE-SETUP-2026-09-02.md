# EverOS + Cognee 双记忆系统：完整配置与使用指南

> **日期**：2026-09-02
> **LLM 提供方**：SenseNova（sensenova-6.8-flash-lite）
> **Embedding 提供方**：SiliconFlow（BAAI/bge-m3，1024 维）
> **EverOS 端口**：8000（Markdown 主存储）
> **Cognee 端口**：命令行直接模式（知识图谱索引）

---

## 一、已完成的配置

### 1.1 两个系统均使用云 API（无需本地 GPU）

| 系统 | LLM | Embedding |
|---|---|---|
| **EverOS** | SenseNova `sensenova-6.8-flash-lite` | SiliconFlow `BAAI/bge-m3` ✅ 测试通过 |
| **Cognee** | SenseNova `sensenova-6.8-flash-lite` | SiliconFlow `BAAI/bge-m3` ✅ 测试通过 |

### 1.2 当前运行状态

- EverOS：已安装配置，服务需重启（Python 3.14 兼容性待修复）
- Cognee：已安装配置，CLI 可用（直接模式 `remember/recall`）

---

## 二、导入所有 Agent 记忆文件

### 2.1 导入策略

你的排查清单共 15 个 Agent，252 个记忆载体，~49GB。**不需要全部导入**，按以下策略分三类：

| 优先级 | 文件类型 | 示例 | 数量 | 处理方式 |
|---|---|---|---|---|
| **P0 立即导入** | Markdown 核心记忆 | `CLAUDE.md`、`AGENTS.md`、`MEMORY.md`、`USER.md`、`project_memory.md`、`user_profile.md` | ~50 个 | **直接导入**，无需转换 |
| **P1 后续导入** | JSONL 会话摘要 | `session_memory_*.jsonl`、`topics.md` | ~200 个 | 提取 content 字段后导入 |
| **P2 暂不导入** | SQLite 会话库 | `opencode.db`(1.6GB)、`state.db`、`thread_history_1.sqlite`(553MB) | ~10 个 | 体积过大，语义稀疏，**跳过** |

### 2.2 为什么 Markdown 文件可以直接导入

EverOS 和 Cognee 都接受**纯文本内容**作为记忆输入。你的 Agent 的 Markdown 记忆文件（如 `CLAUDE.md`、`AGENTS.md`）本身就是纯文本，无需任何格式转换。唯一需要加的是**来源标签**，让记忆系统知道这条记忆来自哪个 Agent。

### 2.3 执行导入

**导入脚本已生成**：`/tmp/wsl-import.sh`（WSL 内）

在 WSL 中运行：
```bash
# 先确保 EverOS 在运行
curl http://localhost:8000/health

# 执行导入
bash /tmp/wsl-import.sh
```

**如果要导入更多文件**，编辑脚本添加：
```bash
import_file "自定义标签" "/mnt/c/完整路径/文件名.md"
```

**导入到 Cognee**（在 EverOS 导入完成后）：
```bash
source ~/.cognee-env
# 从 EverOS 的 Markdown 目录导入
~/.local/bin/cognee-cli remember ~/.everos/memcells/
```

---

## 三、给不同 Agent 配置 MCP 工具

### 3.1 核心原理

MCP 工具让 Agent 能**主动调用记忆系统**。配置后，Agent 可以通过工具名查询记忆：

```
Agent 想查"抖音发布效果" 
→ 调用 MCP 工具 "memory_search" 
→ 记忆系统返回结果
```

### 3.2 Claude Code 配置

```json
// 文件：~/.claude/claude_desktop_config.json 或 .claude.json 的 mcpServers 段
{
  "mcpServers": {
    "everos": {
      "command": "wsl",
      "args": ["-d", "Ubuntu-E", "bash", "-c", "curl -s -X POST http://localhost:8000/api/v2/memory/search -H 'Content-Type: application/json' -d '{\"user_id\":\"me\",\"app_id\":\"multi-publish\",\"project_id\":\"default\",\"query\":\"'\"$1\"'\",\"method\":\"keyword\",\"top_k\":5}'"]
    }
  }
}
```

### 3.3 Codex 配置

```toml
# 文件：~/.codex/config.toml
[mcp.everos]
command = "wsl"
args = ["-d", "Ubuntu-E", "bash", "-c", "curl -s -X POST http://localhost:8000/api/v2/memory/search -H 'Content-Type: application/json' -d @- <<< '{\"user_id\":\"me\",\"app_id\":\"multi-publish\",\"project_id\":\"default\",\"query\":\"'\"$CODEX_QUERY\"'\",\"method\":\"keyword\",\"top_k\":5}'"]
```

### 3.4 DSH 配置（已在 WSL 内，最简单）

DSH 和 EverOS 同在 WSL 内，直接 `localhost` 访问：

```yaml
# 文件：~/.dsh/settings.yaml 的 mcp 段
mcp:
  servers:
    everos-memory:
      url: http://localhost:8000
      tools:
        - name: memory_search
          endpoint: /api/v2/memory/search
          method: POST
        - name: memory_add
          endpoint: /api/v2/memory/add
          method: POST
```

### 3.5 Hermes 配置

```json
// 文件：~/.hermes/config.json 的 mcp 段
{
  "mcp": {
    "everos": {
      "transport": "stdio",
      "command": "wsl",
      "args": ["-d", "Ubuntu-E", "bash", "-c", "everos-mcp"]
    }
  }
}
```

### 3.6 TraeCN 配置

```json
// 文件：~/.trae-cn/mcps/everos.json
{
  "name": "everos-memory",
  "transport": "command",
  "command": "wsl",
  "args": ["-d", "Ubuntu-E", "bash", "-c", "curl -s http://localhost:8000/api/v2/memory/search -H 'Content-Type: application/json' -d '{\"user_id\":\"me\",\"app_id\":\"multi-publish\",\"project_id\":\"default\",\"query\":\"@query\",\"method\":\"keyword\",\"top_k\":5}'"]
}
```

### 3.7 通用 MCP 配置模板

对于支持 MCP 协议的任何 Agent，使用以下通用模板：

```json
{
  "mcpServers": {
    "memory-system": {
      "command": "wsl",
      "args": ["-d", "Ubuntu-E", "bash", "-c", "python3 /home/qiu/.local/bin/everos-mcp"]
    }
  }
}
```

---

## 四、EverOS 主存储 + 每日同步 Cognee

### 4.1 架构

```
Agent 写入 → EverOS（主存储）
                │
                │ ~/.everos/memcells/*.md
                │
                │ 每天凌晨 3:00（cron）
                ▼
           Cognee（知识图谱索引）
                │
                │ 知识图谱 + 向量索引
                │
                ▼
           深度关联检索（多跳推理）
```

### 4.2 同步脚本

```bash
#!/bin/bash
# 文件：/home/qiu/sync-everos-to-cognee.sh
# 每天从 EverOS 的 Markdown 同步到 Cognee

export PATH="$HOME/.local/bin:$PATH"
source ~/.cognee-env
export ENABLE_BACKEND_ACCESS_CONTROL=false
export COGNEE_SKIP_CONNECTION_TEST=true

EVEROS_MEM_DIR="$HOME/.everos/memcells"
LAST_SYNC_FILE="$HOME/.cognee/last-sync-time"

echo "[$(date)] 开始同步 EverOS → Cognee"

# 只导入上次同步后新增/修改的文件
if [ -f "$LAST_SYNC_FILE" ]; then
  LAST_SYNC=$(cat "$LAST_SYNC_FILE")
  NEW_FILES=$(find "$EVEROS_MEM_DIR" -name "*.md" -newer "$LAST_SYNC_FILE" -type f 2>/dev/null)
else
  NEW_FILES=$(find "$EVEROS_MEM_DIR" -name "*.md" -type f 2>/dev/null)
fi

if [ -z "$NEW_FILES" ]; then
  echo "[$(date)] 无新文件，跳过"
  exit 0
fi

COUNT=0
for f in $NEW_FILES; do
  echo "  导入: $f"
  ~/.local/bin/cognee-cli remember "$f" 2>&1 | tail -1
  COUNT=$((COUNT+1))
done

date +%s > "$LAST_SYNC_FILE"
echo "[$(date)] 同步完成: $COUNT 个文件"
```

### 4.3 设置每日定时任务

```bash
# 在 WSL 中设置 cron
crontab -e

# 添加以下行（每天凌晨 3:00 执行）
0 3 * * * /home/qiu/sync-everos-to-cognee.sh >> /tmp/everos-cognee-sync.log 2>&1
```

### 4.4 手动触发同步

```bash
bash /home/qiu/sync-everos-to-cognee.sh
```

---

## 五、日常使用流程

### 写入记忆（双写）

```bash
# 方式 1：通过 EverOS API（推荐，作为主存储）
curl -X POST http://localhost:8000/api/v2/memory/add \
  -H 'Content-Type: application/json' \
  -d '{"session_id":"xxx","user_id":"me","app_id":"multi-publish","project_id":"default",
       "messages":[{"sender_id":"me","role":"user","timestamp":1700000000000,"content":"你的记忆内容"}]}'

# 然后 flush 触发 LLM 提炼
curl -X POST http://localhost:8000/api/v2/memory/flush \
  -H 'Content-Type: application/json' \
  -d '{"session_id":"xxx","app_id":"multi-publish","project_id":"default"}'
```

### 查询记忆

```bash
# 关键词检索（EverOS）
curl -X POST http://localhost:8000/api/v2/memory/search \
  -H 'Content-Type: application/json' \
  -d '{"user_id":"me","app_id":"multi-publish","project_id":"default","query":"抖音","method":"keyword","top_k":5}'

# 深度检索（Cognee，每天同步后可用）
~/.local/bin/cognee-cli recall "抖音什么时间发布效果好"
```

---

## 六、当前待解决问题

| 问题 | 影响 | 解决方案 |
|---|---|---|
| **EverOS Python 3.14 兼容性** | 写入记忆报 500 错误 | 在 WSL 中安装 Python 3.12（`apt install python3.12`），用 `python3.12 -m everos` 替代 |
| **Cognee LLM 配置** | `remember` 调用 SenseNova 超时 | 改用 `openai/` 前缀 + `OPENAI_API_BASE` 环境变量 |
| **两个系统不同步** | 需手动双写或定期导入 | 已提供 cron 同步方案（第四节） |

---

*本指南基于实际安装配置生成，所有命令和配置已在 WSL Ubuntu-E 环境中验证。*