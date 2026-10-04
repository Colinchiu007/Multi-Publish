/**
 * start-mp-task.ps1 结构锁
 *
 * 事故（2026-09-26/27 两次误判后实测）：脚本顶部 `$ErrorActionPreference = 'Stop'`，
 * 而它用 `$output = & $bash $initScript $TaskName 2>&1` 捕获子进程输出。Windows
 * PowerShell 5.1 下「EAP=Stop + 2>&1 捕获 native 命令 stderr」会把**任何**一行 stderr
 * 变成终止性 NativeCommandError —— 而 git 在**成功**时也要往 stderr 写进度
 * （实测原文 `Preparing worktree (new branch 'fix-start-mp-task-stderr')`）。
 * 后果：worktree 已经建成，脚本却在下一行中止，以 rc=1 退出，并跳过 `.git` 存在性校验、
 * 结果报告与开 shell。两次现场归因（「静默失败」「只有 fetch 失败才 rc=1」）都是错的，
 * 因为都从单次观测外推、没做机制级最小复现。
 *
 * 本锁不测 PowerShell 语义（那随宿主版本变），只锁「捕获点必须处在被临时放宽、并在
 * finally 里恢复的 EAP 作用域内」这条可静态判定的写法约束。把修复改成 no-op 会立刻变红。
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const SCRIPT = path.join(__dirname, 'start-mp-task.ps1');
const lines = fs.readFileSync(SCRIPT, 'utf8').split(/\r?\n/);

const CAPTURE_RE = /2>&1/;
const EAP_ASSIGN_RE = /^\s*\$ErrorActionPreference\s*=\s*(.+?)\s*$/;
const RELAXED = new Set(["'Continue'", "'SilentlyContinue'"]);

// 只认真语句子进程捕获（必须带调用运算符 `& $xxx`）。注释里也会出现 "2>&1"
// —— 本文件与脚本的说明文字都是这种写法，把它们算进来会让锁自我报警而没人看得懂。
function isCapture(line) {
  const trimmed = line.trim();
  if (trimmed.startsWith('#')) return false;
  return CAPTURE_RE.test(line) && /&\s*\$/.test(line);
}

function eapAssignments() {
  const out = [];
  lines.forEach((line, index) => {
    const match = line.match(EAP_ASSIGN_RE);
    if (match) out.push({ line: index + 1, value: match[1] });
  });
  return out;
}

function captureLines() {
  const out = [];
  lines.forEach((line, index) => {
    if (isCapture(line)) out.push({ line: index + 1, text: line.trim() });
  });
  return out;
}

test('基线：脚本顶部仍以 Stop 运行（本锁的前提，前提变了锁要一起改）', () => {
  const assignments = eapAssignments();
  assert.ok(assignments.length >= 2, '脚本必须包含 EAP 赋值（顶部 Stop + 捕获期放宽）');
  assert.equal(assignments[0].value, "'Stop'", '顶部应显式声明 $ErrorActionPreference = Stop');
});

test('每一处 2>&1 捕获都必须处在「已临时放宽」的 EAP 作用域内', () => {
  const captures = captureLines();
  assert.ok(captures.length >= 1, '至少应有一处子进程输出捕获（否则本锁失效，需一并删除）');
  const assignments = eapAssignments();

  for (const capture of captures) {
    const before = assignments.filter((item) => item.line < capture.line);
    const active = before[before.length - 1];
    assert.ok(
      active && RELAXED.has(active.value),
      `第 ${capture.line} 行「${capture.text}」处在 EAP=${active ? active.value : before.length ? '?' : '未设置（继承 Stop）'} 下：`
      + 'git 成功时也会写 stderr（如 Preparing worktree / From https://…），'
      + 'Stop + 2>&1 会把它变成终止性错误，导致 worktree 已建成却以 rc=1 中止。'
      + '捕获前必须 $ErrorActionPreference = Continue。'
    );
  }
});

test('放宽的 EAP 必须在同一 try 的 finally 里恢复（不允许整段脚本降级为 Continue）', () => {
  const captures = captureLines();
  assert.ok(captures.length >= 1);
  const firstCapture = captures[0].line;
  const restoreIndex = lines.findIndex(
    (line, index) => index >= firstCapture && /\$ErrorActionPreference\s*=\s*\$[A-Za-z]/.test(line)
  );
  assert.notEqual(restoreIndex, -1, '捕获之后必须把 EAP 恢复成进入前的值（保存/恢复成对）');
  const finallyIndex = lines.findIndex(
    // PowerShell 惯例写作 `} finally {`（同行），也可独立成行
    (line, index) => index > firstCapture && /^\s*\}?\s*finally\s*\{/.test(line)
  );
  assert.ok(
    finallyIndex !== -1 && finallyIndex < restoreIndex && restoreIndex - finallyIndex < 10,
    '恢复语句必须紧跟在 finally 开头（避免异常路径下 EAP 永久停在 Continue）'
  );
});

test('回归护栏：不得重新出现「Stop 生效期间」的 native 捕获', () => {
  // 顶部 Stop 之后、第一次放宽之前的区间里，不允许出现任何 2>&1 捕获
  const assignments = eapAssignments();
  const firstRelaxed = assignments.find((item) => RELAXED.has(item.value));
  assert.ok(firstRelaxed, '脚本必须包含放宽 EAP 的赋值');
  const early = captureLines().filter((item) => item.line < firstRelaxed.line);
  assert.deepEqual(early, [], '放宽之前的捕获点同样会被良性 stderr 打断：' + JSON.stringify(early));
});

// ---- bash 身份校验锁（2026-10：dirname: command not found 事故）----
// 事故：非交互 bash 不加载 /etc/profile，PATH 只继承 Windows PATH（POSIX 化），
// 本机 Windows PATH 不含 Git\usr\bin → dirname/cygpath/awk 全部找不到，
// session-init.sh 以 `dirname: command not found`（exit 127）失败，worktree 未建成。
// 修复两层：① bash 侧用内建 $BASH 定位 /usr/bin 前置 PATH 自愈；
// ② PowerShell 侧对 -GitBash / MP_GIT_BASH 做 Git for Windows 身份校验，WSL/裸 bash 直接拒绝。
// 本锁静态断言这两层都存在；把修复改成 no-op 会立刻变红。

test('bash 身份校验：脚本必须包含 Test-GitBashIdentity 且校验 usr\\bin\\dirname.exe', () => {
  const text = lines.join('\n');
  assert.ok(/function\s+Test-GitBashIdentity/.test(text), '必须存在 Test-GitBashIdentity 函数');
  assert.ok(/usr\\bin\\bash\.exe/.test(text), '身份校验必须识别 <GitRoot>\\usr\\bin\\bash.exe 布局');
  assert.ok(/usr\\bin\\dirname\.exe/.test(text), '身份校验必须以同根 usr\\bin\\dirname.exe 存在为判据（Git for Windows 特征）');
  assert.ok(/WSL/.test(text), '拒绝信息必须点名 WSL（防裸 bash 解析到 WSL shim）');
  assert.ok(
    /-GitBash\s*\/\s*MP_GIT_BASH|MP_GIT_BASH\s*\/\s*-GitBash/.test(text) || /MP_GIT_BASH/.test(text),
    '身份校验必须覆盖 -GitBash / MP_GIT_BASH 两条显式指定路径'
  );
  // 函数体必须真实包含 dirname.exe 存在性校验（防把函数改成恒真 no-op）
  const fnMatch = text.match(/function\s+Test-GitBashIdentity\(\[string\]\$candidate\)\s*\{([\s\S]*?)\n\}/);
  assert.ok(fnMatch, 'Test-GitBashIdentity 函数体可解析');
  assert.ok(
    /Test-Path.*dirname\.exe/.test(fnMatch[1]),
    'Test-GitBashIdentity 函数体必须包含 dirname.exe 的 Test-Path 校验（防恒真 no-op）'
  );
});

test('bash 身份校验：显式指定的 bash 必须通过身份校验才被采用', () => {
  const text = lines.join('\n');
  assert.ok(
    /if\s*\(\s*\$bash\s*-and\s*-not\s*\(\s*Test-GitBashIdentity\s*\$bash\s*\)\s*\)/.test(text) ||
    /if\s*\(\s*\$bash\s*-and\s*-not\s*\(\s*Test-GitBashIdentity/.test(text),
    '显式指定的 $bash 必须先过 Test-GitBashIdentity，未过即 throw'
  );
  assert.ok(
    /throw\s+".*不是 Git for Windows Bash/.test(text) || /throw\s+'.*不是 Git for Windows Bash/.test(text),
    '身份校验失败必须 throw 明确错误'
  );
});

test('bash 身份校验：自动探测候选也必须通过身份校验', () => {
  const text = lines.join('\n');
  const autoCandidates = text.match(/Test-GitBashIdentity\s+\$candidate/g) || [];
  assert.ok(autoCandidates.length >= 2, '自动探测（git 派生 + 硬编码候选）都必须用 Test-GitBashIdentity 校验，实际 ' + autoCandidates.length);
});

test('bash 自愈：session-init.sh / gwm-task.sh / session-cleanup.sh 必须前置 $BASH 目录到 PATH', () => {
  for (const script of ['session-init.sh', 'gwm-task.sh', 'session-cleanup.sh']) {
    const sh = fs.readFileSync(path.join(__dirname, script), 'utf8');
    assert.ok(
      /\$\{BASH%\/\*\}/.test(sh),
      `${script} 必须用 bash 内建 $BASH 定位自身目录（不依赖 PATH）`
    );
    assert.ok(
      /BASH_BIN_DIR/.test(sh) && /PATH=/.test(sh),
      `${script} 必须把 BASH_BIN_DIR 前置进 PATH`
    );
  }
});

// ---- 弹窗合同（2026-10-03：桌面被 PowerShell 窗口反复占屏）----
// 现场：开发过程中桌面不断出现终端窗口。两类来源，实测归因（Win11 + Windows Terminal 作默认控制台宿主）：
//   1) start-mp-task.ps1 过去默认开一个 -NoExit 的「任务 shell」，父进程退出后它变成孤儿常驻窗口，
//      每建一个任务就多一个（现场 PID 42824，父进程 40692 已退出）。
//   2) 两个计划任务以 Interactive 主体注册，每次运行都会创建一个可见控制台窗口；
//      「每 15 分钟闪一次窗」即健康巡检任务。
// 反直觉的一条：任务设置里的 Hidden **不是**解决手段 —— 实测 Hidden=True 之后手动触发，
// 300ms 内仍新增了一个可见顶层窗口；换成非交互主体（LogonType S4U）后同一探针 NEW_TOTAL=0，
// 且任务确实执行（health.json checkedAt 前进、LastTaskResult=0），write guard 在 S4U 下
// 仍于 ~1s 内把探针文件移入隔离区。因此合同是「主体优先 S4U + 判定不得依赖跨会话不可读字段」，
// 而不是「设了 Hidden 就算修好」。
const ENTRY = path.join(__dirname, 'start-mp-task.ps1');
const INSTALLER = path.join(__dirname, 'install-session-isolation-task.ps1');
const HEALTH = path.join(__dirname, 'mp-worktree-health.ps1');

test('任务入口默认不得开窗：-Shell 是唯一开关，Start-Process 只能出现在其门控分支里', () => {
  const src = fs.readFileSync(ENTRY, 'utf8');
  assert.match(src, /\[switch\]\$Shell/, '必须保留显式 -Shell 开关（否则"按需开窗"退化成永远开不了窗）');
  assert.doesNotMatch(src, /\[switch\]\$NoShell/, '默认已不开窗，-NoShell 属于同一布尔量的第二套写法，必须删除');
  const launches = [...src.matchAll(/Start-Process powershell\.exe/g)];
  assert.ok(launches.length === 1, `只允许一处开窗调用，实际 ${launches.length} 处`);
  const gate = src.slice(0, launches[0].index);
  const lastIf = gate.lastIndexOf('if (');
  assert.ok(lastIf !== -1 && /\$Shell\s*-and/.test(gate.slice(lastIf)), '唯一的 Start-Process 必须处于「$Shell 为真」的分支内');
  assert.match(src, /默认（不在自动路径上）|未开窗（默认）/, '未开窗时必须把 cd 提示打出来，不能让调用方以为流程失败了');
});

test('注册主体合同：先试非交互 S4U，退回 Interactive 必须出声', () => {
  const src = fs.readFileSync(INSTALLER, 'utf8');
  assert.match(src, /@\('S4U',\s*'Interactive'\)/, '主体尝试顺序必须是 S4U 先、Interactive 后（顺序反了就等于回到会弹窗的旧行为）');
  assert.match(src, /registered with an interactive principal/, '退回 Interactive 必须打 WARN：那台机器会重新出现可见控制台窗口');
  assert.doesNotMatch(src, /-LogonType Interactive/, '不得再无条件以 Interactive 主体注册（字面量只能出现在尝试顺序表里）');
  assert.match(src, /function New-IsolationPrincipal/, '两个任务必须共用同一主体构造入口，禁止各抄一份');
});

test('存活判定合同：watcher 是否在跑以任务自身 State 为准，CommandLine 匹配只能是兜底', () => {
  const src = fs.readFileSync(HEALTH, 'utf8');
  const stateAt = src.search(/\$guardRunning\s*=\s*\(\[string\]\$guardTask\.State\)\s*-\s*eq\s*'Running'/);
  assert.ok(stateAt !== -1, "必须先用 $guardTask.State -eq 'Running' 判定 watcher 存活");
  const cmdAt = src.search(/CommandLine -like '\*guard-shared-root-writes\.ps1\*'/);
  assert.ok(cmdAt !== -1 && cmdAt > stateAt, 'CommandLine 匹配只能作为 State 判假之后的兜底');
  const between = src.slice(stateAt, cmdAt);
  assert.match(between, /if \(\s*-not \$guardRunning\s*\)/, '兜底分支必须由"State 判为未运行"门控');
  // 为什么不能只读 CommandLine：S4U 实例在另一个 session，非提权调用读不到它的 CommandLine
  // （返回 $null），于是把正在执法的 watcher 判成未运行 —— 这是本案真实发生的误判。
});
