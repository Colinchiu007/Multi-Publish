#!/bin/sh
# 质量节拍 — 决策层：方案对抗评审（动手写码之前）
#
# 分层（SKILL.md §5.6.3）：
#   决策层  Phase 1 出方案后、动手前  →  本脚本      objectType=plan
#   验证层  改完之后                  →  deep-review.sh  objectType=code
#
# 这是 adversarial-review-loop 引擎的主流程：
#   出方案 → 跨家族挑刺 → 逐条回应(可拒绝但须给证据) → 多轮收敛 → 才动手
#
# 用法：
#   sh scripts/plan-review.sh <方案文件>       # 对方案跑对抗评审
#   sh scripts/plan-review.sh <方案文件> --dry-run
#   sh scripts/plan-review.sh <方案文件> --force   # 忽略 mode=skip，强制跑
#
# 退出码：0 收敛可动手 / 1 有阻断或已升级给人 / 2 环境问题

set -u

ROOT="$(cd "$(dirname -- "$0")/.." && pwd)"
cd "$ROOT" || exit 2

PROPOSAL=""
FORCE=0
DRY=0
for a in "$@"; do
  case "$a" in
    --force) FORCE=1 ;;
    --dry-run) DRY=1 ;;
    --help|-h)
      sed -n '2,18p' "$0" | sed 's/^# \{0,1\}//'
      exit 0 ;;
    -*) ;;
    *) [ -z "$PROPOSAL" ] && PROPOSAL="$a" ;;
  esac
done

say() { printf '%s\n' "$1"; }

# ==========================================================================
#  环境闸：拒绝 WSL
# ==========================================================================
# 与 deep-review.sh 同源的一道闸，防的是**报错文案把人带偏**：
# 本机裸 bash 解析到 WSL shim（C:\windows\system32\bash.exe）时，$HOME 变成
# WSL 的 /home/<user>，Windows 侧的 node / 后端 CLI / codeagent-wrapper 全不可见，
# 本脚本于是打印「找不到 ccg-review-decider.js」并建议设置 CCG_ARL_DIR ——
# 而该变量在 Process/User/Machine 三级作用域**都不存在**，追它是死路。
#
# 决策层（plan）比验证层（code）更没有退路：它还缺 --check-deps 这个诊断入口，
# 真出事时连一条能问的命令都没有，所以更需要在入口就把根因说破。
#
# ⚠ 只拦 WSL，不拦真 Linux（含 GitHub Actions ubuntu runner）——
#   POSIX 分支在真 Linux 上是能工作的，判据写成「必须是 Git Bash」会打死 CI。
#   判据与检测手段的取舍见 deep-review.sh 同名段落（此处不重复展开）。
_is_wsl() {
  [ -n "${WSL_DISTRO_NAME:-}" ] && return 0
  [ -n "${WSL_INTEROP:-}" ] && return 0
  # 兜底：环境变量被 wrapper 清洗过时，只剩内核版本串可认。
  # shell 内建 read + 重定向，不经 cat —— 入口不得依赖 PATH 里的工具目录。
  if [ -r /proc/version ]; then
    while IFS= read -r _wsl_line || [ -n "$_wsl_line" ]; do
      case "$_wsl_line" in
        *[Mm]icrosoft*|*[Ww][Ss][Ll]*) return 0 ;;
      esac
      break
    done < /proc/version
  fi
  return 1
}

if _is_wsl; then
  say "✗ 当前 shell 是 WSL（Windows Subsystem for Linux），不是 Git Bash —— 本脚本在这里跑不动。"
  say ""
  say "  WSL 的 \$HOME 是 /home/<user>，Windows 侧的 node、后端 CLI、"
  say "  codeagent-wrapper 全部不可见，所以下面任何「找不到」都是假象。"
  say ""
  say "  根因通常是「裸 bash 解析到了 WSL shim」："
  say "    C:\\windows\\system32\\bash.exe  ← WSL 入口（裸 bash 命中的是它）"
  say "    <Git 安装目录>\\usr\\bin\\bash.exe ← Git Bash（要用的是这个）"
  say ""
  say "  正确跑法（推荐：PowerShell 入口会自动定位 Git Bash 并校验身份）："
  say "    .\\scripts\\ccg-review.ps1 -Mode Plan -Proposal <方案文件>"
  say ""
  say "  最后一句：这**不是**环境变量没传进来。不要去查、不要去设 CCG_ARL_DIR ——"
  say "  该变量在 Process/User/Machine 三级作用域本来就不存在，追它是死路。"
  exit 2
fi

[ -n "$PROPOSAL" ] || {
  say "用法: sh scripts/plan-review.sh <方案文件> [--dry-run] [--force]"
  say ""
  say "方案文件通常是 Phase 1 产出的 plan.md / PRD / 技术方案。"
  exit 2
}
[ -f "$PROPOSAL" ] || { say "✗ 找不到方案文件: $PROPOSAL"; exit 2; }

# ---------- 1. node ----------
if ! command -v node >/dev/null 2>&1; then
  [ -d "$HOME/.fnm" ] && eval "$(fnm env --shell sh 2>/dev/null)" 2>/dev/null
fi
command -v node >/dev/null 2>&1 || {
  say "✗ 找不到 node。git 钩子不继承登录 shell 的 PATH，node 常在这里丢失。"
  exit 2
}

# ---------- 2. 定位工具 ----------
DECIDER=""
for c in "$ROOT/scripts/ccg-review-decider.js" \
         "${CCG_ARL_DIR:+$CCG_ARL_DIR/../quality-rhythm/installer/ccg-review-decider.js}"; do
  [ -n "$c" ] && [ -f "$c" ] && DECIDER="$c" && break
done
DRIVER=""
for c in "$ROOT/scripts/ccg-deep-review.js" \
         "${CCG_ARL_DIR:+$CCG_ARL_DIR/ccg-deep-review.js}" \
         "$HOME/.claude/skills/adversarial-review-loop/scripts/ccg-deep-review.js"; do
  [ -n "$c" ] && [ -f "$c" ] && DRIVER="$c" && break
done
[ -n "$DECIDER" ] || { say "✗ 找不到 ccg-review-decider.js（判定器）"; exit 2; }
[ -n "$DRIVER" ]  || { say "✗ 找不到 ccg-deep-review.js（引擎驱动）"; exit 2; }

# ---------- 3. 判定方案复杂度（决策层） ----------
say "═══ 决策层：方案对抗评审 ═══"
say "方案: $PROPOSAL"
say ""
DEC_OUT="$(node "$DECIDER" --input "$PROPOSAL" --print 2>&1)"
printf '%s\n' "$DEC_OUT"
say ""

MODE="$(printf '%s' "$DEC_OUT" | sed -n 's/.*判定 \[\?[^]]*\]\?: *\([A-Z]*\).*/\1/p' | head -1)"
[ -n "$MODE" ] || MODE="$(printf '%s' "$DEC_OUT" | grep -o '\(SKIP\|SINGLE\|DUAL\)' | head -1)"

if [ "$MODE" = "SKIP" ] && [ "$FORCE" -eq 0 ]; then
  say "→ S 复杂度低风险，跳过跨家族对抗评审（--force 可强制）"
  say "   按质量节拍继续 Phase 1→2 即可。"
  exit 0
fi

# ---------- 4. 依赖体检 ----------
WRAPPER="${CODEAGENT_WRAPPER:-$HOME/.claude/bin/codeagent-wrapper.exe}"
{ [ -x "$WRAPPER" ] || [ -f "$WRAPPER" ]; } || {
  say "✗ 找不到 codeagent-wrapper: $WRAPPER"
  say "  生成：npx ccg-workflow"
  exit 2
}
command -v claude   >/dev/null 2>&1 || say "⚠ 找不到 claude —— 评审后端不可用，跨家族会降级为单后端"
command -v opencode >/dev/null 2>&1 || say "⚠ 找不到 opencode —— 出方案后端不可用，跨家族会降级"
say ""
say "开始跨家族对抗评审（出方案 → 挑刺 → 逐条回应 → 收敛，15 分钟以上）…"
say ""

# ---------- 5. 跑引擎（objectType=plan） ----------
if [ "$DRY" -eq 1 ]; then
  exec node "$DRIVER" --dry-run --proposal "$PROPOSAL"
fi
exec node "$DRIVER" --proposal "$PROPOSAL"
