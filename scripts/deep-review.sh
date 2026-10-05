#!/bin/sh
# 质量节拍 — CCG 深度双模型审查 · 本地入口
#
# 分层（SKILL.md §5.6.2）：
#   提交时  pre-commit  → ccg-review-decider.js  确定性判定，毫秒级
#   推送前  本脚本       → ccg-deep-review.js     双模型多轮对抗，分钟级
#
# 深度审查【不进 CI】：实测单次真实代码审查 >15 分钟，挂成 required check
# 会把仓库锁死。它是本地跑、结果落盘进 PR 的人工把关环节。
#
# 用法：
#   sh scripts/deep-review.sh            # 读 HEAD 的判定记录，按 mode 决定跑不跑
#   sh scripts/deep-review.sh --force    # 忽略 mode=skip，强制跑
#   sh scripts/deep-review.sh --dry-run  # 只打印将要做什么
#
# 退出码：0 无阻断 / 1 有阻断 / 2 环境或配置问题

set -u

ROOT="$(cd "$(dirname -- "$0")/.." && pwd)"
cd "$ROOT" || exit 2

FORCE=0
DRY=0
for a in "$@"; do
  case "$a" in
    --force) FORCE=1 ;;
    --dry-run) DRY=1 ;;
    --help|-h)
      sed -n '2,20p' "$0" | sed 's/^# \{0,1\}//'
      exit 0 ;;
  esac
done

say() { printf '%s\n' "$1"; }

# ---------- 1. 定位 node ----------
if ! command -v node >/dev/null 2>&1; then
  if [ -d "$HOME/.fnm" ]; then
    eval "$(fnm env --shell sh 2>/dev/null)" 2>/dev/null || true
  fi
fi
if ! command -v node >/dev/null 2>&1; then
  say "✗ 找不到 node。"
  say "  git 钩子不继承登录 shell 的 PATH，node 常常在这里丢失。"
  say "  修复：在 .husky/pre-commit 里复用本仓已有的 fnm/hermes node 兜底逻辑，"
  say "        或设置系统级 PATH 后重开终端。"
  exit 2
fi

# ---------- 2. 定位驱动 ----------
DRIVER=""
for c in \
  "$ROOT/scripts/ccg-deep-review.js" \
  "${CCG_ARL_DIR:+$CCG_ARL_DIR/ccg-deep-review.js}" \
  "$HOME/.claude/skills/adversarial-review-loop/scripts/ccg-deep-review.js"
do
  [ -n "$c" ] && [ -f "$c" ] && DRIVER="$c" && break
done
if [ -z "$DRIVER" ]; then
  say "✗ 找不到 ccg-deep-review.js。"
  say "  三种解法任选其一："
  say "    a) 把 adversarial-review-loop 的 scripts/ vendor 到本仓库 scripts/ 下"
  say "    b) 安装技能：npx ccg-workflow"
  say "    c) 设置 CCG_ARL_DIR 指向引擎目录"
  exit 2
fi

# ---------- 3. 读判定记录 ----------
SHA="$(git rev-parse HEAD 2>/dev/null || echo '')"
[ -n "$SHA" ] || { say "✗ 不在 git 仓库内"; exit 2; }
# 相对路径：node 的 require() 不认 POSIX 路径，脚本已 cd 到仓库根，用相对路径最稳
REC=".ccg/reviews/$SHA.json"

MODE=""
if [ -f "$REC" ]; then
  MODE="$(node -e "try{process.stdout.write(require('./$REC').mode||'')}catch(e){}" 2>/dev/null)"
fi

say "═══ CCG 深度审查（本地） ═══"
say "HEAD: ${SHA%${SHA#????????}}"
if [ -z "$MODE" ]; then
  say "判定记录: 无 —— 提交时没跑判定器"
  say ""
  say "请先提交一次（pre-commit 会生成 .ccg/reviews/<sha>.json），再跑本脚本。"
  say "或用 --dry-run 看本脚本将要做什么。"
  exit 0
fi
say "判定: $(echo "$MODE" | tr '[:lower:]' '[:upper:]')"

if [ "$MODE" = "skip" ] && [ "$FORCE" -eq 0 ]; then
  say "→ S 复杂度低风险，按决策矩阵跳过深度审查（--force 可强制）"
  exit 0
fi

# ---------- 4. 依赖体检 ----------
WRAPPER="${CODEAGENT_WRAPPER:-$HOME/.claude/bin/codeagent-wrapper.exe}"
[ -x "$WRAPPER" ] || [ -f "$WRAPPER" ] || {
  say "✗ 找不到 codeagent-wrapper: $WRAPPER"
  say "  生成：npx ccg-workflow"
  exit 2
}
command -v claude >/dev/null 2>&1 || say "⚠ 找不到 claude —— 评审后端不可用，引擎会降级为单后端"
command -v opencode >/dev/null 2>&1 || say "⚠ 找不到 opencode —— 出方案后端不可用，跨家族校验会降级"
say ""
say "依赖体检通过，开始深度审查（可能耗时 15 分钟以上，取决于 diff 体量）…"
say ""

# ---------- 5. 跑 ----------
if [ "$DRY" -eq 1 ]; then
  exec node "$DRIVER" --dry-run --sha "$SHA"
fi
exec node "$DRIVER" --sha "$SHA"
