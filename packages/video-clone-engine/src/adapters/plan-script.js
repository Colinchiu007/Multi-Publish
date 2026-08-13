'use strict';

const { VideoCloneError } = require('../errors');
const { emptyReport } = require('../clone-report');
const { assessReplicationLevel } = require('../replication-level');

/**
 * plan 阶段：文案改写 + 复刻模式应用（PRD F3.1 / §16）。
 * - options.rewriteScript=true 且注入 llmRunner → 改写 script.fullText（失败 retryable）
 * - 未注入 llmRunner → 保留原文，provenance.rewrite='skipped'（配置缺失，不 fail-closed）
 * - replicationLevel/mode 写入报告；inspiration 模式清空风格类字段（仅借结构）
 * - 产出 cloneReport：以 analyze 报告为基础（plan 编辑后即为 clone 侧报告）
 */
function createScriptPlan({ llmRunner = null } = {}) {
  async function run(ctx) {
    const opts = ctx.request.options || {};
    const analysis = ctx.artifacts.analysis || {};
    const r = ctx.report;
    // 防御性归一化：先补全 7 层默认结构再操作
    const base = emptyReport();
    for (const layer of Object.keys(base)) {
      if (!r[layer] || typeof r[layer] !== 'object') r[layer] = base[layer];
    }

    // 复刻模式写入
    r.replication.mode = opts.mode || 'structure';

    // 文案改写
    if (opts.rewriteScript === true) {
      if (typeof llmRunner === 'function') {
        try {
          const rewritten = await llmRunner({ sourceText: r.script.fullText, mode: r.replication.mode });
          if (typeof rewritten !== 'string') throw new Error('llmRunner 返回非字符串');
          r.script.fullText = rewritten;
          analysis.rewrite = { status: 'ok' };
        } catch (err) {
          analysis.rewrite = { status: 'failed' };
          throw new VideoCloneError('VIDEOCLONE_REWRITE_FAILED', { phase: 'plan', cause: err });
        }
      } else {
        analysis.rewrite = { status: 'skipped', reason: '未注入 llmRunner' };
      }
    } else {
      analysis.rewrite = { status: 'kept' };
    }

    // 灵感复刻：仅借结构，清空风格类字段（画面风格/文案风格重置为 unknown）
    if (r.replication.mode === 'inspiration') {
      r.visual.palette = 'unknown';
      r.visual.transitions = [];
      r.scriptStyle.person = 'unknown';
      r.scriptStyle.tone = 'unknown';
      r.script.fullText = '';
      analysis.rewrite = analysis.rewrite || {};
      analysis.rewrite.inspiration = true;
    }

    // 复刻层级：显式请求优先（遗留/测试）；否则按最终克隆报告证据自动定级（v1.16）
    if (opts.replicationLevel) {
      r.replication.level = opts.replicationLevel;
      r.replication.auto = { determined: false, source: 'explicit', level: opts.replicationLevel };
    } else {
      const assess = assessReplicationLevel(r);
      r.replication.level = assess.level;
      r.replication.auto = {
        determined: true, method: 'evidence-based',
        level: assess.level, evidence: assess.evidence, confidence: assess.confidence,
      };
    }

    ctx.artifacts.analysis = analysis;
    return 'plan';
  }

  return { id: 'plan', run };
}

module.exports = { createScriptPlan };
