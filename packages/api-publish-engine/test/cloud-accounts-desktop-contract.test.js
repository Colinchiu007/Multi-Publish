'use strict'
/**
 * test/cloud-accounts-desktop-contract.test.js — 桌面端 ↔ 业务 API 的跨包契约锁
 *
 * 为什么必须有这把锁：账号云特性的两侧（`apps/desktop/electron/services/cloud-account-sync.js`
 * 与 `packages/api-publish-engine/src/cloud-accounts/*`）各自有一套测试，而且**各自都全绿**——
 * 服务端用例把手工构造的「客户端上传信封」形状喂给服务端，桌面端用例把 apiClient 整个 mock 掉。
 * 于是外部评审揪出来的三处断裂（白名单没有 `credential`/`force`、digest 变化时服务端无条件覆盖、
 * 入口守卫漏了 tombstones）在本仓任何一层测试里都零红点。跨包边界上的缺陷只能由跨包边界的锁拦。
 *
 * 三段：
 *   1) 路由锁：桌面端**会**发的每一条 method+path，必须同时被入口守卫 `_isCloudAccountsUrl`
 *      命中、被 `CLOUD_ACCOUNTS_ROUTES` 覆盖。字面量从桌面端源码里读（`ME_API_PATHS` 与
 *      `cloud-account-core.js` / `cloud-account-tombstone.js` 的路径常量），不在本文件重抄。
 *   2) 请求形状锁：真跑一遍桌面端编排器，把它实际发出的 PUT 请求体原样喂给真 handlers
 *      （真校验、真加密，只把 SQL 层换成桩），断言逐条不得 `rejected`。这条覆盖上行契约。
 *   3) 响应形状锁：服务端出线形态按 PRD §7.1–§7.4 钉住，并把「桌面端读的是剥壳后的 data」
 *      这一处**尚未对齐**的裂口写成显式断言，不让它退化成「两边各自以为对上了」。
 */
const test = require('node:test').test
const assert = require('node:assert/strict')
const fs = require('fs')
const path = require('path')

const {
  CLOUD_ACCOUNTS_ROUTES,
  handleCloudAccountsRequest,
} = require('../src/cloud-accounts/handlers')
const { applyCloudAccountHelpers } = require('../src/auth/publish-api-cloud-accounts')
const { createCloudAccountRepository } = require('../src/cloud-accounts/cloud-account-repository')
const { createEnvelopeCrypto, createLocalKms } = require('../src/cloud-accounts/envelope-crypto')
const { credentialDigest } = require('../src/cloud-accounts/credential-digest')

const CLOUD_ACCOUNTS_PREFIX = '/api/v1/me/accounts'
const AUTH = { businessUser: { id: 'user-contract-1' } }
const KMS_KEY = '22'.repeat(32)

/**
 * 定位桌面端源码：从 `__dirname` 逐级上溯找锚点目录，**禁止数 `..` 层级**。
 * 数层级在本仓是踩过的坑（`node-linker=hoisted` 下 electron 装在仓库根，从服务目录数两级
 * 会指到不存在的路径），后果是「找不到就 skip」的锁永久静默跳过、通配锁被登记成「已实测」。
 * 这里找不到即抛错变红，绝不允许 return 跳过。
 */
function desktopServiceFile(relativeName) {
  let dir = __dirname
  for (let hop = 0; hop < 10; hop += 1) {
    const candidate = path.join(dir, 'apps', 'desktop', 'electron', 'services', relativeName)
    if (fs.existsSync(candidate)) return candidate
    const parent = path.dirname(dir)
    if (parent === dir) break
    dir = parent
  }
  throw new Error(`找不到桌面端源码锚点 apps/desktop/electron/services/${relativeName}（从 ${__dirname} 上溯 10 级）`)
}

function loadDesktop(relativeName) {
  const file = desktopServiceFile(relativeName)
  const source = fs.readFileSync(file, 'utf8')
  // eslint-disable-next-line global-require
  return { file, source, module: require(file) }
}

const memberApi = loadDesktop('identity/member-api-service.js')
const core = loadDesktop('cloud-account-core.js')
const tombstone = loadDesktop('cloud-account-tombstone.js')

/** 入口守卫挂在 PublishApiServer 原型上；按接线方的做法把它装到一个空宿主上再调用。 */
function createGuardHost() {
  class Host {}
  applyCloudAccountHelpers(Host)
  return new Host()
}

test('跨包契约锁：桌面端会请求的每条 method+path 都必须被守卫放行且被路由表覆盖', async (t) => {
  const guard = createGuardHost()
  const ME_API_PATHS = memberApi.module.ME_API_PATHS
  assert.ok(ME_API_PATHS instanceof Map && ME_API_PATHS.size > 0,
    'member-api-service.js 必须导出 ME_API_PATHS（Map）——读不到时本锁会退化成空跑')

  /** 只取云账号面：`/api/v1/me/accounts` 及其子路径。其余 /me 面属另一套处理器。 */
  const cloudRoutes = Array.from(ME_API_PATHS.entries())
    .filter(([apiPath]) => apiPath === CLOUD_ACCOUNTS_PREFIX || apiPath.startsWith(`${CLOUD_ACCOUNTS_PREFIX}/`))

  await t.test('ME_API_PATHS 里的云账号面不得被过滤成空集（空集会让下面的循环全绿）', () => {
    assert.ok(cloudRoutes.length >= 4,
      `桌面端云账号面至少 4 条路径，实得 ${cloudRoutes.length}：` + JSON.stringify(cloudRoutes))
    const methodPaths = cloudRoutes.flatMap(([apiPath, rule]) => rule.methods.map((m) => `${m} ${apiPath}`))
    assert.ok(methodPaths.length >= 5, `method+path 组合至少 5 条，实得 ${JSON.stringify(methodPaths)}`)
  })

  await t.test('桌面端每一条 method+path：守卫放行 + 路由表覆盖', () => {
    for (const [apiPath, rule] of cloudRoutes) {
      for (const method of rule.methods) {
        assert.equal(guard._isCloudAccountsUrl(apiPath), true, `入口守卫漏了 ${method} ${apiPath}`)
        assert.ok(CLOUD_ACCOUNTS_ROUTES.includes(`${method} ${apiPath}`),
          `handlers 的 CLOUD_ACCOUNTS_ROUTES 未覆盖 ${method} ${apiPath}：${JSON.stringify(CLOUD_ACCOUNTS_ROUTES)}`)
      }
    }
  })

  await t.test('反向：路由表里不得有桌面端白名单外的路径（否则是没人调用的死端点）', () => {
    const allowed = new Set(cloudRoutes.flatMap(([apiPath, rule]) => rule.methods.map((m) => `${m} ${apiPath}`)))
    for (const route of CLOUD_ACCOUNTS_ROUTES) {
      assert.ok(allowed.has(route), `桌面端不会请求 ${route}（ME_API_PATHS 未放行）：${JSON.stringify(Array.from(allowed))}`)
    }
  })

  await t.test('墓碑路径就是守卫漏过的那一条：单独钉住（本锁的存在理由）', () => {
    const TOMBSTONES_PATH = tombstone.module.TOMBSTONES_PATH
    assert.equal(TOMBSTONES_PATH, `${CLOUD_ACCOUNTS_PREFIX}/tombstones`)
    assert.ok(tombstone.source.includes('apiClient.request'), '前置：桌面端确实把墓碑 POST 出去')
    const rule = ME_API_PATHS.get(TOMBSTONES_PATH)
    assert.ok(rule && rule.methods.includes('POST'), '桌面端会员白名单必须放行 POST 墓碑')
    assert.equal(guard._isCloudAccountsUrl(TOMBSTONES_PATH), true,
      '入口守卫漏 tombstones → 墓碑写入在入口就 404，「已删账号不得在别的设备复活」形同虚设')
    assert.ok(CLOUD_ACCOUNTS_ROUTES.includes(`POST ${TOMBSTONES_PATH}`), '路由表必须覆盖墓碑 POST')
  })

  await t.test('桌面端路径常量与守卫/路由表同源（core 里的三条 + tombstone 里的一条）', () => {
    const constants = [
      ['ACCOUNT_PATH', core.module.ACCOUNT_PATH, ['GET', 'PUT']],
      ['SYNC_PATH', core.module.SYNC_PATH, ['POST']],
      ['DISCONNECT_PATH', core.module.DISCONNECT_PATH, ['POST']],
      ['TOMBSTONES_PATH', tombstone.module.TOMBSTONES_PATH, ['POST']],
    ]
    assert.equal(constants.filter(([, value]) => typeof value === 'string').length, 4,
      '桌面端四个路径常量必须都读得到，少一个说明常量被改名/挪走而本锁没跟上')
    for (const [name, apiPath, methods] of constants) {
      assert.ok(typeof apiPath === 'string' && apiPath.startsWith(CLOUD_ACCOUNTS_PREFIX),
        `${name} 形态异常：${apiPath}`)
      for (const method of methods) {
        assert.equal(guard._isCloudAccountsUrl(apiPath), true, `${name}（${method} ${apiPath}）被守卫漏掉`)
        assert.ok(CLOUD_ACCOUNTS_ROUTES.includes(`${method} ${apiPath}`), `${name}（${method} ${apiPath}）不在路由表`)
      }
    }
  })

  await t.test('守卫只认本面：其它 /me 面与未知子路径一律不放行（否则是被吞进错处理器）', () => {
    for (const apiPath of ['/api/v1/me/sessions', '/api/v1/me/notifications', '/api/v1/me', `${CLOUD_ACCOUNTS_PREFIX}/unknown`]) {
      assert.equal(guard._isCloudAccountsUrl(apiPath), false, `${apiPath} 不得被云账号守卫接管`)
    }
    // 查询串形态必须放行：桌面端用 `?view=full` 取全集（`buildQuery` 会拼上去）
    assert.equal(guard._isCloudAccountsUrl(`${CLOUD_ACCOUNTS_PREFIX}?view=full`), true)
    assert.equal(guard._isCloudAccountsUrl(`${CLOUD_ACCOUNTS_PREFIX}?view=digest`), true)
    assert.equal(guard._isCloudAccountsUrl(undefined), false)
  })
})

// ---- 请求形状锁：真跑桌面端编排器，把它发出的 PUT 喂给真 handlers ------------------------

/** 桌面端真源里的一条账号（字段名按 `AccountManager.listAccounts()` 的返回形态）。 */
function localAccount(overrides) {
  return Object.assign({
    id: 'acct-1',
    platform: 'douyin',
    name: '数字生命丘丘',
    account_name: '丘丘',
    platform_account_id: 'uid-9',
    avatar: '',
    followers: 12,
    is_active: true,
    last_validated: '2026-09-26T08:00:00.000Z',
  }, overrides || {})
}

function localCredential(marker) {
  return {
    cookies: [{ name: 'sid', value: `v-${marker}`, domain: '.example.com', path: '/', secure: true }],
    localStorage: { marker: String(marker) },
    indexedDB: {},
  }
}

/**
 * 桌面端编排器 ⇄ 真服务端的对接夹具。
 *
 * ⚠ 诚实边界：`apiClient` 这一层回给桌面端的是**剥掉 `{code,data}` 外壳**的载荷。真实
 * `member-api-service.request` 返回的是整个 JSON body，而 `cloud-account-sync.js` 读的是
 * `cloud.total` / `put.results` / `got.credentials`（都在 data 里面）。那是响应方向上一处
 * **尚未对齐**的裂口，本 PR 只按 brief 修上行，不在这里假装两边已经对上；下面第三段把服务端的
 * 真实出线形状单独钉住，并用一条断言把「桌面端读的是内层」这个事实写死，谁改谁红。
 */
function createHarness(options = {}) {
  const { outcomes = {}, cloudCredentialCheckValid = false, serverUserId = 'user-contract-1' } = options
  const requests = []
  const repositoryCalls = []
  const account = localAccount({})
  const localCred = localCredential('local')

  const repository = {
    async listDigest() { return { total: 0, byPlatform: [], tombstones: 0, updatedAt: null } },
    async listFull() { return { accounts: [], tombstones: [] } },
    async getCredentials() { return [] },
    async addTombstone() { return { created: true } },
    async clearAll() { return { ok: true, deletedAccounts: 0, deletedTombstones: 0, remaining: 0 } },
    async upsertMany(userId, items) {
      repositoryCalls.push({ userId, items })
      return {
        results: items.map((item) => {
          const outcome = outcomes[`${item.platform}|${item.platformUid}`] || 'updated'
          const row = { platform: item.platform, platformUid: item.platformUid, outcome }
          if (outcome === 'conflict') row.credentialFreshness = 'cloud'
          return row
        }),
      }
    },
  }

  const serverContext = (o, body) => ({
    method: o.method,
    url: o.path + (o.query ? `?${o.query}` : ''),
    req: { method: o.method, url: o.path, headers: {} },
    auth: { businessUser: { id: serverUserId } },
    repository,
    crypto: createEnvelopeCrypto({ kms: createLocalKms({ key: KMS_KEY }) }),
    bodyParser: async () => body,
    now: () => Date.parse('2026-09-27T08:00:00.000Z'),
  })

  const apiClient = {
    async request(o) {
      requests.push(o)
      // 下行取凭证这一条**不走真 handlers**：服务端按 PRD §7.3 出线 base64 `credentialEnvelope`，
      // 而桌面端 `fetchCloudCredential` 读的是明文 `credential`（两侧尚未对齐，见第三段的记录性断言）。
      // 本夹具在这里按桌面端的读取口径回包，唯一目的是让「冲突 → 本机实测 → 带 force 重发」这条
      // **上行**路径真的跑起来；它不构成对下行形态的任何证明，下行由 PRD 那一侧单独钉。
      if (o.method === 'POST' && o.path === core.module.SYNC_PATH) {
        return {
          credentials: [{
            platform: account.platform,
            platformUid: account.platform_account_id,
            credentialUpdatedAt: '2026-09-26T09:00:00.000Z',
            credential: localCredential('cloud'),
          }],
        }
      }
      const response = await handleCloudAccountsRequest(serverContext(o, o.body))
      // 见上面「诚实边界」：这里回内层，好让桌面端流程真的走下去。
      if (response.status >= 400) {
        throw Object.assign(new Error(response.body.error || 'request failed'), { code: response.body.error })
      }
      return response.body.data
    },
  }

  const created = []
  const AccountManager = {
    async listAccounts() { return [account] },
    async addAccount(payload) { created.push(payload); return { data: { id: 'restored-1' } } },
    async persistLoginState(id, state) { return { id, ...state } },
  }
  const credentialStore = {
    async loadCredential() { return localCred },
    async saveCredential() { return true },
  }
  const fetchAccountInfo = async () => ({ supported: true, platformAccountId: account.platform_account_id })
  const checkLogin = async (platform, cookies) => {
    const value = cookies && cookies[0] ? cookies[0].value : ''
    // 云端那份（marker=cloud）是否可用由夹具决定；本机那份恒可用。
    const valid = value === 'v-cloud' ? cloudCredentialCheckValid : true
    return { supported: true, valid }
  }

  const { createCloudAccountSync } = require(desktopServiceFile('cloud-account-sync.js'))
  const broadcasts = []
  const service = createCloudAccountSync({
    AccountManager, credentialStore, fetchAccountInfo, checkLogin, apiClient,
    broadcast: (payload) => broadcasts.push(payload),
    userDataDir: '', env: {}, now: () => Date.parse('2026-09-27T08:00:00.000Z'),
  })

  return {
    service, requests, repositoryCalls, broadcasts, account, localCred,
    putBodies: () => requests.filter((r) => r.method === 'PUT').map((r) => r.body),
  }
}

test('跨包契约锁：桌面端发出的 PUT 必须被服务端接受（真校验 + 真加密）', async (t) => {
  await t.test('常规同步：桌面端 PUT 的字段全部在白名单内，逐条零 rejected', async () => {
    const harness = createHarness()
    const result = await harness.service.sync('sub-1')
    assert.equal(result.code, 0, JSON.stringify(result))

    const bodies = harness.putBodies()
    assert.equal(bodies.length, 1, '一次同步应发出恰好一条 PUT')
    const [body] = bodies
    assert.ok(Array.isArray(body.accounts) && body.accounts.length === 1, JSON.stringify(body))
    const row = body.accounts[0]
    // 桌面端实际发送的键集，逐字对上服务端白名单（多一个键、少一个键都会让整批被拒）。
    assert.deepStrictEqual(Object.keys(row).sort(), [
      'accountName', 'avatar', 'credential', 'credentialUpdatedAt', 'displayName',
      'followers', 'isActive', 'platform', 'platformUid',
    ].sort(), `桌面端上行键集漂移：${JSON.stringify(Object.keys(row).sort())}`)
    assert.equal(harness.repositoryCalls.length, 1, '前置：这一条确实进了加密与落库分支')
    const stored = harness.repositoryCalls[0].items[0]
    assert.equal(harness.broadcasts.some((b) => b.outcome === 'updated'), true,
      `服务端裁决没回到桌面端：${JSON.stringify(harness.broadcasts)}`)
    assert.ok(stored.credentialDigest, '服务端必须自己算出摘要')
  })

  await t.test('服务端绝不受客户端递来的信封/摘要/结论（收紧面逐个反证）', async () => {
    const harness = createHarness()
    const base = {
      platform: 'douyin',
      platformUid: 'uid-9',
      displayName: '数字生命丘丘',
      credential: localCredential('x'),
    }
    for (const forbidden of ['credentialEnvelope', 'credential_envelope', 'credentialDigest', 'credential_digest', 'lastReportedStatus', 'last_reported_status', 'metadataUpdatedAt', 'metadata_updated_at', 'created_at', 'userId', 'ownerSubject', 'status']) {
      const payload = { accounts: [Object.assign({}, base, { [forbidden]: 'anything' })] }
      const response = await handleCloudAccountsRequest(serverContextFor(payload))
      assert.equal(response.status, 400, `${forbidden} 必须被拒`)
      assert.equal(response.body.data.results[0].errorCode, 'ACCOUNT_FIELD_NOT_ALLOWED',
        `${forbidden} 未按未知键拒绝：${JSON.stringify(response.body)}`)
    }
  })

  await t.test('加密发生在服务端：明文本体不落库，digest 与明文一致', async () => {
    const harness = createHarness()
    await harness.service.sync('sub-1')
    const stored = harness.repositoryCalls[0].items[0]
    const plaintextCredential = harness.localCred
    assert.equal(stored.credentialDigest, credentialDigest(plaintextCredential),
      'digest 必须由服务端从明文算出（PRD §8.6）')
    assert.ok(Buffer.isBuffer(stored.credential.ciphertext) && stored.credential.ciphertext.length > 0,
      '交给 repository 的必须是已加密的信封')
    assert.equal(JSON.stringify(stored.credential).includes('v-local'), false, '密文里不得含凭证明文')
    assert.equal(JSON.stringify(stored).includes('cookies'), false, '入库对象里不得残留明文凭证结构')
  })

  await t.test('冲突后桌面端带 force 重发：两种 force 取值都必须被服务端接受', async () => {
    for (const cloudCredentialCheckValid of [true, false]) {
      const harness = createHarness({
        outcomes: { 'douyin|uid-9': 'conflict' },
        cloudCredentialCheckValid,
      })
      const result = await harness.service.sync('sub-1')
      assert.equal(result.code, 0)
      const bodies = harness.putBodies()
      assert.equal(bodies.length, 2, `裁决完必须再发一次带 force 的 PUT，实发 ${bodies.length} 次`)
      assert.equal(bodies[0].accounts[0].force, undefined, '首轮不得自带 force')
      const second = bodies[1].accounts[0]
      assert.ok(second.force === 'cloud-wins' || second.force === 'local-wins',
        `桌面端裁决后的 force 取值异常：${JSON.stringify(second.force)}`)
      // 桌面端的四分支里：云端那份实测可用 → cloud-wins；否则 → local-wins。
      assert.equal(second.force, cloudCredentialCheckValid ? 'cloud-wins' : 'local-wins',
        'force 必须与本机实测裁决的胜方一致（cloud-account-conflict.js 四分支）')
      const stored = harness.repositoryCalls[harness.repositoryCalls.length - 1].items[0]
      assert.equal(stored.force, second.force, 'force 必须原样抵达仓储层，否则服务端无从选写分支')
      assert.equal(result.data.conflicts, 1, `冲突计数必须收口：${JSON.stringify(result.data)}`)
    }
  })

  await t.test('空跑守卫：白名单缺 credential/force 时本锁就是装饰，先把它自己钉住', async () => {
    // 这条不测业务，测的是**锁本身会不会空跑**：桌面端上行的键一旦被从白名单里删掉，
    // 上面的形状用例必须红；若连 ALLOWED_ACCOUNT_FIELDS 都被改空，本锁会静默全绿——这里拦住。
    const validateModule = require('../src/cloud-accounts/validate-account')
    const aliasKey = 'credential'
    assert.ok(validateModule.ACCOUNT_FIELD_ALIASES[aliasKey], '前置：credential 必须在白名单里')
    assert.ok(validateModule.ALLOWED_ACCOUNT_FIELDS.includes('credential'),
      '前置：ALLOWED_ACCOUNT_FIELDS 必须包含 credential')
    assert.ok(validateModule.ALLOWED_ACCOUNT_FIELDS.includes('force'),
      '前置：ALLOWED_ACCOUNT_FIELDS 必须包含 force')
    assert.equal(validateModule.ALLOWED_ACCOUNT_FIELDS.includes('credentialEnvelope'), false,
      'credentialEnvelope 不得回到白名单')
    assert.equal(validateModule.ALLOWED_ACCOUNT_FIELDS.includes('lastReportedStatus'), false,
      'lastReportedStatus 不得回到白名单（PRD §6.1 只读快照）')
  })
})

/** 供收紧面用例复用的一次性服务端上下文（与夹具同一条依赖装配）。 */
function serverContextFor(payload) {
  return {
    method: 'PUT',
    url: CLOUD_ACCOUNTS_PREFIX,
    req: { method: 'PUT', url: CLOUD_ACCOUNTS_PREFIX, headers: {} },
    auth: AUTH,
    repository: {
      async listDigest() { return { total: 0, byPlatform: [], tombstones: 0, updatedAt: null } },
      async upsertMany(userId, items) {
        return { results: items.map((item) => ({ platform: item.platform, platformUid: item.platformUid, outcome: 'created' })) }
      },
    },
    crypto: createEnvelopeCrypto({ kms: createLocalKms({ key: KMS_KEY }) }),
    bodyParser: async () => payload,
    now: () => Date.parse('2026-09-27T08:00:00.000Z'),
  }
}

test('跨包契约锁：服务端响应形态按 PRD 钉住，并如实记录桌面端的读取口径', async (t) => {
  await t.test('PUT 成功出线 = { code: 0, data: { results: [...] } }', async () => {
    const payload = {
      accounts: [{
        platform: 'douyin',
        platformUid: 'uid-9',
        displayName: '数字生命丘丘',
        credential: localCredential('y'),
      }],
    }
    const response = await handleCloudAccountsRequest(serverContextFor(payload))
    assert.equal(response.status, 200, JSON.stringify(response.body))
    assert.deepStrictEqual(Object.keys(response.body).sort(), ['code', 'data'])
    assert.deepStrictEqual(Object.keys(response.body.data), ['results'])
    assert.deepStrictEqual(response.body.data.results, [
      { platform: 'douyin', platformUid: 'uid-9', outcome: 'created' },
    ])
  })

  await t.test('桌面端读的是 data 内层：把裂口写成断言而不是留给下一次生产事故', async () => {
    // 桌面端 `sync()` 读 `cloud.total` / `put.results` / `got.credentials`（内层），
    // 而真实 `member-api-service.request()` 返回整个 JSON body（外层带 code/data）。
    // 本条只**记录**这个差异存在（两侧读取路径都能被源码证明），不在服务端单方面改外壳：
    // PRD §7.1–§7.4 定的是带壳形态，改壳属另一件事，需 PRD 与两侧一起动。
    const syncSource = fs.readFileSync(desktopServiceFile('cloud-account-sync.js'), 'utf8')
    assert.ok(syncSource.includes('put.results'), '桌面端读取内层 results 的形态变了，请同步本锁与 PRD §7.2')
    assert.ok(syncSource.includes('cloud.total'), '桌面端读取内层 total 的形态变了，请同步本锁与 PRD §7.1')
    const memberSource = fs.readFileSync(desktopServiceFile('identity/member-api-service.js'), 'utf8')
    assert.ok(memberSource.includes('return response.json()'),
      '会员接口客户端如果把外壳剥掉（变成与桌面端读取口径一致），请同步本锁并删除上面两条记录性断言')
  })

  await t.test('逐条 errorCode 必须如实透传（含 conflict 行），驱动原文一律折叠', async () => {
    // G：冲突裁决的「检测超时」与「检测抛错」只有本机分得清，服务端不发明结论；
    // 服务端的责任是**不要把上游给的码吃掉或改写成兜底码**，否则桌面端的日志就只剩一个原因。
    const repository = {
      async listDigest() { return { total: 0, byPlatform: [], tombstones: 0, updatedAt: null } },
      async upsertMany() {
        return {
          results: [
            { platform: 'douyin', platformUid: 'uid-1', outcome: 'conflict', credentialFreshness: 'local', errorCode: 'CONFLICT_PROBE_TIMEOUT' },
            { platform: 'douyin', platformUid: 'uid-2', outcome: 'conflict', errorCode: 'CONFLICT_PROBE_ERROR' },
            { platform: 'douyin', platformUid: 'uid-3', outcome: 'updated' },
            { platform: 'douyin', platformUid: 'uid-4', outcome: 'rejected', errorCode: 'password=hunter driver text' },
          ],
        }
      },
    }
    const payload = {
      accounts: ['uid-1', 'uid-2', 'uid-3', 'uid-4'].map((uid) => ({
        platform: 'douyin',
        platformUid: uid,
        displayName: '数字生命丘丘',
        credential: localCredential(uid),
      })),
    }
    const response = await handleCloudAccountsRequest(Object.assign(serverContextFor(payload), { repository }))
    const rows = response.body.data.results
    assert.equal(rows[0].errorCode, 'CONFLICT_PROBE_TIMEOUT', `冲突行的超时码被吃掉：${JSON.stringify(rows[0])}`)
    assert.equal(rows[0].credentialFreshness, 'local', '如实回传的新鲜度不得被兜底成 cloud')
    assert.equal(rows[1].errorCode, 'CONFLICT_PROBE_ERROR', `冲突行的抛错码被吃掉：${JSON.stringify(rows[1])}`)
    assert.equal(rows[1].credentialFreshness, 'cloud', '上游没给新鲜度时保守按 cloud')
    assert.equal(rows[2].errorCode, undefined, '成功行不得凭空长出一个 errorCode')
    assert.equal(rows[3].errorCode, 'ACCOUNT_WRITE_FAILED', '非语义码必须经 safeErrorCode 折叠，不外泄驱动原文')
    assert.equal(JSON.stringify(response.body).includes('password=hunter'), false, '驱动原文不得出现在响应里')
    assert.equal(response.status, 400, '存在 rejected 时整批仍按 §7.2 报 400')
  })
})
    const harness = createHarness({ outcomes: { 'douyin|uid-9': 'conflict' } })
    await harness.service.sync('sub-1')
    const conflictPut = harness.requests.find((r) => r.method === 'PUT')
    assert.ok(conflictPut, '前置：桌面端确实发过 PUT')
    const direct = await handleCloudAccountsRequest(serverContextFor({
      accounts: [{
        platform: 'douyin',
        platformUid: 'uid-9',
        displayName: '数字生命丘丘',
        credential: localCredential('z'),
      }],
    }))
    assert.equal(direct.status, 200, JSON.stringify(direct.body))
    // 仓储报 conflict 时 handlers 必须补齐 credentialFreshness，缺席会让桌面端默认按本机较新
    const withConflict = {
      async listDigest() { return { total: 0, byPlatform: [], tombstones: 0, updatedAt: null } },
      async upsertMany() {
        return { results: [{ platform: 'douyin', platformUid: 'uid-9', outcome: 'conflict' }] }
      },
    }
    const missingFreshness = await handleCloudAccountsRequest(Object.assign(
      serverContextFor({ accounts: [{ platform: 'douyin', platformUid: 'uid-9', displayName: '数字生命丘丘', credential: localCredential('w') }] }),
      { repository: withConflict },
    ))
    assert.equal(missingFreshness.status, 200)
    assert.deepStrictEqual(missingFreshness.body.data.results, [
      { platform: 'douyin', platformUid: 'uid-9', outcome: 'conflict', credentialFreshness: 'cloud' },
    ], 'conflict 缺席 credentialFreshness 时必须保守按 cloud 回传')
  })
})
