#!/bin/bash
# 分支守卫 + 质量节拍 pre-commit hook 集成测试
# 运行：bash scripts/hooks/pre-commit.test.sh（仓库任意位置）
# 场景：
#   1) 声明分支 == 当前分支，docs-only 提交 → 通过
#   2) 声明 main，当前分支 codex/x（事故场景复现）→ 拦截，不产生提交
#   3) 无声明 → 拦截并提示声明命令
#   4) .quality-rhythm-pending 存在 → 拦截（保留原行为）
#   5) 代码文件变更 + wrapper 通过 → 通过
#   6) detached + rebase-merge 目录（rebase 重放模拟）→ 跳过断言，通过
#   7) 声明文件为空 → 拦截
#   8) detached 且无 rebase 目录 → 拦截（未指向命名分支）
#   9) wrapper 缺失 → 拦截（保留原行为）
#   10) 非代码扩展名（.ps1）变更 → 跳过 wrapper，通过
#   11) 真实 git rebase 重放 → 跳过断言，重放成功
set -u

HOOK_SRC="$(cd "$(dirname "$0")" && pwd)/pre-commit"
TMP="$(mktemp -d "${TMPDIR:-/tmp}/ccg-hook-test-XXXXXX")"
trap 'rm -rf "$TMP"' EXIT

PASS=0
FAIL=0
ok()  { echo "  PASS: $1"; PASS=$((PASS+1)); }
bad() { echo "  FAIL: $1"; FAIL=$((FAIL+1)); }

new_repo() {
    rm -rf "$TMP/repo"
    mkdir -p "$TMP/repo"
    git -C "$TMP/repo" init -q -b main 2>/dev/null || git -C "$TMP/repo" init -q
    if [ "$(git -C "$TMP/repo" branch --show-current 2>/dev/null)" != "main" ]; then
        git -C "$TMP/repo" symbolic-ref HEAD refs/heads/main
    fi
    git -C "$TMP/repo" config user.email hook-test@example.com
    git -C "$TMP/repo" config user.name "Hook Test"
    git -C "$TMP/repo" config commit.gpgsign false
    git -C "$TMP/repo" commit --allow-empty -q -m "base"
    # 安装待测 hook（在 base 提交之后）
    mkdir -p "$TMP/repo/scripts"
    cat > "$TMP/repo/scripts/quality-rhythm-wrapper.js" <<'EOF'
process.exit(0);
EOF
    cp "$HOOK_SRC" "$TMP/repo/.git/hooks/pre-commit"
    if command -v chmod >/dev/null 2>&1; then chmod +x "$TMP/repo/.git/hooks/pre-commit"; fi
}

declare_branch() {
    mkdir -p "$TMP/repo/.agent_context"
    printf '%s' "$1" > "$TMP/repo/.agent_context/expected-branch"
}

commit_expect_ok() {
    local label="$1"
    if git -C "$TMP/repo" commit -q -m "$label" 2>"$TMP/err.log"; then
        ok "$label"
    else
        bad "$label（应通过）：$(head -5 "$TMP/err.log" | tr '\n' ' ')"
    fi
}

commit_expect_block() {
    local label="$1"
    local pattern="$2"
    if git -C "$TMP/repo" commit -q -m "$label" 2>"$TMP/err.log"; then
        bad "$label（应拦截但通过了）"
    else
        if grep -q "$pattern" "$TMP/err.log"; then
            ok "$label（拦截并提示 $pattern）"
        else
            bad "$label（拦截但提示不符）：$(head -8 "$TMP/err.log" | tr '\n' ' ')"
        fi
        local head_msg
        head_msg="$(git -C "$TMP/repo" log -1 --format=%s)"
        if [ "$head_msg" != "$label" ]; then
            ok "$label（未产生提交）"
        else
            bad "$label（意外产生了提交）"
        fi
    fi
}

# 场景 1：声明=当前分支，docs-only 提交通过
scenario1() {
    new_repo
    declare_branch main
    echo "hello" > "$TMP/repo/docs.md"
    git -C "$TMP/repo" add docs.md
    commit_expect_ok "scenario1 docs-on-declared-branch"
}

# 场景 2：声明 main，当前分支 codex/x（事故场景）→ 拦截
scenario2() {
    new_repo
    declare_branch main
    git -C "$TMP/repo" switch -q -c codex/video-no-text-prompt-enhancement
    echo "hello" > "$TMP/repo/docs.md"
    git -C "$TMP/repo" add docs.md
    commit_expect_block "scenario2 wrong-branch-blocked" "分支守卫拦截"
}

# 场景 3：无声明 → 拦截
scenario3() {
    new_repo
    echo "hello" > "$TMP/repo/docs.md"
    git -C "$TMP/repo" add docs.md
    commit_expect_block "scenario3 no-declaration-blocked" "缺少会话分支声明"
}

# 场景 4：.quality-rhythm-pending → 拦截（保留原行为）
scenario4() {
    new_repo
    declare_branch main
    touch "$TMP/repo/.quality-rhythm-pending"
    echo "hello" > "$TMP/repo/docs.md"
    git -C "$TMP/repo" add docs.md
    commit_expect_block "scenario4 pending-flag-blocked" "未完成的质量节拍检查"
}

# 场景 5：代码文件变更 + wrapper 通过 → 通过
scenario5() {
    new_repo
    declare_branch main
    echo "module.exports = 1;" > "$TMP/repo/app.js"
    git -C "$TMP/repo" add app.js
    commit_expect_ok "scenario5 code-change-passed"
}

# 场景 6：detached + rebase-merge 目录（模拟 rebase 重放）→ 跳过断言，通过
scenario6() {
    new_repo
    declare_branch main
    git -C "$TMP/repo" switch -q --detach HEAD
    mkdir -p "$TMP/repo/.git/rebase-merge"
    echo "rebase note" > "$TMP/repo/note.txt"
    git -C "$TMP/repo" add note.txt
    commit_expect_ok "scenario6 rebase-dir-skip-passed"
}

# 场景 7：声明文件为空 → 拦截
scenario7() {
    new_repo
    mkdir -p "$TMP/repo/.agent_context"
    printf '\n' > "$TMP/repo/.agent_context/expected-branch"
    echo "hello" > "$TMP/repo/docs.md"
    git -C "$TMP/repo" add docs.md
    commit_expect_block "scenario7 empty-declaration-blocked" "内容为空"
}

# 场景 8：detached 且无 rebase 目录 → 拦截
scenario8() {
    new_repo
    declare_branch main
    git -C "$TMP/repo" switch -q --detach HEAD
    echo "note" > "$TMP/repo/note.txt"
    git -C "$TMP/repo" add note.txt
    commit_expect_block "scenario8 detached-no-rebase-blocked" "未指向任何命名分支"
}

# 场景 9：wrapper 缺失 → 拦截（保留原行为）
scenario9() {
    new_repo
    declare_branch main
    rm -f "$TMP/repo/scripts/quality-rhythm-wrapper.js"
    echo "module.exports = 1;" > "$TMP/repo/app.js"
    git -C "$TMP/repo" add app.js
    commit_expect_block "scenario9 wrapper-missing-blocked" "未找到质量节拍wrapper"
}

# 场景 10：非代码扩展名（.ps1）变更 → 跳过 wrapper，通过
scenario10() {
    new_repo
    declare_branch main
    echo "# ps1 note" > "$TMP/repo/note.ps1"
    git -C "$TMP/repo" add note.ps1
    commit_expect_ok "scenario10 noncode-ext-passed"
}

# 场景 11：真实 git rebase 重放 → 跳过断言，重放成功
scenario11() {
    new_repo
    declare_branch main
    echo "a" > "$TMP/repo/m.txt"
    git -C "$TMP/repo" add m.txt
    git -C "$TMP/repo" commit -q -m "m1"
    git -C "$TMP/repo" switch -q -c feature
    declare_branch feature
    echo "b" > "$TMP/repo/f.txt"
    git -C "$TMP/repo" add f.txt
    git -C "$TMP/repo" commit -q -m "f1"
    if git -C "$TMP/repo" rebase -q main 2>"$TMP/err.log"; then
        local cnt
        cnt="$(git -C "$TMP/repo" log --oneline | wc -l | tr -d ' ')"
        if [ "$cnt" = "3" ]; then
            ok "scenario11 real-rebase-replay-passed"
        else
            bad "scenario11 rebase 成功但提交数异常（$cnt）：$(cat "$TMP/err.log")"
        fi
    else
        bad "scenario11 real-rebase-replay-failed：$(head -8 "$TMP/err.log" | tr '\n' ' ')"
    fi
}

scenario1
scenario2
scenario3
scenario4
scenario5
scenario6
scenario7
scenario8
scenario9
scenario10
scenario11

echo "----"
echo "结果: PASS=$PASS FAIL=$FAIL"
[ "$FAIL" -eq 0 ]