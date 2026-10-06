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
#   sh scripts/deep-review.sh              # 读 HEAD 的判定记录，按 mode 决定跑不跑
#   sh scripts/deep-review.sh --force      # 忽略 mode=skip，强制跑
#   sh scripts/deep-review.sh --dry-run    # 只打印将要做什么
#   sh scripts/deep-review.sh --check-deps # 只体检评审后端依赖（不需要 node / git 记录）
#
# 退出码：0 无阻断 / 1 有阻断 / 2 环境或配置问题

set -u

# 刻意不依赖 dirname：这行在任何别的检查之前跑，是全脚本第一个外部依赖。
# 用 dirname 的话，--check-deps 这个「环境坏掉时的第一手诊断」会先被
# `dirname: command not found` 打死——而本机 PATH 恰恰是会丢工具目录的那种
# （见下面「后端解析」注释）。参数展开版对相对/绝对 $0 语义完全一致。
_self_dir="$0"
case "$_self_dir" in
  */*) _self_dir="${_self_dir%/*}" ;;
  *)   _self_dir="." ;;
esac
ROOT="$(cd "$_self_dir/.." && pwd)"
cd "$ROOT" || exit 2

FORCE=0
DRY=0
CHECK_DEPS=0
for a in "$@"; do
  case "$a" in
    --force) FORCE=1 ;;
    --dry-run) DRY=1 ;;
    --check-deps) CHECK_DEPS=1 ;;
    --help|-h)
      sed -n '2,18p' "$0" | sed 's/^# \{0,1\}//'
      exit 0 ;;
  esac
done

say() { printf '%s\n' "$1"; }

# ==========================================================================
#  后端解析：为什么不能只靠继承来的 PATH
# ==========================================================================
# codeagent-wrapper 用**裸名** spawn 后端（实测 stderr 诊断头原文：
#   Command: claude -p --dangerously-skip-permissions --output-format stream-json ...
#），所以后端能不能起来只取决于 PATH。
#
# 而本机进程 PATH 不可信：里面 C: 盘的条目被剥掉了盘符
# （`C:\Users\<user>\.local\bin` → `\Users\<user>\.local\bin`），
# Windows 会把「无盘符的 PATH 条目」按**当前工作目录所在盘符**解析：
#   cwd 在 D: → claude 不可解析（仓库正好在 D:）
#   cwd 在 C: → opencode / codex 反而不可解析
# 没有任何一条条目能同时对两个盘符有效。git 钩子与非登录 shell 又不重读
# 注册表，于是这条坑稳定复现，且症状不是报错退出，而是引擎**静默降级成
# 单后端**——评审照跑、结论照出，只是少了一路跨家族交叉验证。
# （.quality-gates.md 那次「通道偏差声明：primary 前端 claude 静默空转
#   ⇒ 降级 opencode 免费模型」就是本条坑的产物。）
#
# 所以：命中即把目录 prepend 进 PATH 并**导出**（wrapper 是子进程，
# 看不到未导出的 shell 变量），并把「靠 PATH 命中」与「靠绝对路径补入」
# 如实分开报出来。

# Windows 风格路径 → POSIX 风格。
# `npm prefix -g` 在 Windows 上返回反斜杠路径，直接拼进 sh 的 PATH 会失效。
posix_dir() {
  _pd="$1"
  [ -n "$_pd" ] || return 1
  if command -v cygpath >/dev/null 2>&1; then
    _po="$(cygpath -u "$_pd" 2>/dev/null)" || _po=""
    [ -n "$_po" ] && { printf '%s' "$_po"; return 0; }
  fi
  case "$_pd" in
    [A-Za-z]:*)
      _pv="$(printf '%s' "$_pd" | cut -c1 | tr 'A-Z' 'a-z')"
      printf '%s' "$_pd" | sed -e 's|\\|/|g' -e "s|^${_pv}:|/${_pv}|"
      ;;
    *) printf '%s' "$_pd" ;;
  esac
}

# 候选目录清单（不依赖 PATH 本身，故 PATH 坏掉时仍可用）。
#   $HOME/.local/bin  Claude Code 原生安装位置
#   $HOME/bin          常见手工安装位置
#   $APPDATA/npm       Windows npm 默认全局 bin
#   npm prefix -g      自定义 npm 全局前缀（opencode / codex 通常装在这）
#   $CCG_BACKEND_BIN_DIRS  显式追加（冒号或分号分隔），给非常规安装与测试用
candidate_dirs() {
  [ -n "$HOME" ] && printf '%s\n' "$HOME/.local/bin" "$HOME/bin"
  [ -n "$APPDATA" ] && printf '%s\n' "$APPDATA/npm"
  if command -v npm >/dev/null 2>&1; then
    _pp="$(npm prefix -g 2>/dev/null)" || _pp=""
    if [ -n "$_pp" ]; then
      _pq="$(posix_dir "$_pp" 2>/dev/null)" || _pq=""
      [ -n "$_pq" ] && printf '%s\n' "$_pq"
    fi
  fi
  if [ -n "${CCG_BACKEND_BIN_DIRS:-}" ]; then
    printf '%s' "$CCG_BACKEND_BIN_DIRS" | tr ':;' '\n\n'
  fi
  return 0
}

# 探一个后端。输出 "<状态>|<说明>"，状态四取一：
#   PATH  已在 PATH，裸名可解析
#   ABS   原本不可解析，已按绝对路径补进 PATH（真身可直接 spawn）
#   CMD   只找到 .cmd/.bat —— CreateProcess 起不来，只能算半个可用
#   MISS  彻底找不到
resolve_backend() {
  _rb_tool="$1"
  if command -v "$_rb_tool" >/dev/null 2>&1; then
    printf 'PATH|裸名已可解析（无需干预）'
    return 0
  fi
  for _rb_d in $(candidate_dirs); do
    [ -n "$_rb_d" ] || continue
    [ -d "$_rb_d" ] || continue
    for _rb_f in "$_rb_d/$_rb_tool" "$_rb_d/$_rb_tool.exe" "$_rb_d/$_rb_tool.com" \
                  "$_rb_d/$_rb_tool.cmd" "$_rb_d/$_rb_tool.bat"; do
      [ -f "$_rb_f" ] || continue
      PATH="$_rb_d:$PATH"
      export PATH
      case "$_rb_f" in
        *.cmd|*.bat)
          # 实测：wrapper 走 CreateProcess（UseShellExecute=false），它不解析
          # .cmd/.bat；放个 .cmd 上去只会把失败推迟到引擎深处、错误信息还更难读。
          printf 'CMD|只找到 %s —— CreateProcess 起不了 .cmd/.bat，wrapper 仍会失败' "$_rb_f"
          return 0 ;;
        *)
          printf 'ABS|已从绝对路径补入 PATH: %s' "$_rb_f"
          return 0 ;;
      esac
    done
  done
  printf 'MISS|找不到（PATH 与候选目录均未命中）'
  return 1
}

# 逐个后端体检并打印。
# 退出码刻意分三档而不是「有一个能跑就算过」——单后端正是本条坑造成的降级形态，
# 把它做成 0 会让体检失去意义：
#   0  两个后端都在（双模型齐备）
#   2  有后端缺失（能跑，但已降级；两个都缺时另加硬提示）
report_backends() {
  _rb_rc=0
  _rb_ok=0
  for _rb_b in claude opencode; do
    case "$_rb_b" in
      claude)   _rb_why="评审后端（主力）" ;;
      opencode) _rb_why="出方案后端 / 跨家族校验" ;;
    esac
    _rb_st="$(resolve_backend "$_rb_b")"
    _rb_code="${_rb_st%%|*}"
    _rb_msg="${_rb_st#*|}"
    say "  · $_rb_b  [$_rb_code] $_rb_msg（$_rb_why）"
    case "$_rb_code" in
      PATH|ABS) _rb_ok=1 ;;
      CMD)
        say "      ↳ 修法：让真身以 .exe/.com 形式出现在某个全盘符限定的 PATH 目录下"
        say "        （符号链接 / 硬链接都可以；.cmd 不作数，原因见上）" ;;
      MISS)
        _rb_rc=2
        say "      ↳ 修法：装一个（npm i -g @anthropic-ai/claude-code），"
        say "        或把它所在目录写进系统 PATH 后重开终端；"
        say "        也可用 CCG_BACKEND_BIN_DIRS 显式指一个目录" ;;
    esac
  done
  if [ "$_rb_ok" -eq 0 ]; then
    say ""
    say "  ✗ 没有任何评审后端可用 —— 深度审查根本起不来。"
  else
    say ""
    say "  ⚠ 只剩单后端可用 —— 评审能跑，但跨家族交叉验证会缺失（这正是本条坑的形态）。"
  fi
  return "$_rb_rc"
}

# ---------- 0a. 纯依赖体检（--check-deps）----------
# 刻意放在定位 node / 驱动 / 判定记录**之前**：这是「为什么我的评审降级了」
# 的第一手诊断入口，真出事时 node 可能本身就是坏的，届时仍要能问。
if [ "$CHECK_DEPS" -eq 1 ]; then
  say "═══ CCG 深度审查 · 依赖体检 ═══"
  _CD_WRAPPER="${CODEAGENT_WRAPPER:-$HOME/.claude/bin/codeagent-wrapper.exe}"
  if [ -f "$_CD_WRAPPER" ] || [ -x "$_CD_WRAPPER" ]; then
    say "  ✓ codeagent-wrapper  $_CD_WRAPPER"
    _CD_RC=0
  else
    say "  ✗ codeagent-wrapper 找不到: $_CD_WRAPPER"
    say "    修法：npx ccg-workflow（生成 wrapper）"
    _CD_RC=2
  fi
  report_backends || _CD_RC=2
  say ""
  if [ "$_CD_RC" -eq 0 ]; then
    say "体检通过：后端可用。"
  else
    say "体检不通过：见上方逐条修法。"
  fi
  exit "$_CD_RC"
fi

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
# 后端体检**并补 PATH**（旧实现只 say 一句被动告警然后照跑 ⇒ 静默降级）。
# 这里保持非致命，与旧语义一致：真要 fail-closed 请用 --check-deps。
report_backends || true
say ""
say "依赖体检通过，开始深度审查（可能耗时 15 分钟以上，取决于 diff 体量）…"
say ""

# ---------- 5. 跑 ----------
if [ "$DRY" -eq 1 ]; then
  exec node "$DRIVER" --dry-run --sha "$SHA"
fi
exec node "$DRIVER" --sha "$SHA"
