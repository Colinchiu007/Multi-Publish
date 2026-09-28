// 回归锁：ci-failure-handler.yml 与分类器之间的**合同**（handler 侧结构锁）。
//
// 为什么单独成文件：这组锁断言的是 workflow 正文（env 传值、去重键、回落分支、注入面），
// 被测对象是 yml 而不是分类器纯函数。合并 #2592 后 classify-ci-failure.test.js 达 522 行，
// 再往里加就撞 check-max-lines 的 500 硬限（NEW_OVER_LIMIT 阻断）；拆文件比挂账诚实——
// 挂账等于承认「接受漂移」，而这两组锁本来就该按被测对象分开。

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const HANDLER = fs.readFileSync(path.join(__dirname, '..', 'workflows', 'ci-failure-handler.yml'), 'utf8');


test('handler 消费的每个 output 键都必须由分类器投影出来', () => {
  const consumed = new Set(
    [...HANDLER.matchAll(/steps\.parse-failure\.outputs\.([A-Z_][A-Z0-9_]*)/g)].map(m => m[1])
  );
  assert.ok(consumed.size >= 6, `应当至少核对 6 个字段，实际 ${consumed.size} —— 正则可能已经失配`);
  // COMMIT_SHA 等由 parse-failure 步骤自己 echo，其余必须来自 toOutputLines
  const selfEchoed = new Set(['WORKFLOW_NAME', 'COMMIT_SHA', 'PR_NUMBER', 'RUN_ID']);
  const produced = new Set(
    require('./classify-ci-failure.js')
      .toOutputLines({
        type: 't', workflowName: 'w', rootJob: 'j', rootStep: 's', exitCode: 1,
        trackedIn: null, fileIssue: true, signature: 'x', evidence: 'e',
      })
      .split('\n')
      .map(line => line.split('=')[0])
  );
  assert.ok(produced.has('TYPE') && produced.has('SIGNATURE'), '投影本身必须至少含 TYPE/SIGNATURE，否则这条守卫是空的');
  const missing = [...consumed].filter(k => !produced.has(k) && !selfEchoed.has(k));
  assert.deepEqual(missing, [], `handler 引用了分类器没投影的字段: ${missing.join(', ')}`);
});

test('handler 不得退回常量或 per-SHA 去重（这两条正是本 PR 修的东西）', () => {
  assert.doesNotMatch(HANDLER, /FAILURE_TYPE=ci-failure/, '分类结果不得再写常量');
  assert.doesNotMatch(HANDLER, /AUTO_FIXABLE=true/, '同上');
  assert.doesNotMatch(HANDLER, /ci-failure-\$SHA in:title/, '去重键不得是 per-commit');
  assert.match(HANDLER, /node \.github\/scripts\/classify-ci-failure\.js/, '必须真的调用分类器');
  // 动态标签会让 gh issue create 直接失败（仓库无这些标签），故标签集合必须保持静态
  assert.match(HANDLER, /--label "bug,ci-failure,level-4"/, '标签必须是既有集合');
  assert.doesNotMatch(HANDLER, /--label "bug,ci-failure,\$\{\{/, '禁止把分类值塞进 --label');
  // 分类步骤自身失败要回落，否则 -e 会让 handler 变红且一张单都不开
  assert.match(HANDLER, /if ! node \.github\/scripts\/classify-ci-failure\.js/, '缺少回落分支');
  assert.match(HANDLER, /回落到旧行为/, '回落分支必须出声');
});

// --- 注入面守卫：run: 正文里不得内联 ${{ -------------------------------------------
// 存在理由：GitHub 表达式是**字面替换**进 shell 文本的，替换发生在 bash 解析之前。
// 本 handler 由 workflow_run 触发、带 issues:write / pull-requests:write，而
// `workflow_run.name` 是失败那个工作流文件自己声明的字符串——fork 的 PR 想写什么写什么。
// 修法只有一条：值进 env:，正文里读 shell 变量。
function runBlocks(text) {
  const lines = text.split(/\r?\n/);
  const blocks = [];
  for (let i = 0; i < lines.length; i++) {
    const head = /^(\s*)run:\s*[|>][-+]?\s*$/.exec(lines[i]);
    if (!head) continue;
    const indent = head[1].length;
    const body = [];
    let j = i + 1;
    for (; j < lines.length; j++) {
      const line = lines[j];
      const lead = /^\s*/.exec(line)[0].length;
      if (line.trim() !== '' && lead <= indent) break;
      body.push(line);
    }
    blocks.push({ startLine: i + 1, text: body.join('\n') });
    i = j - 1;
  }
  return blocks;
}

test('run: 正文里不得内联 ${{ 表达式（字面替换先于 bash 解析 = 命令注入面）', () => {
  const blocks = runBlocks(HANDLER);
  assert.ok(blocks.length >= 6, `至少应解析出 6 个 run 块，实际 ${blocks.length} —— 解析器失配会让本守卫变成装饰`);
  const offending = blocks.filter(b => b.text.includes('${{')).map(b => b.startLine);
  assert.deepEqual(offending, [], `这些 run: 块正文里内联了 \${{ ... }}（起始行 ${offending.join(', ')}）`);
  // 反向自证：不是"整份文件没有表达式"造成的假绿——env 传的值必须真的被正文读走
  const first = blocks[0].text;
  assert.match(first, /"\$EVT_WORKFLOW_NAME"/, '工作流名必须由 env 变量提供');
  assert.match(first, /--run-attempt "\$EVT_RUN_ATTEMPT"/, 'attempt 必须由 env 变量提供');
  assert.match(HANDLER, /EVT_WORKFLOW_NAME: \$\{\{ github\.event\.workflow_run\.name \}\}/, 'env 侧必须绑定事件字段');
  // 正文读走的每个 $EVT_* 都必须在 env: 里声明过。漏声明不报错，只是**空串**——
  // 而空 attempt 正是"读最新 attempt"的旧行为，等于把 #2572 的竞态静默改回来。
  const declared = new Set([...HANDLER.matchAll(/^[ \t]+(EVT_[A-Z_]+):/gm)].map(m => m[1]));
  const used = new Set([...HANDLER.matchAll(/\$(EVT_[A-Z_]+)/g)].map(m => m[1]));
  assert.ok(used.size >= 5, `至少应有 5 个 $EVT_ 引用，实际 ${used.size} —— 正则失配则本条为空守卫`);
  assert.deepEqual([...used].filter(u => !declared.has(u)), [], '有 $EVT_* 没有对应的 env: 声明');
});

test('handler 必须把 run_attempt 传给分类器（否则 #2572 的重跑竞态会复现）', () => {
  const handler = fs.readFileSync(path.join(__dirname, '..', 'workflows', 'ci-failure-handler.yml'), 'utf8');
  assert.match(handler, /--run-attempt /, '调用处必须带 --run-attempt');
  assert.match(handler, /workflow_run\.run_attempt/, '值必须取自事件的 run_attempt，不能自己猜');
});
