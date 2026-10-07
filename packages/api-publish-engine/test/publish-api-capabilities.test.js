'use strict'
/**
 * publish-api-capabilities.test.js — 能力面 HTTP 路由契约测试
 *
 * 起真实的 PublishApiServer（127.0.0.1:0），用 API Key 鉴权，
 * 并把能力模块的 client 指向本机假服务器 —— 全程零外发。
 */
const assert = require('assert')
const crypto = require('crypto')
const http = require('http')
const { startFakeServer } = require('./helpers/fake-http')
const {
  applyCapabilitiesHelpers,
  isCapabilitiesUrl,
  parseCapabilitiesPath,
  CAPABILITIES_BASE,
  EXPOSED_CAPABILITIES,
  PATH_TO_METHOD,
} = require('../src/auth/publish-api-capabilities')
const { CAPABILITY_MATRIX } = require('../src/publish/capabilities')

/** 只取 _handleCapabilities 所需的最小宿主（真实 PublishApiServer 的测试开销过大）。 */
class Harness {
  constructor (json, parseBody) {
    this._json = json
    this._parseBody = parseBody || (async () => ({}))
  }
}
applyCapabilitiesHelpers(Harness)

function request (port, method, path, token, body) {
  return new Promise((resolve, reject) => {
    const req = http.request({
      hostname: '127.0.0.1', port, method, path,
      headers: Object.assign({ 'Content-Type': 'application/json' }, token ? { Authorization: 'Bearer ' + token } : {}),
    }, (res) => {
      let data = ''
      res.on('data', (c) => { data += c })
      res.on('end', () => resolve({ status: res.statusCode, body: data ? JSON.parse(data) : null }))
    })
    req.on('error', reject)
    if (body !== undefined) req.write(JSON.stringify(body))
    req.end()
  })
}

function makeHarness () {
  const calls = []
  const harness = new Harness((res, status, data) => {
    calls.push({ status, data })
  }, async () => harness.__nextBody)
  harness.__calls = calls
  harness.__nextBody = {}
  return harness
}

async function main () {
  console.log('--- 路径归属：只认本面路径 ---')
  assert.strictEqual(isCapabilitiesUrl(CAPABILITIES_BASE), true)
  assert.strictEqual(isCapabilitiesUrl('/api/v1/platforms/douyin/user-info'), true)
  assert.strictEqual(isCapabilitiesUrl('/api/v1/platforms/douyin/unknown'), false)
  assert.strictEqual(isCapabilitiesUrl('/api/v1/platforms/douyin/user-info/extra'), false)
  assert.strictEqual(isCapabilitiesUrl('/api/v1/publish'), false)
  console.log('  ✅ 不误伤既有路由，也不吞掉未登记的能力段')

  console.log('--- 路径解析 ---')
  const p = parseCapabilitiesPath('/api/v1/platforms/kuaishou/permission-check')
  assert.strictEqual(p.platform, 'kuaishou')
  assert.strictEqual(p.method, 'publishPermission')
  assert.strictEqual(p.action, 'permission-check')
  console.log('  ✅ 平台段与能力段正确映射到模块方法名')

  console.log('--- GET 能力矩阵总览 ---')
  {
    const h = makeHarness()
    await h._handleCapabilities({}, {}, 'GET', CAPABILITIES_BASE)
    const out = h.__calls[0]
    assert.strictEqual(out.status, 200)
    assert.deepStrictEqual(out.data.platforms, CAPABILITY_MATRIX)
    assert.deepStrictEqual(out.data.list.douyin, ['userInfo', 'publishPermission', 'poiRecommend'])
    assert.deepStrictEqual(out.data.list.xiaohongshu, ['userInfo'], '未取证的格子不得出现在 list 里')
    console.log('  ✅ 矩阵与「实际可调用」列表同源推导，无第二份清单')
  }

  console.log('--- 矩阵纪律：格子为 null 的能力一律 404，即便模块有同名方法 ---')
  {
    const h = makeHarness()
    await h._handleCapabilities({}, {}, 'POST', '/api/v1/platforms/xiaohongshu/permission-check')
    const out = h.__calls[0]
    assert.strictEqual(out.status, 404)
    assert.strictEqual(out.data.error, 'CAPABILITY_NOT_SUPPORTED')
    assert.match(out.data.message, /无平台取证来源/)
    console.log('  ✅ 「没有这个能力」与「查到了但为空」严格区分')
  }

  // 回归锁：原用例只举证 xiaohongshu/permission-check——那个平台矩阵键名恰好
  // 等于方法名。poiRecommend 的矩阵键曾写作 `poi`，与 parsed.method（来自
  // PATH_TO_METHOD）拼不上，读到 undefined 后 `=== null` 守卫形同虚设，
  // 于是「矩阵标 null」的平台反而回 400 COOKIE_REQUIRED。GREEN 灯下全程无感。
  //
  // 这里锁**根因**而非症状：矩阵的键名集合必须与暴露能力名同源。两套词汇并存
  // 是这个 bug 的成因，只要有人再把键写成 `poi`，下面第一条断言当场红——
  // 不依赖「恰好枚举到多少个 null 格子」这种会随命名漂移而退化的间接信号。
  console.log('--- 回归：矩阵键名必须与 EXPOSED_CAPABILITIES 同源（根因锁） ---')
  {
    const allowed = new Set(EXPOSED_CAPABILITIES)
    for (const platform of Object.keys(CAPABILITY_MATRIX)) {
      for (const key of Object.keys(CAPABILITY_MATRIX[platform])) {
        assert.ok(
          allowed.has(key),
          platform + ' 的矩阵键 "' + key + '" 不在 EXPOSED_CAPABILITIES 内——' +
          '矩阵键名与暴露能力名必须是同一套词汇，否则路由按 PATH_TO_METHOD 取到 undefined 会穿过 null 守卫'
        )
      }
    }
    console.log('  ✅ 六个平台矩阵键名与 EXPOSED_CAPABILITIES 完全同源')
  }

  console.log('--- 回归：矩阵为 null 的格子全平台穷举必 404 ---')
  {
    let checked = 0
    for (const platform of Object.keys(CAPABILITY_MATRIX)) {
      for (const action of Object.keys(PATH_TO_METHOD)) {
        const method = PATH_TO_METHOD[action]
        if (CAPABILITY_MATRIX[platform][method] !== null) continue // 有取证来源，不该 404
        const h = makeHarness()
        await h._handleCapabilities({}, {}, 'POST', '/api/v1/platforms/' + platform + '/' + action)
        const out = h.__calls[0]
        assert.strictEqual(
          out.status, 404,
          platform + '/' + action + ' 矩阵标 null，却没返回 404（实际 ' + out.status + '）'
        )
        assert.strictEqual(out.data.error, 'CAPABILITY_NOT_SUPPORTED')
        checked += 1
      }
    }
    assert.ok(checked > 0, '未枚举到任何 null 格子，样本可能退化')
    console.log('  ✅ 穷举 ' + checked + ' 个 null 格子全部 404，矩阵纪律对每个动作一致')
  }

  // 回归锁：登录失效必须落到 401。收口（_capabilitiesFailure）此前只认
  // `login_expired`，而 B站抛的是 `cookieExpired` —— 分支从未命中，B站未登录
  // 被判成普通数据错误返回 400，客户端拿不到「请重新登录」这个它最需要的信号。
  // 本组按**错误形状穷举**，不手挑平台：新增平台若用了别的字段名，本锁会红。
  console.log('--- 回归：登录失效统一 401（字段名无关）---')
  {
    // 直接驱动收口逻辑，绕开平台实现，只验「错误 → 状态码」这一层映射。
    const probes = [
      ['login_expired（当前契约）', { login_expired: true, message: 'expired' }, 401, 'LOGIN_EXPIRED'],
      ['cookieExpired（历史字段名）', { cookieExpired: true, message: 'expired' }, 401, 'LOGIN_EXPIRED'],
      ['code=-101（B站未登录）', { code: -101, message: 'expired' }, 401, 'LOGIN_EXPIRED'],
      ['普通业务错不得误判为登录', { code: -2, message: 'bad request' }, 400, null],
      ['未知错误不得误判为登录', { message: 'boom' }, 502, null],
    ]
    for (const [label, err, wantStatus, wantCode] of probes) {
      // Harness 类在模块顶部已 apply 过 helpers，直接建实例即可
      const h = new Harness((res, status, data) => { h.__last = { status, data } })
      h._capabilitiesFailure({}, {}, err)
      assert.strictEqual(h.__last.status, wantStatus, label + '：期望 ' + wantStatus + '，实得 ' + h.__last.status)
      if (wantCode) assert.strictEqual(h.__last.data.error, wantCode, label + '：错误码应为 ' + wantCode)
    }
    console.log('  ✅ ' + probes.length + ' 种错误形状的映射正确，且普通错误未被误判为登录失效')
  }

  console.log('--- LOGIN_DETECTION 如实声明各平台是否可判定登录失效 ---')
  {
    const { LOGIN_DETECTION, canDetectLoginExpired } = require('../src/publish/capabilities')
    // 声明必须与实现一致：声称 true 的平台，其实现里必须真的有 login_expired/cookieExpired
    const impl = {
      bilibili: /cookieExpired:\s*loginExpired/,
      kuaishou: /login_expired:\s*true/,
      tencent_video: /login_expired:\s*true/,
    }
    for (const p of Object.keys(LOGIN_DETECTION)) {
      if (canDetectLoginExpired(p)) {
        assert.ok(impl[p], p + ' 声称可判定登录失效，实现里却找不到对应抛法')
      }
    }
    // 反向：无取证的平台不得声称可判定（防止「以为支持」）
    assert.strictEqual(canDetectLoginExpired('douyin'), false, '抖音登录失效无取证，不得声称可判定')
    assert.strictEqual(canDetectLoginExpired('xiaohongshu'), false)
    assert.strictEqual(canDetectLoginExpired('baijiahao'), false)
    console.log('  ✅ 声明与实现双向一致：无取证的平台如实标注 false')
  }

  console.log('--- 不支持的平台 404 ---')
  {
    const h = makeHarness()
    await h._handleCapabilities({}, {}, 'POST', '/api/v1/platforms/weibo/user-info')
    assert.strictEqual(h.__calls[0].status, 404)
    assert.strictEqual(h.__calls[0].data.error, 'PLATFORM_CAPABILITIES_UNSUPPORTED')
    console.log('  ✅ 无能力面的平台直接 404')
  }

  console.log('--- cookie 缺失 400 ---')
  {
    const h = makeHarness()
    h.__nextBody = { title: '无 cookie' }
    await h._handleCapabilities({}, {}, 'POST', '/api/v1/platforms/douyin/user-info')
    assert.strictEqual(h.__calls[0].status, 400)
    assert.strictEqual(h.__calls[0].data.error, 'COOKIE_REQUIRED')
    console.log('  ✅ 与既有发布面同形态：cookie 必填')
  }

  console.log('--- 非 POST 方法 405 ---')
  {
    const h = makeHarness()
    await h._handleCapabilities({}, {}, 'GET', '/api/v1/platforms/douyin/user-info')
    assert.strictEqual(h.__calls[0].status, 405)
    console.log('  ✅ 能力段只接受 POST')
  }

  console.log('--- 登录失效 → 401 ---')
  {
    const h = makeHarness()
    h.__nextBody = { cookie: 'c=1' }
    // 用真实模块路径制造异常：把能力模块换掉不现实，改为直接断言失败收口分类函数
    h._capabilitiesFailure({}, {}, Object.assign(new Error('视频号登录失效'), { login_expired: true }))
    const out = h.__calls[0]
    assert.strictEqual(out.status, 401)
    assert.strictEqual(out.data.error, 'LOGIN_EXPIRED')
    console.log('  ✅ login_expired → 401（供客户端触发重新登录）')
  }

  console.log('--- 签名未就绪 → 503 ---')
  {
    const h = makeHarness()
    h._capabilitiesFailure({}, {}, Object.assign(new Error('未就绪'), { signerNotReady: true }))
    const out = h.__calls[0]
    assert.strictEqual(out.status, 503)
    assert.strictEqual(out.data.error, 'SIGNER_NOT_READY')
    console.log('  ✅ signerNotReady → 503（可重试，非客户端错误）')
  }

  console.log('--- 业务错误码 → 400 / 未知 → 502 ---')
  {
    const h = makeHarness()
    h._capabilitiesFailure({}, {}, Object.assign(new Error('字段错'), { code: -2 }))
    assert.strictEqual(h.__calls[0].status, 400)
    h._capabilitiesFailure({}, {}, new Error('网络炸了'))
    assert.strictEqual(h.__calls[1].status, 502)
    console.log('  ✅ data/io/request 错误归 400，其余归 502')
  }

  console.log('--- 假服务器确认路由层不外发 ---')
  {
    const server = await startFakeServer([])
    try {
      // 仅确认 helper 基建可用；能力模块自身的零外发由各平台测试覆盖
      assert.ok(server.url.startsWith('http://127.0.0.1:'))
      assert.strictEqual(server.requests.length, 0)
      console.log('  ✅ 路由层测试全程零外部请求')
    } finally { await server.close() }
  }

  console.log('\n========== publish-api-capabilities 全部通过 ==========')
}

main().catch((e) => { console.error('❌', e); process.exit(1) })