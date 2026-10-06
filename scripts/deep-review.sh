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

# 候选目录清单。**核心目标是不依赖那个被剥掉盘符的 PATH 条目**
# ——$HOME/.local/bin / $HOME/bin / $APPDATA/npm 三条与 PATH 无关。
# ⚠ 但别把它读成「完全不依赖 PATH」：`npm prefix -g` 走 `command -v npm`，
#   posix_dir 走 cygpath/sed/cut/tr。PATH 坏到本方案针对的那个程度时，
#   这两支会静默不生效（此时只剩前三条与 $CCG_BACKEND_BIN_DIRS 可用）。
#   这正是 QM-6 评审 i5 指出的过度声称，注释按实际能力收窄。
#
# 所有条目统一经 posix_dir 归一（QM-6 评审 i6）：只有 npm prefix 归一是不够的，
# Windows 反斜杠/盘符形态混着进 PATH，在非 msys 的 sh 下根本解析不了。
# 归一后 PATH 与报告里的路径形态也一致，便于人工核对。
#
# $CCG_BACKEND_BIN_DIRS：**只按分号分隔**（换行亦可），不要用冒号——
# Windows 盘符自带冒号，按冒号切会把路径劈成两段。路径形态不限，
# 内部会逐条过 posix_dir。
candidate_dirs() {
  # ⚠ 每个变量都必须写成 ${VAR:-}。
  #   本函数在 `set -u` 下运行，`[ -n "$APPDATA" ]` 在 APPDATA 未设时会**直接
  #   中止整个函数**——后面的 npm / CCG_BACKEND_BIN_DIRS 分支一句都跑不到，
  #   候选列表被静默截短，后端于是被判成「找不到」。
  #   这就是「告警/保护逻辑自己静默降级」的同一种病，出现在修复本身里。
  #   （本 PR 的「含空格候选目录」回归测试在最小 env 下当场抓到。）
  _cd_emit() { _cd_q="$(posix_dir "$1" 2>/dev/null)" || _cd_q=""; [ -n "$_cd_q" ] && printf '%s\n' "$_cd_q"; return 0; }
  [ -n "${HOME:-}" ] && { _cd_emit "$HOME/.local/bin"; _cd_emit "$HOME/bin"; }
  [ -n "${APPDATA:-}" ] && _cd_emit "$APPDATA/npm"
  if command -v npm >/dev/null 2>&1; then
    _pp="$(npm prefix -g 2>/dev/null)" || _pp=""
    [ -n "$_pp" ] && _cd_emit "$_pp"
  fi
  if [ -n "${CCG_BACKEND_BIN_DIRS:-}" ]; then
    # `%s\n` 而不是 `%s`：不带尾换行的话消费方会丢掉最后一行（见 resolve_backend）。
    # 这里用 here-doc 而不是 `| while`——形状与 resolve_backend 保持一致，
    # 免得两处一个走管道一个不走，读者无从判断哪处的副作用出得去。
    _cd_raw_list="$(printf '%s\n' "$CCG_BACKEND_BIN_DIRS" | tr ';' '\n')"
    while IFS= read -r _cd_raw || [ -n "$_cd_raw" ]; do
      [ -n "$_cd_raw" ] && _cd_emit "$_cd_raw"
    done <<EOF
$_cd_raw_list
EOF
  fi
  return 0
}

# 探一个后端。**结果写进全局 _RB_CODE / _RB_MSG，并用 return code 表示成败。**
#   PATH  已在 PATH，且裸名解析到的东西是 wrapper 能直接 spawn 的
#   ABS   原本不可解析，已在**当前 shell** 把目录补进 PATH 并导出
#   CMD   只找到 .cmd/.bat（PATH 里或候选目录里都算）—— CreateProcess 起不来
#   MISS  彻底找不到
#
# ⚠⚠ 这里**绝不能**用 `out="$(resolve_backend ...)"` 收集结果（QM-6 评审 i1，Critical）。
#   命令替换开的是子 shell，里面 `PATH=…; export PATH` 一退出就丢：
#   报告照样打印「已从绝对路径补入 PATH」，而主流程 exec node → wrapper 仍按
#   原 PATH 裸名 spawn，claude 照样找不到 ⇒ 静默降级在目标场景下原样复现。
#   第一版就是这么写的，报告是绿的、修复是无效的，属典型假绿灯。
#   已用最小复现实证：`out="$(f)"` 之后父 shell 的 PATH 首段仍是原值。
#   本函数因此改为写全局变量，调用方**直接调用**，不走命令替换。
resolve_backend() {
  _rb_tool="$1"
  if _rb_hit="$(command -v "$_rb_tool" 2>/dev/null)"; then
    # 光有 `command -v` 命中不够：msys 的 command -v 会把 PATH 里的 npm shim
    # （.cmd / 无扩展名）也算命中，而 wrapper 走 CreateProcess 起不了它们
    # （QM-6 评审 i2）。所以要按**文件类型**再判一次。
    case "$_rb_hit" in
      *.cmd|*.bat)
        _RB_CODE=CMD
        _RB_MSG="PATH 里命中 $_rb_hit，但它是 .cmd/.bat —— wrapper 走 CreateProcess，起不来"
        return 0 ;;
      *)
        _RB_CODE=PATH
        _RB_MSG="裸名已可解析：$_rb_hit（无需干预）"
        return 0 ;;
    esac
  fi
  # ⚠ 不能写成 `for _rb_d in $(candidate_dirs)`。
  # 命令替换的结果会被 shell 按 IFS 拆词，而候选目录**确实含空格**：
  # 本机 npm 全局 bin 实测含空格，拆开后只剩废目录 ⇒ 这条候选永远命中不了
  # （QM-6 评审 i2，就是本分支自己被评审打回的真实缺陷）。
  #
  # 也不能用 `candidate_dirs | while ...`：管道同样开子 shell。
  # here-doc 的 while 留在当前 shell，PATH 改动才出得去。
  _rb_list="$(candidate_dirs)"
  # `|| [ -n "$_rb_d" ]`：EOF 无尾换行时 read 仍读到了内容但返回非零，
  # 只写 `while read` 会把最后一行静默丢掉。候选列表宁可多判一次，
  # 也不能少判一个（少判 = 后端被误判成找不到，正是本条坑的形态）。
  while IFS= read -r _rb_d || [ -n "$_rb_d" ]; do
    [ -n "$_rb_d" ] || continue
    [ -d "$_rb_d" ] || continue
    for _rb_f in "$_rb_d/$_rb_tool" "$_rb_d/$_rb_tool.exe" "$_rb_d/$_rb_tool.com" \
                  "$_rb_d/$_rb_tool.cmd" "$_rb_d/$_rb_tool.bat"; do
      [ -f "$_rb_f" ] || continue
      case "$_rb_f" in
        *.cmd|*.bat)
          _RB_CODE=CMD
          _RB_MSG="只找到 $_rb_f —— CreateProcess 起不了 .cmd/.bat，wrapper 仍会失败"
          return 0 ;;
        *)
          PATH="$_rb_d:$PATH"
          export PATH
          _RB_CODE=ABS
          _RB_MSG="已从绝对路径补入 PATH: $_rb_f"
          return 0 ;;
      esac
    done
  done <<EOF
$_rb_list
EOF
  _RB_CODE=MISS
  _RB_MSG="找不到（PATH 与候选目录均未命中）"
  return 1
}

# 逐个后端体检并打印。
# 退出码刻意分三档而不是「有一个能跑就算过」——单后端正是本条坑造成的降级形态，
# 把它做成 0 会让体检失去意义：
#   0  两个后端都在（双模型齐备）
#   2  有后端缺失或只命中不可执行的 .cmd（能跑则降级；两个都不可用时另加硬提示）
#
# 副作用：把 _RB_OK / _RB_RC 暴露给调用方，主流程要靠它决定是继续还是早退。
# 注意 CMD 也必须置 _rb_rc=2：.cmd 明明被判为「wrapper 起不来」，
# 若不置 rc，就会出现「刚说完深度审查起不来，下一行体检通过、exit 0」
# 的自相矛盾（QM-6 评审 i1）。
report_backends() {
  _rb_rc=0
  _rb_n=0
  for _rb_b in claude opencode; do
    case "$_rb_b" in
      claude)   _rb_why="评审后端（主力）"; _rb_pkg='@anthropic-ai/claude-code' ;;
      opencode) _rb_why="出方案后端 / 跨家族校验"; _rb_pkg='opencode-ai' ;;
    esac
    # 直接调用，绝不走 $(...)：PATH 的修复必须留在当前 shell（见上）。
    resolve_backend "$_rb_b" || true
    say "  · $_rb_b  [$_RB_CODE] $_RB_MSG（$_rb_why）"
    case "$_RB_CODE" in
      PATH|ABS) _rb_n=$((_rb_n + 1)) ;;
      CMD)
        # 判为不可用：既不计数，也必须置 _rb_rc=2（否则体检会自相矛盾，见上）。
        _rb_rc=2
        say "      ↳ 修法：让真身以 .exe/.com 形式出现在某个全盘符限定的 PATH 目录下"
        say "        （符号链接 / 硬链接都可以；.cmd 不作数，原因见上）" ;;
      MISS)
        _rb_rc=2
        say "      ↳ 修法：装一个（npm i -g $_rb_pkg），"
        say "        或把它所在目录写进系统 PATH 后重开终端；"
        say "        也可用 CCG_BACKEND_BIN_DIRS 显式指一个目录" ;;
    esac
  done
  # ⚠ 必须按**计数**分档，不能只看「有没有」。
  #   只看 0/1 标志时，2/2 可用与 1/2 可用长得一模一样，
  #   于是双模型齐备也会打印「只剩单后端」（本 PR 自查时当场发现）。
  case "$_rb_n" in
    0)
      say ""
      say "  ✗ 没有任何评审后端可用 —— 深度审查根本起不来。" ;;
    1)
      say ""
      say "  ⚠ 只剩单后端可用 —— 评审能跑，但跨家族交叉验证会缺失（这正是本条坑的形态）。" ;;
  esac
  _RB_OK=$([ "$_rb_n" -ge 1 ] && echo 1 || echo 0)
  _RB_RC="$_rb_rc"
  return "$_rb_rc"
}

# ---------- 0a. 纯依赖体检（--check-deps）----------
# 刻意放在定位 node / 驱动 / 判定记录**之前**：这是「为什么我的评审降级了」
# 的第一手诊断入口，真出事时 node 可能本身就是坏的，届时仍要能问。
if [ "$CHECK_DEPS" -eq 1 ]; then
  say "═══ CCG 深度审查 · 依赖体检 ═══"
  _CD_WRAPPER="${CODEAGENT_WRAPPER:-${HOME:-}/.claude/bin/codeagent-wrapper.exe}"
  if [ -f "$_CD_WRAPPER" ] || [ -x "$_CD_WRAPPER" ]; then
    say "  ✓ codeagent-wrapper  $_CD_WRAPPER"
    _CD_RC=0
  else
    say "  ✗ codeagent-wrapper 找不到: $_CD_WRAPPER"
    say "    修法：npx ccg-workflow（生成 wrapper）"
    _CD_RC=2
  fi
  report_backends || _CD_RC=2
  # 恢复后的**裸名自检**：报告说「已补入 PATH」只有裸名真能解析才算数。
  # 这一步必须在当前 shell 做——第一版把 PATH 修复写在 $(resolve_backend) 的
  # 子 shell 里，报告是绿的、引擎照样按原 PATH 裸名 spawn（QM-6 评审 i1，Critical）。
  # 自检与体检结论矛盾时，一律按不通过处理：宁可误报红，也不放一个假绿灯过去。
  for _CD_b in claude opencode; do
    _CD_hit="$(command -v "$_CD_b" 2>/dev/null)" || _CD_hit=""
    if [ -n "$_CD_hit" ]; then
      say "  · 裸名自检 $_CD_b → $_CD_hit"
      case "$_CD_hit" in
        *.cmd|*.bat) _CD_RC=2 ;;
      esac
    else
      say "  · 裸名自检 $_CD_b → 仍不可解析"
    fi
  done
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
  if [ -d "${HOME:-}/.fnm" ]; then
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
  "${HOME:-}/.claude/skills/adversarial-review-loop/scripts/ccg-deep-review.js"
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
WRAPPER="${CODEAGENT_WRAPPER:-${HOME:-}/.claude/bin/codeagent-wrapper.exe}"
[ -x "$WRAPPER" ] || [ -f "$WRAPPER" ] || {
  say "✗ 找不到 codeagent-wrapper: $WRAPPER"
  say "  生成：npx ccg-workflow"
  exit 2
}
# 后端体检**并补 PATH**（旧实现只 say 一句被动告警然后照跑 ⇒ 静默降级）。
# 降级（单后端）保持非致命，与旧语义一致；真要 fail-closed 请用 --check-deps。
# 但「一个后端都没有」必须早退：继续跑只会在引擎深处抛一个难懂的错误，
# 而上一行刚打印过「深度审查根本起不来」，再打印「体检通过」是自相矛盾
# （QM-6 评审 i3）。
report_backends || true
say ""
if [ "$_RB_OK" -eq 0 ]; then
  say "✗ 没有可用评审后端，深度审查起不来。修法见上方逐条（也可先跑 --check-deps）。"
  exit 2
fi
if [ "$_RB_RC" -eq 0 ]; then
  say "依赖体检通过，开始深度审查（可能耗时 15 分钟以上，取决于 diff 体量）…"
else
  say "依赖体检有降级，开始深度审查（缺一路跨家族交叉验证）…"
fi
say ""

# ---------- 5. 跑 ----------
if [ "$DRY" -eq 1 ]; then
  exec node "$DRIVER" --dry-run --sha "$SHA"
fi
exec node "$DRIVER" --sha "$SHA"
