/**
 * Multi-Publish 与真实蚁小二截图的像素审计。
 *
 * 该工具只接受经过 PNG 解码和尺寸校验的图片。缺少真实参考图时返回
 * REFERENCE_UNVERIFIED，并以阻断状态结束，避免把 Multi-Publish 自身的
 * baseline 当作蚁小二参考图。
 */

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { PNG } = require('pngjs');
const pixelmatch = require('pixelmatch');

const REPO_ROOT = path.resolve(__dirname, '../../../../../');
const DEFAULT_MANIFEST = path.join(
  REPO_ROOT,
  '01-docs',
  'yixiaoer-reverse',
  'visual-baseline-manifest.json',
);
const DEFAULT_DIFF_DIR = path.join(
  REPO_ROOT,
  'apps',
  'desktop',
  'tests',
  'visual-testing',
  'reports',
  'yixiaoer-pixel-diff',
);

const DEFAULT_TARGETS = [
  {
    name: 'accounts',
    reference: '01-docs/yixiaoer-reverse/screenshots/yxe-live-20260722/accounts.png',
    current: '01-docs/yixiaoer-reverse/screenshots/current-pageaccounts.png',
    source: '真实蚁小二账号管理页（需登录后通过 CDP 捕获）',
  },
  {
    name: 'publish',
    reference: '01-docs/yixiaoer-reverse/screenshots/yxe-live-20260722/publish.png',
    current: '01-docs/yixiaoer-reverse/screenshots/current-pagepublish.png',
    source: '真实蚁小二内容发布页（需登录后通过 CDP 捕获）',
  },
  {
    name: 'batch-publish',
    reference: '01-docs/yixiaoer-reverse/screenshots/yxe-live-20260722/batch-publish.png',
    current: '01-docs/yixiaoer-reverse/screenshots/current-pagebatch-publish.png',
    source: '真实蚁小二批量发布页（需登录后通过 CDP 捕获）',
  },
];

function resolvePath(filePath, root = REPO_ROOT) {
  if (typeof filePath !== 'string' || filePath.trim() === '') return null;
  return path.isAbsolute(filePath) ? filePath : path.resolve(root, filePath);
}

function hashFile(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function readPng(filePath, label) {
  if (!filePath || !fs.existsSync(filePath)) {
    return {
      ok: false,
      status: label === 'reference' ? 'REFERENCE_UNVERIFIED' : 'CURRENT_MISSING',
      reason: `${label === 'reference' ? '参考图不存在' : '当前图不存在'}：${filePath || '(未提供)'}`,
    };
  }

  try {
    const buffer = fs.readFileSync(filePath);
    const image = PNG.sync.read(buffer);
    if (image.width <= 0 || image.height <= 0) {
      throw new Error('图片尺寸必须大于 0');
    }
    return {
      ok: true,
      image,
      dimensions: [image.width, image.height],
      bytes: buffer.length,
      sha256: hashFile(filePath),
    };
  } catch (cause) {
    return {
      ok: false,
      status: label === 'reference' ? 'REFERENCE_INVALID' : 'CURRENT_INVALID',
      reason: `${label === 'reference' ? '参考图' : '当前图'}不是可解码 PNG：${filePath}（${cause.message}）`,
    };
  }
}

function compareImages(reference, current, options = {}) {
  if (reference.width !== current.width || reference.height !== current.height) {
    return {
      status: 'DIMENSION_MISMATCH',
      passed: false,
      blocked: true,
      dimensions: {
        reference: [reference.width, reference.height],
        current: [current.width, current.height],
      },
      mismatchPixels: null,
      mismatchPercentage: 100,
    };
  }

  const diffImage = new PNG({ width: reference.width, height: reference.height });
  const mismatchPixels = pixelmatch(
    reference.data,
    current.data,
    diffImage.data,
    reference.width,
    reference.height,
    {
      threshold: options.pixelThreshold ?? 0.1,
      includeAA: false,
      alpha: 0.5,
    },
  );
  const totalPixels = reference.width * reference.height;
  const mismatchPercentage = totalPixels === 0 ? 100 : (mismatchPixels / totalPixels) * 100;
  return {
    status: mismatchPercentage <= (options.threshold ?? 0.1) * 100 ? 'PASS' : 'FAIL',
    passed: mismatchPercentage <= (options.threshold ?? 0.1) * 100,
    blocked: false,
    dimensions: {
      reference: [reference.width, reference.height],
      current: [current.width, current.height],
    },
    mismatchPixels,
    mismatchPercentage,
    diffImage,
  };
}

async function compareTarget(target, options = {}) {
  const root = options.root || REPO_ROOT;
  const name = target && target.name ? String(target.name) : 'unnamed';
  const referencePath = resolvePath(target && target.reference, root);
  const currentPath = resolvePath(target && target.current, root);
  const result = {
    name,
    source: target && target.source ? target.source : null,
    referencePath,
    currentPath,
    status: 'REFERENCE_UNVERIFIED',
    passed: false,
    blocked: true,
    reason: null,
  };

  const reference = readPng(referencePath, 'reference');
  if (!reference.ok) {
    result.status = reference.status;
    result.reason = reference.reason;
    return result;
  }
  const current = readPng(currentPath, 'current');
  if (!current.ok) {
    result.status = current.status;
    result.reason = current.reason;
    return result;
  }

  const comparison = compareImages(reference.image, current.image, options);
  result.status = comparison.status;
  result.passed = comparison.passed;
  result.blocked = comparison.blocked;
  result.dimensions = comparison.dimensions;
  result.mismatchPixels = comparison.mismatchPixels;
  result.mismatchPercentage = comparison.mismatchPercentage;
  result.referenceBytes = reference.bytes;
  result.currentBytes = current.bytes;
  result.referenceSha256 = reference.sha256;
  result.currentSha256 = current.sha256;

  if (comparison.diffImage && options.diffDir) {
    const diffPath = path.join(options.diffDir, `${name}.png`);
    await fs.promises.mkdir(path.dirname(diffPath), { recursive: true });
    await fs.promises.writeFile(diffPath, PNG.sync.write(comparison.diffImage));
    result.diffPath = diffPath;
  }
  return result;
}

function summarize(results) {
  return {
    total: results.length,
    passed: results.filter((result) => result.status === 'PASS').length,
    failed: results.filter((result) => ['FAIL', 'CURRENT_MISSING', 'CURRENT_INVALID', 'REFERENCE_INVALID'].includes(result.status)).length,
    blocked: results.filter((result) => result.blocked).length,
    referenceUnverified: results.filter((result) => result.status === 'REFERENCE_UNVERIFIED').length,
    dimensionMismatch: results.filter((result) => result.status === 'DIMENSION_MISMATCH').length,
  };
}

async function runAudit(options = {}) {
  const targets = options.targets || DEFAULT_TARGETS;
  const root = options.root || REPO_ROOT;
  const diffDir = options.diffDir || (options.root
    ? path.join(root, 'diff')
    : DEFAULT_DIFF_DIR);
  const results = [];
  for (const target of targets) {
    results.push(await compareTarget(target, {
      ...options,
      root,
      diffDir,
    }));
  }
  const report = {
    meta: {
      generatedAt: options.generatedAt || new Date().toISOString(),
      manifest: options.manifest || DEFAULT_MANIFEST,
      rule: '真实蚁小二参考图必须可解码且尺寸一致；缺失参考图不得通过',
    },
    summary: summarize(results),
    results,
  };
  if (options.outputJson) {
    await fs.promises.mkdir(path.dirname(options.outputJson), { recursive: true });
    await fs.promises.writeFile(options.outputJson, JSON.stringify(report, null, 2) + '\n', 'utf8');
  }
  if (options.outputMarkdown) {
    await fs.promises.mkdir(path.dirname(options.outputMarkdown), { recursive: true });
    await fs.promises.writeFile(options.outputMarkdown, renderMarkdown(report), 'utf8');
  }
  return report;
}

function renderMarkdown(report) {
  const lines = [
    '# 蚁小二真实基线像素审计',
    '',
    `生成时间：${report.meta.generatedAt}`,
    '',
    `汇总：${report.summary.passed}/${report.summary.total} 通过，${report.summary.failed} 失败，${report.summary.blocked} 阻断，${report.summary.referenceUnverified} 个参考图未验证。`,
    '',
    '| 视图 | 状态 | 参考图 | 当前图 | 尺寸 | 误差 | 备注 |',
    '|---|---|---|---|---|---:|---|',
  ];
  for (const result of report.results) {
    const dimensions = result.dimensions
      ? `${result.dimensions.reference.join('x')} / ${result.dimensions.current.join('x')}`
      : '-';
    const mismatch = Number.isFinite(result.mismatchPercentage)
      ? `${result.mismatchPercentage.toFixed(4)}%`
      : '-';
    lines.push(`| ${result.name} | ${result.status} | ${result.referencePath || '-'} | ${result.currentPath || '-'} | ${dimensions} | ${mismatch} | ${result.reason || result.source || ''} |`);
  }
  lines.push('', '> `REFERENCE_UNVERIFIED` 不是通过；必须在同一窗口尺寸下从真实蚁小二捕获参考图后复跑。');
  return lines.join('\n') + '\n';
}

function loadManifest(manifestPath = DEFAULT_MANIFEST) {
  const absolutePath = path.isAbsolute(manifestPath)
    ? manifestPath
    : (fs.existsSync(path.resolve(process.cwd(), manifestPath))
      ? path.resolve(process.cwd(), manifestPath)
      : resolvePath(manifestPath, REPO_ROOT));
  if (!absolutePath || !fs.existsSync(absolutePath)) {
    return { version: 1, targets: DEFAULT_TARGETS, path: absolutePath, missing: true };
  }
  const parsed = JSON.parse(fs.readFileSync(absolutePath, 'utf8'));
  if (!Array.isArray(parsed.targets)) throw new Error('蚁小二像素 manifest.targets 必须是数组');
  return { ...parsed, path: absolutePath, missing: false };
}

async function main(argv = process.argv.slice(2)) {
  const manifestArg = argv.find((value) => value.startsWith('--manifest='));
  const manifestPath = manifestArg ? manifestArg.slice('--manifest='.length) : DEFAULT_MANIFEST;
  const manifest = loadManifest(manifestPath);
  const report = await runAudit({
    targets: manifest.targets,
    manifest: manifest.path,
    outputJson: path.join(REPO_ROOT, 'apps/desktop/tests/visual-testing/reports/yixiaoer-pixel-audit.json'),
    outputMarkdown: path.join(REPO_ROOT, 'apps/desktop/tests/visual-testing/reports/yixiaoer-pixel-audit.md'),
  });
  console.log(renderMarkdown(report));
  if (report.summary.failed > 0 || report.summary.blocked > 0) process.exitCode = 1;
  return report;
}

if (require.main === module) {
  main().catch((error) => {
    console.error(`蚁小二像素审计失败：${error.message}`);
    process.exitCode = 1;
  });
}

module.exports = {
  DEFAULT_MANIFEST,
  DEFAULT_TARGETS,
  compareTarget,
  loadManifest,
  renderMarkdown,
  runAudit,
  summarize,
};
