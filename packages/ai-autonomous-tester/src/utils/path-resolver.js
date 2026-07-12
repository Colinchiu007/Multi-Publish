/**
 * 路径解析工具
 * 
 * 从 monorepo 任意位置向上查找项目根目录
 * 优先匹配 .git / AGENTS.md，其次匹配 package.json
 */

const fs = require('fs');
const path = require('path');

function findProjectRoot(startDir, options = {}) {
  const maxDepth = options.maxDepth || 10;
  let dir = startDir;
  let lastPkg = null;

  for (let i = 0; i < maxDepth; i++) {
    const hasGit = fs.existsSync(path.join(dir, '.git'));
    const hasAgents = fs.existsSync(path.join(dir, 'AGENTS.md'));
    if (hasGit || hasAgents) return dir;

    if (fs.existsSync(path.join(dir, 'package.json'))) {
      lastPkg = dir;
    }

    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }

  return lastPkg
    ? path.dirname(lastPkg)
    : path.resolve(startDir, '..', '..', '..', '..', '..');
}

module.exports = { findProjectRoot };
