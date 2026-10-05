'use strict';
/**
 * .github/scripts/check-test-egress-guard.test.js — Gate 20 棘轮自身的回归
 *
 * 为什么必须有：棘轮一旦静默失效，"没有裸奔面"就变成一句没有证据的话。
 * 本轮真实发生过一次**棘轮把自己的检查对象改没了**：枚举判据写的是
 * `script.includes('node --test')`，而接线时在 `node` 与 `--test` 中间插了
 * `--require <setup>` —— 那两个面不是变红，是从枚举里消失（18 个面掉到 16 个，PASS 照报）。
 * 所以第 2 条夹具锁专门钉"两种写法都必须被枚举"。
 *
 * 夹具一律注入 files/readFile/knownUnguarded，不改真实工作树：改动真实工作树来证明门禁会红，
 * 正是"反证不得执行被守卫的动作"那条禁令的形状。
 */
const test = require('node:test');
const assert = require('node:assert/strict');

const {
  collectSurfaces,
  collectProblems,
  evaluate,
  hasPlaneCall,
  GUARD_MODULE,
  SETUP_BASE,
  KNOWN_UNGUARDED,
} = require('./check-test-egress-guard');

/** 构造一个夹具仓库：files = 路径清单，texts = 路径 → 内容 */
function fixture(files, texts) {
  const readFile = (rel) => (Object.prototype.hasOwnProperty.call(texts, rel) ? texts[rel] : null);
  return { files, readFile };
}

/**
 * 夹具基线：不看 .gitignore（那是真实仓库的事）、枚举下限放宽、且**不带真实欠账清单**——
 * 否则夹具里每条真实欠账都会被判"已不存在"，把本轮真正要测的那条红淹死在无关的红里。
 */
function withFixture(extra, files, texts) {
  return Object.assign(
    { minSurfaces: 1, checkIgnored: false, knownUnguarded: {} },
    extra || {},
    fixture(files, texts),
  );
}

test('共享 setup 只装 socket 面时必须红（子进程路径无守卫是 #2783 的另一半）', () => {
  const setupRel = 'packages/shared-utils/' + SETUP_BASE
  const files = ['packages/a/package.json', setupRel];
  const pkgJson = JSON.stringify({ scripts: { test: 'node --require ../shared-utils/' + SETUP_BASE + ' --test tests/x.test.js' } });
  const onlySocket = {
    'packages/a/package.json': pkgJson,
    [setupRel]: "require('./src/network-egress-guard.js').installTestNetworkGuard()\n",
  };
  const both = {
    'packages/a/package.json': pkgJson,
    [setupRel]: "const g = require('./src/network-egress-guard.js')\ng.installTestNetworkGuard()\ng.installTestChildProcessGuard({ setupPath: __filename })\n",
  };
  const a = collectProblems(withFixture({}, files, onlySocket));
  assert.ok(a.problems.some((p) => /installTestChildProcessGuard/.test(p)),
    '只有 socket 面的 setup 必须被判问题，实际：\n' + a.problems.join('\n'));
  const b = collectProblems(withFixture({}, files, both));
  assert.equal(b.problems.filter((p) => /installTestChildProcessGuard/.test(p)).length, 0,
    '两面齐全时不得报该问题：\n' + b.problems.join('\n'));
});

test('桌面 realm 只装 socket 面时必须红 —— #2783 的案发现场就在桌面 realm（QM-6 两路评审独立命中）', () => {
  const desktopRel = 'apps/desktop/test-setup.js'
  const files = [desktopRel, 'apps/desktop/vitest.config.js']
  const cfg = 'export default { test: { setupFiles: ["./test-setup.js"] } }'
  const socketOnly = {
    'apps/desktop/vitest.config.js': cfg,
    [desktopRel]: "require('../../" + GUARD_MODULE + "').installTestNetworkGuard()",
  }
  const bothPlanes = {
    'apps/desktop/vitest.config.js': cfg,
    [desktopRel]: "require('../../" + GUARD_MODULE + "').installTestNetworkGuard()\n"
      + "require('../../" + GUARD_MODULE + "').installTestChildProcessGuard({ setupPath: require.resolve('../../packages/shared-utils/" + SETUP_BASE + "') })",
  }
  const a = collectProblems(withFixture({}, files, socketOnly))
  assert.ok(a.problems.some((p) => /test-setup\.js 未装子进程面/.test(p)),
    '桌面 realm 缺子进程面必须红，实际：\n' + a.problems.join('\n'))
  const b = collectProblems(withFixture({}, files, bothPlanes))
  assert.equal(b.problems.filter((p) => /apps\/desktop/.test(p)).length, 0,
    '链式 `require(...).installTestChildProcessGuard({setupPath})` 是合法接线，不得误拦：\n' + b.problems.join('\n'))
})

test('注释里的调用不算接线；缺 setupPath 的调用也不算（装饰性门禁的两种造法）', () => {
  const setupRel = 'packages/shared-utils/' + SETUP_BASE
  const files = ['packages/a/package.json', setupRel]
  const pkgJson = JSON.stringify({ scripts: { test: 'node --require ../shared-utils/' + SETUP_BASE + ' --test tests/x.test.js' } })
  // 真调用被删掉，只留一行注释 —— 纯文本存在性判据会被这种写法骗过
  const commented = {
    'packages/a/package.json': pkgJson,
    [setupRel]: "// guard.installTestNetworkGuard()\n/* guard.installTestChildProcessGuard({ setupPath: __filename }) */\n",
  }
  const c = collectProblems(withFixture({ checkIgnored: false, minSurfaces: 1 }, files, commented))
  assert.ok(c.problems.some((p) => /未装 socket 面/.test(p)), '整行注释必须被判没接线：\n' + c.problems.join('\n'))
  assert.ok(c.problems.some((p) => /未装子进程面/.test(p)), '块注释必须被判没接线：\n' + c.problems.join('\n'))

  // 调用在，但没传 setupPath ⇒ 实现里对 node 子进程既不注入也不登记
  const noSetupPath = {
    'packages/a/package.json': pkgJson,
    [setupRel]: "const g = require('./src/network-egress-guard.js')\ng.installTestNetworkGuard()\ng.installTestChildProcessGuard()\n",
  }
  const d = collectProblems(withFixture({ checkIgnored: false, minSurfaces: 1 }, files, noSetupPath))
  assert.ok(d.problems.some((p) => /未装子进程面|缺 setupPath/.test(p)),
    '缺 setupPath 的子进程面调用必须红：\n' + d.problems.join('\n'))

  // 行尾拖的同名字样也不能造出命中
  assert.equal(hasPlaneCall("foo(); // installTestChildProcessGuard({ setupPath: x })", 'installTestChildProcessGuard', true), false,
    '行尾注释里的同名字样不得算接线')
  assert.equal(hasPlaneCall("g.installTestChildProcessGuard({\n  setupPath: p,\n})", 'installTestChildProcessGuard', true), true,
    '跨行写法的合法接线必须放过（多行 options 是真实形态）')
})

test('真实仓库：棘轮必须 0 问题（现场自证，不是"应该没问题"）', () => {
  const r = collectProblems();
  assert.deepEqual(r.problems, [], '真实仓库上棘轮报问题：\n' + r.problems.join('\n'));
  assert.ok(r.surfaceCount >= 10, '枚举面数不应低于下限，实际=' + r.surfaceCount);
  assert.equal(r.registered, Object.keys(KNOWN_UNGUARDED).length,
    '真实欠账清单每条都必须命中一个仍存在的面（键漂移就在这条上撞）');
});

test('node --test 与 node --require <setup> --test 两种写法都必须被枚举（防"改没了就看不见"）', () => {
  const bareTexts = {
    'packages/a/package.json': JSON.stringify({ scripts: { test: 'node --test tests/x.test.js' } }),
  };
  const wiredTexts = {
    'packages/b/package.json': JSON.stringify({
      scripts: { test: 'node --require ../shared-utils/' + SETUP_BASE + ' --test tests/y.test.js' },
    }),
  };
  const surfaces = collectSurfaces(fixture(
    ['packages/a/package.json', 'packages/b/package.json'],
    Object.assign({}, bareTexts, wiredTexts),
  ));
  assert.ok(surfaces.has('packages/a:node-test'), '裸 node --test 未被枚举');
  assert.ok(surfaces.has('packages/b:node-test'),
    '插了 --require 之后未被枚举 —— 这正是本轮真实踩到的失明');

  // 已接线的判 OK，未接线的判红
  assert.equal(evaluate(surfaces.get('packages/b:node-test'), fixture([], wiredTexts)), null);
  assert.match(String(evaluate(surfaces.get('packages/a:node-test'), fixture([], bareTexts))), /未引用共享守卫/);
});

test('合法接线的全集必须 0 问题（夹具判"不该拦的放过"）', () => {
  const files = [
    'apps/desktop/vitest.config.js',
    'apps/desktop/test-setup.js',
    'packages/ai-writer/vitest.config.js',
    'packages/ai-writer/package.json',
    'packages/api-publish-engine/scripts/run-tests.js',
    'packages/api-publish-engine/vitest.config.js',
    'packages/video-clone-engine/package.json',
  ];
  const texts = {
    'apps/desktop/vitest.config.js': 'export default { test: { setupFiles: ["./test-setup.js"] } }',
    'apps/desktop/test-setup.js': "require('../../" + GUARD_MODULE
      + "').installTestNetworkGuard()\nrequire('../../" + GUARD_MODULE
      + "').installTestChildProcessGuard({ setupPath: require.resolve('../../packages/shared-utils/" + SETUP_BASE + "') })",
    'packages/ai-writer/vitest.config.js': "setupFiles: ['../../packages/shared-utils/" + SETUP_BASE + "']",
    'packages/ai-writer/package.json': JSON.stringify({ scripts: { test: 'vitest run' } }),
    'packages/api-publish-engine/scripts/run-tests.js':
      "spawn(process.execPath, ['--require', setupPath, file])",
    'packages/api-publish-engine/vitest.config.js': "setupFiles: ['../shared-utils/" + SETUP_BASE + "']",
    'packages/video-clone-engine/package.json': JSON.stringify({
      scripts: { test: 'node --require ../shared-utils/' + SETUP_BASE + ' --test test/a.test.js' },
    }),
  };
  const r = collectProblems(withFixture({}, files, texts));
  assert.deepEqual(r.problems, [], '合法夹具被误拦：\n' + r.problems.join('\n'));
});

test('新增裸奔 vitest 面必须变红（"新增测试面无守卫"一律拦）', () => {
  const files = ['packages/newcomer/vitest.config.js'];
  const texts = { 'packages/newcomer/vitest.config.js': 'export default { test: { environment: "node" } }' };
  const r = collectProblems(withFixture({}, files, texts));
  assert.equal(r.problems.length, 1, '应只有一条"新增裸奔面"红：\n' + r.problems.join('\n'));
  assert.match(r.problems[0], /packages\/newcomer:vitest/);
  assert.match(r.problems[0], /没接守卫、也没登记原因/);
});

test('欠账条目对应的面一旦接上，必须当场报"陈旧登记"（销账与接线必须同一次发生）', () => {
  const key = 'packages/python-backend/tests:pytest';
  assert.ok(KNOWN_UNGUARDED[key], '夹具依赖的真实欠账条目不存在：' + key);
  const files = ['packages/python-backend/tests/conftest.py'];
  const ledger = { [key]: 'fixture' };

  const unwired = { 'packages/python-backend/tests/conftest.py': 'import pytest' };
  const wired = { 'packages/python-backend/tests/conftest.py': '@pytest.fixture(autouse=True)\ndef block_non_loopback_egress(): ...' };

  const a = collectProblems(withFixture({ knownUnguarded: ledger }, files, unwired));
  assert.deepEqual(a.problems, [], '未接线但已登记欠账的面不该报问题');
  assert.equal(a.registered, 1);

  const b = collectProblems(withFixture({ knownUnguarded: ledger }, files, wired));
  assert.equal(b.problems.length, 1, '接上后必须报陈旧登记');
  assert.match(b.problems[0], /已接上或已不存在/);
  assert.match(b.problems[0], /packages\/python-backend\/tests:pytest/);
});

test('欠账键漂移（清单写的键与枚举键不一致）必须两条红同时出现，不得互相掩盖', () => {
  // 本轮真实发生过：清单写 `packages/api-publish-engine:runner-vitest`，
  // 而枚举键是 `packages/api-publish-engine/scripts:runner-vitest`（dir 取自 run-tests.js 所在目录）。
  const wrongKey = 'packages/api-publish-engine:runner-vitest';
  const files = ['packages/api-publish-engine/scripts/run-tests.js'];
  const texts = { 'packages/api-publish-engine/scripts/run-tests.js': "['--require', setupPath, file]" };
  const r = collectProblems(
    withFixture({ knownUnguarded: { [wrongKey]: '漂移的键（复现本轮事故）' } }, files, texts),
  );
  assert.equal(r.problems.length, 2, '应同时报"未登记欠账"与"陈旧登记"两条：\n' + r.problems.join('\n'));
  assert.ok(r.problems.some((p) => /没接守卫、也没登记原因/.test(p)
    && /packages\/api-publish-engine\/scripts:runner-vitest/.test(p)), '裸奔面必须被点名');
  assert.ok(r.problems.some((p) => /已接上或已不存在/.test(p)
    && new RegExp(wrongKey.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).test(p)), '漂移的键必须被点名');
});

test('runner-vitest 的配置在包根而不在 scripts/ —— 只查 surface.dir 会把已接上误判成欠账', () => {
  const surface = {
    kind: 'runner-vitest',
    file: 'packages/api-publish-engine/scripts/run-tests.js',
    dir: 'packages/api-publish-engine/scripts',
  };
  const texts = {
    'packages/api-publish-engine/vitest.config.js': "setupFiles: ['../shared-utils/" + SETUP_BASE + "']",
  };
  assert.equal(evaluate(surface, fixture([], texts)), null, '包根配置未被上溯找到');
  assert.match(String(evaluate(surface, fixture([], {}))), /vitest 子集未引用/);
});

test('枚举退化（git ls-files 拿不到东西）必须 fail closed，不得报成"全仓合规"', () => {
  const r = collectProblems({ files: [], readFile: () => null, minSurfaces: 10, checkIgnored: false });
  assert.ok(r.problems.some((p) => /枚举退化/.test(p)), '空枚举必须红');
  // 且退化时真实欠账条目会同时被判"不存在" ⇒ 至少两条问题，绝不是一条 PASS
  assert.ok(r.problems.length >= 2, '空枚举至少要报退化 + 欠账失配两条，实际=' + r.problems.length);
});
