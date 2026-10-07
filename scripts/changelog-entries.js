#!/usr/bin/env node
'use strict';
/*
 * changelog-entries.js — `CHANGELOG.md` 条目模型的**唯一**实现
 *
 * 为什么要有这个文件（2026-10-07 实测）：同一份 origin/main 的 blob 上，
 * `check-changelog-growth.js` 按 `HEADING_RE`（一级标题排除节标题）数到 **1,184 条 / 343 种**，
 * 而 `check-changelog-duplicate-entries.js` 按 `# [未发布]` 前缀数到 **1,158 条 / 330 种**。
 * 两把锁共同持有同一份台账的单调性，却各写了一遍「什么是一条条目」——
 * 口径分裂的后果是：任何一侧做的清理/检测都可能落在另一侧的盲区里。
 * 本模块把 切块 / 取标题 / 分组 / 选保留份 / 去重 收敛成一份实现，两个门禁都必须 require 它。
 *
 * canonical 判据逐字沿用 growth 的 HEADING_RE，因为那是被 QM-6 外部评审实测纠正过的版本
 * （原 `/^# \[/` 对 `# fix(自检门禁): …（#2648）` 这种无括号形条目失明，见 growth 头注释）。
 *
 * 全程**逐字节**搬运，不改任何一行的行尾：本仓 `* text=auto` 下 blob 是 LF、工作树是 CRLF，
 * 而台账里还有孤立 CR；任何「统一行尾回写」都会把一次清理变成整文件重写（已踩过，见 AGENTS.md）。
 */

// 一级标题即条目；只排除文档自身的节标题 `# CHANGELOG`。
// `# +`（一个或多个空格）是 QM-6 后端通道 MAJOR-4 的修正：markdown 允许 `#` 后跟任意个空格，
// 原先写死的"恰好一个空格"会让 `#  Title` 这类合法标题**既不被 growth 保护、也不被副本棘轮计数**。
// 实测本仓当前 base 与 head 上多空格 H1 均为 0 处 ⇒ 这是补未来的失明，不改今天的行为。
const HEADING_RE = /^#[ \t]+(?!CHANGELOG(?:\s|$))\S/i;

/** 一行的条目标题形态：剥掉行尾空白（含 \r），不猜行尾种类。 */
function headingOfLine (line) {
  return line.trimEnd();
}

function isEntryHeading (line) {
  return HEADING_RE.test(headingOfLine(line));
}

/** 文本里所有条目标题（顺序即出现顺序）—— growth 的多重集判据用它，语义与本 change 之前逐字相同。 */
function headingsOf (text) {
  const out = [];
  for (const line of text.split('\n')) {
    if (isEntryHeading(line)) out.push(headingOfLine(line));
  }
  return out;
}

/**
 * 把原文切成 [preamble, entry1, entry2, ...]，逐字节保留（含各自行尾与孤立 CR）。
 * 逐行扫偏移而不是 split(/\r?\n/) —— 后者会把"这一行原本用什么行尾"这个信息丢掉。
 */
function splitEntries (text) {
  const starts = [];
  let pos = 0;
  while (pos <= text.length) {
    const nl = text.indexOf('\n', pos);
    const end = nl === -1 ? text.length : nl + 1;
    const line = text.slice(pos, end);
    if (isEntryHeading(line)) starts.push(pos);
    if (nl === -1) break;
    pos = end;
  }
  if (!starts.length) return { preamble: text, blocks: [], starts: [] };
  const preamble = text.slice(0, starts[0]);
  const blocks = [];
  for (let i = 0; i < starts.length; i++) {
    const from = starts[i];
    const to = i + 1 < starts.length ? starts[i + 1] : text.length;
    blocks.push(text.slice(from, to));
  }
  return { preamble, blocks, starts };
}

/** 块所属标题。必须与 headingsOf 的取值口径完全一致，否则两个门禁的标题集仍不可比。 */
function titleOf (block) {
  return headingOfLine(block.split('\n')[0]);
}

/** 同题多份时保留正文最长的那一份；等长则保留首次出现（顺序稳定，可重跑）。
 * 这一条规则 MUST 只有一份实现：analyze 报的 kept 与 dedupe 实际保留的那一份必须是同一个，
 * 否则「门禁说会留哪份」和「修复真留了哪份」就是两套口径（2026-10-07 反证 M3 抓到的正是这种分裂）。 */
function pickKeeper (occurrences) {
  return occurrences.reduce((best, cur) => (cur.bytes > best.bytes ? cur : best), occurrences[0]);
}

/** 标题 -> 出现列表（index + bytes）；插入顺序即首次出现顺序。 */
function groupByTitle (blocks) {
  const groups = new Map();
  blocks.forEach((b, i) => {
    const t = titleOf(b);
    if (!groups.has(t)) groups.set(t, []);
    groups.get(t).push({ index: i, bytes: Buffer.byteLength(b) });
  });
  return groups;
}

function countByTitle (text) {
  const m = new Map();
  for (const b of splitEntries(text).blocks) {
    const t = titleOf(b);
    m.set(t, (m.get(t) || 0) + 1);
  }
  return m;
}

/** 检测结果：entries / distinct / redundant（多出来的份数）/ worst / 重复标题明细 */
function analyze (text) {
  const { blocks } = splitEntries(text);
  const groups = groupByTitle(blocks);
  const dups = [...groups.entries()].filter(([, g]) => g.length > 1)
    .map(([t, g]) => ({ title: t, count: g.length, kept: pickKeeper(g).index }))
    .sort((a, b) => b.count - a.count || a.title.localeCompare(b.title));
  return {
    entries: blocks.length,
    distinct: groups.size,
    redundant: blocks.length - groups.size,
    worst: dups.length ? dups[0].count : 1,
    duplicateTitles: dups,
    ok: dups.length === 0,
  };
}

/** 去重：每个标题只留一份（按 pickKeeper），顺序按"首次出现的标题顺序"；preamble 原样在最前。幂等。 */
function dedupe (text) {
  const { preamble, blocks } = splitEntries(text);
  const groups = groupByTitle(blocks);
  const order = [];
  const keepIndexByTitle = new Map();
  for (const [t, occurrences] of groups) {
    order.push(t);
    keepIndexByTitle.set(t, pickKeeper(occurrences).index);
  }
  const out = [preamble];
  for (const t of order) out.push(blocks[keepIndexByTitle.get(t)]);
  const repaired = out.join('');
  return {
    text: repaired,
    removed: blocks.length - order.length,
    entriesBefore: blocks.length,
    entriesAfter: order.length,
    titlesReduced: [...groups.values()].filter((g) => g.length > 1).length,
  };
}

module.exports = {
  HEADING_RE,
  headingOfLine,
  isEntryHeading,
  headingsOf,
  splitEntries,
  titleOf,
  pickKeeper,
  groupByTitle,
  countByTitle,
  analyze,
  dedupe,
};
