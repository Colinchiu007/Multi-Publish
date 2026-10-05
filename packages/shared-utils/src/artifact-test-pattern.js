'use strict'
/**
 * artifact-test-pattern.js — 「什么算一个测试文件」的唯一判据
 *
 * 为什么要有这个文件（#2765）：同一条判据此前住在两处 ——
 * `.github/scripts/check-asar-test-files.js` 的 `TEST_FILE_RE`（管 app.asar 侧）与
 * 打包暂存脚本里的拷贝逻辑（管 app.asar **之外**的松散文件树）。两份必然漂移，
 * 而漂移的表现是"门禁说干净、产物里还有"，正好是 #2702 那一族的成因。
 * 收进 shared-utils 与 platform-definitions / login-state / publish-capabilities 同惯例。
 *
 * 口径：
 * - 只认 `{被测}.test.{js|mjs|cjs|ts|tsx}` 这一族命名，**按 basename 尾部整段匹配**：
 *   `.test.jsx`（未登记）与 `.test.js.map`（source map，不是被执行的文件）都不算。
 *   新增一族命名时不得改这里了事 —— 由 `check-asar-test-files.js` 的命名反查
 *   （checkNamingCensus）在当天变红，逼着"判据 + 排除模式"两处一起改。
 * - 目录名（`tests/`、`__tests__/`）**不作为判据**：本仓 `tests/` 里混着夹具与脚本，
 *   按目录剪会连带删掉运行期要用的东西（见 stage-remotion-runtime.test.js 的 fixtures.json 用例）。
 */

const path = require('node:path')

const TEST_FILE_RE = /\.test\.(?:js|mjs|cjs|ts|tsx)$/

/** 与 TEST_FILE_RE 同族的 build.files / extraResources 排除模式（整棵树通配，不是只盯某个目录）。 */
const TEST_EXCLUSION_PATTERNS = ['.js', '.mjs', '.cjs', '.ts', '.tsx'].map((ext) => '!**/*.test' + ext)

/**
 * 归一化反斜杠：asar 的 listPackage 在 Windows 上返回 `\electron\a.test.js` 这种形状，
 * 而 cpSync 的 filter 收到的是原生路径。判据只锚尾部，所以这里只影响前缀分类与展示。
 */
function normalizePathSeparators (p) {
  return String(p).split('\\').join('/')
}

function isTestArtifactPath (p) {
  return TEST_FILE_RE.test(normalizePathSeparators(path.basename(String(p))))
}

module.exports = { TEST_FILE_RE, TEST_EXCLUSION_PATTERNS, isTestArtifactPath, normalizePathSeparators }
