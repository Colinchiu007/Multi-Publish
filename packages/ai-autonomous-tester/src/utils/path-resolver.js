/**
 * ·����������
 * 
 * �� monorepo ����λ�����ϲ�����Ŀ��Ŀ¼
 * ����ƥ�� .git / AGENTS.md�����ƥ�� package.json
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
