'use strict'
/**
 * index.js — 账号云镜像服务端的聚合出口（供 `publish-api-server.js` require）。
 *
 * 接线只做一件事：把注入依赖收拢成 `createCloudAccountServices({ pool, kms })`，
 * 让 HTTP 入口拿到 `{ repository, crypto, handle }` 就能工作，不需要知道各模块的拼装顺序。
 * 本文件不 require `publish-api-server.js`，避免循环依赖（服务端反过来 require 本模块）。
 *
 * 用法（后续接线方，本 PR 不改 `publish-api-server.js`）：
 *   const cloudAccounts = require('./cloud-accounts')
 *   const services = cloudAccounts.createCloudAccountServices({ pool, kms: cloudAccounts.createLocalKms() })
 *   // 路径前缀命中 ACCOUNTS_PATH / SYNC_PATH 时：
 *   const { status, body } = await services.handle({ method, url, req, auth: req.auth })
 *   this._json(res, status, body)
 */

const credentialDigestModule = require('./credential-digest')
const envelopeModule = require('./envelope-crypto')
const repositoryModule = require('./cloud-account-repository')
const handlersModule = require('./handlers')
const validateModule = require('./validate-account')
const keyringModule = require('./keyring-kms')

const { createEnvelopeCrypto, createLocalKms } = envelopeModule
const { createKeyringKms, KEYRING_ENV } = keyringModule
const { createCloudAccountRepository } = repositoryModule
const { handleCloudAccountsRequest } = handlersModule

/**
 * KMS 提供方的**唯一**选择口径（生产与开发都走这里，禁止在调用点各写一份判断）：
 *   * 配了 `MP_CLOUD_KMS_KEYRING`（环文件路径）⇒ 生产密钥环，支持轮转；
 *   * 否则 ⇒ 本机单密钥 `MP_CLOUD_KMS_LOCAL_KEY`，**只适用于开发/测试**（换密钥即报废既有信封）。
 * 两者都没配时由 `createLocalKms` 抛 `KMS_CONFIG_INVALID`，调用方据此把该面报成 503。
 *
 * 「配了但值为空白」与「没配」是两件事：前者是配置事故，必须当场 `KMS_CONFIG_INVALID` 失败。
 * 早先用 `env[KEYRING_ENV] || ''` 判空会让一次空值赋值静默降级成开发单密钥——
 * 那正是 PRD §8.4 明令禁止的「降级成用固定密钥」，而现场只留下一条 warn。
 *
 * 返回 `{ kms, provider }`：`provider` 是给运维看的形状（`keyring` / `local`），绝不含主密钥。
 */
function createKmsFromEnv (env = process.env) {
  const configured = Boolean(env) && Object.prototype.hasOwnProperty.call(env, KEYRING_ENV)
  if (configured) {
    // 空不空白交给 createKeyringKms 判（路径缺失/空白都是 KMS_CONFIG_INVALID），不在这里替它兜底
    return { kms: createKeyringKms({ env }), provider: 'keyring' }
  }
  return { kms: createLocalKms({ env }), provider: 'local' }
}

/**
 * 组装一套可用的云账号服务。任一侧已构造好时可整体注入（`repository` / `crypto`），
 * 便于测试与「连接池复用既有业务库」的部署形态。
 * KMS 缺失时**不**降级：`createEnvelopeCrypto` 会在首次使用时抛 KMS_UNAVAILABLE。
 */
function createCloudAccountServices(options = {}) {
  const crypto = options.crypto || createEnvelopeCrypto({ kms: options.kms })
  const repository = options.repository
    || (options.pool ? createCloudAccountRepository({ pool: options.pool }) : null)
  return {
    repository,
    crypto,
    /** 与 `handleCloudAccountsRequest` 同契约，只是预注入了 repository / crypto。 */
    handle: (context = {}) => handleCloudAccountsRequest(Object.assign({ repository, crypto }, context)),
    routes: handlersModule.CLOUD_ACCOUNTS_ROUTES,
  }
}

module.exports = Object.assign(
  { createCloudAccountServices, createKmsFromEnv },
  credentialDigestModule,
  envelopeModule,
  keyringModule,
  repositoryModule,
  validateModule,
  handlersModule,
)
