'use strict';

const { VideoCloneError } = require('../errors');

/**
 * publish adapter（PRD F3.2 / §17）：可选发布。
 * - enabled=false 或未注入 publisher → publishResult { status:'skipped', reason:'no-publisher' }（不失败）
 * - publisher({ media, report }) 抛错 → VIDEOCLONE_PUBLISH_FAILED（retryable）
 */
function createPublish({ publisher = null, enabled = true } = {}) {
  async function run(ctx) {
    if (enabled !== true || typeof publisher !== 'function') {
      ctx.publishResult = { status: 'skipped', reason: 'no-publisher' };
      return 'publish:skipped';
    }
    const media = ctx.artifacts.output || ctx.artifacts.media;
    try {
      ctx.publishResult = await publisher({ media, report: ctx.report });
      return 'publish';
    } catch (err) {
      throw new VideoCloneError('VIDEOCLONE_PUBLISH_FAILED', { phase: 'publish', cause: err });
    }
  }

  return { id: 'publish', run };
}

module.exports = { createPublish };
