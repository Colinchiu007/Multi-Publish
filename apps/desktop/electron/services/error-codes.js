/**
 * Error codes - 通过 core/error-codes 统一提供
 * Layer 2: Services — 依赖 Layer 1 Core
 */
const core = require('../core/error-codes')
module.exports = { ERROR: core.ERROR, getMessage: core.getMessage }
