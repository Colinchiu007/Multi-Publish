#!/usr/bin/env node
/**
 * affected-report.js — 计算 base..head 之间变更会影响的 workspace 测试项目
 *
 * 语义与 Nx affected 一致：直接改动的包 + 传递依赖它们的包（依赖图来自各 workspace
 * package.json 的 @multi-publish/* 内部依赖）；根级全局配置（package.json/nx.json/
 * tsconfig 等）变更视为全部项目受影响。纯诊断工具，只读，不执行测试。
 *
 * 用法：
 *   node scripts/affected-report.js                       # base=origin/main head=HEAD
 *   node scripts/affected-report.js --base=<ref> --head=<ref>
 *   node scripts/affected-report.js --base=<ref> --head=<ref> --json
 *   node <ci-hardening>/scripts/affected-report.js --repo=<path> --base=<ref> --head=<ref>
 *
 * 退出码：0（信息性输出）；参数错误或 git 失败时非 0。
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// 仓库根定位：优先 --repo=<path>，其次当前工作目录（在目标仓库内直接运行），
// 最后回退脚本上级目录（原地部署在仓库 scripts/ 下时）。跨项目复用建议 cd 到目标仓库或传 --repo。
const ROOT = path.resolve(arg('repo', process.cwd()));

function arg(name, def) {
  const hit = process.argv.find((a) => a.startsWith('--' + name + '='));
  return hit ? hit.split('=').slice(1).join('=') : def;
}
const BASE = arg('base', 'origin/main');
const HEAD = arg('head', 'HEAD');
const JSON_MODE = process.argv.includes('--json');

function loadWorkspaceProjects() {
  const rootPkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  const projects = [];
  const names = new Map();
  for (const glob of rootPkg.workspaces || []) {
    const dir = glob.split('/')[0];
    if (!fs.existsSync(path.join(ROOT, dir))) continue;
    for (const d of fs.readdirSync(path.join(ROOT, dir))) {
      const p = path.join(ROOT, dir, d);
      if (!fs.existsSync(path.join(p, 'package.json'))) continue;
      const pj = JSON.parse(fs.readFileSync(path.join(p, 'package.json'), 'utf8'));
      const rel = path.relative(ROOT, p).split(path.sep).join('/');
      projects.push({ rel, name: pj.name });
      names.set(pj.name, rel);
    }
  }
  const depsOf = new Map();
  for (const proj of projects) {
    const pj = JSON.parse(fs.readFileSync(path.join(ROOT, proj.rel.split('/').join(path.sep), 'package.json'), 'utf8'));
    const all = Object.assign({}, pj.dependencies || {}, pj.devDependencies || {});
    depsOf.set(proj.name, new Set(Object.keys(all).filter((k) => names.has(k))));
  }
  return { projects, depsOf };
}

function closure(direct, projects, depsOf) {
  const affected = new Set(direct);
  let changed = true;
  while (changed) {
    changed = false;
    for (const p of projects) {
      if (affected.has(p.name)) continue;
      if (Array.from(depsOf.get(p.name)).some((d) => affected.has(d))) {
        affected.add(p.name);
        changed = true;
      }
    }
  }
  return affected;
}

function fileToProject(file, projects) {
  for (const p of projects) if (file.startsWith(p.rel + '/')) return p.name;
  return null;
}

function git(args) {
  return execSync('git ' + args, { cwd: ROOT, encoding: 'utf8' }).trim();
}

const { projects, depsOf } = loadWorkspaceProjects();
const files = git('diff --name-only ' + BASE + ' ' + HEAD).split('\n').filter(Boolean);
const direct = new Set(files.map((f) => fileToProject(f, projects)).filter(Boolean));

// 根级全局配置变更 → 全部项目受影响（与 Nx affected 语义一致）
const GLOBAL_CONFIGS = ['package.json', 'package-lock.json', 'nx.json', 'workspace.json', 'angular.json'];
const rootConfigHit = files.some(function (f) {
  if (GLOBAL_CONFIGS.indexOf(f) >= 0) return true;
  if (/^tsconfig([.][^/]+)?[.]json$/.test(f)) return true;
  return /^[^/]+[.]config[.][cm]?[jt]s$/.test(f);
});
const allProjects = new Set(projects.map(function (pp) { return pp.name; }));
const affected = rootConfigHit ? new Set(allProjects) : closure(Array.from(direct), projects, depsOf);
const unMapped = files.filter(function (f) { return !fileToProject(f, projects); });

const report = {
  base: BASE,
  head: HEAD,
  totalProjects: projects.length,
  changedFiles: files.length,
  globalConfigChanged: rootConfigHit,
  directProjects: Array.from(direct).sort(),
  affectedProjects: Array.from(affected).sort(),
  affectedPercent: Math.round((affected.size / projects.length) * 100),
  unMappedFiles: unMapped,
  dependencies: Object.fromEntries(
    Array.from(depsOf.entries()).filter(([, v]) => v.size).map(([k, v]) => [k, Array.from(v).sort()]),
  ),
};

if (JSON_MODE) {
  process.stdout.write(JSON.stringify(report, null, 2) + '\n');
} else {
  const fmt = (arr) => (arr.length ? arr.join(', ') : '（无）');
  console.log('受影响测试项目报告');
  console.log('  范围: ' + BASE + ' .. ' + HEAD + '  变更文件: ' + files.length + '  项目总数: ' + projects.length);
  const depLine = Object.entries(report.dependencies).map(([k, v]) => k + '->[' + v.join(',') + ']').join(' ');
  console.log('  依赖图: ' + (depLine || '（无内部依赖）'));
  console.log('  根级全局配置变更: ' + (rootConfigHit ? '是（全部项目受影响）' : '否'));
  console.log('  直接改动包: ' + fmt(report.directProjects));
  console.log('  affected (' + affected.size + '/' + projects.length + ', ' + report.affectedPercent + '%): ' + fmt(report.affectedProjects));
  if (unMapped.length) console.log('  未映射到项目的文件: ' + unMapped.join(', '));
}
