import { describe, it, expect } from 'vitest'

/**
 * 小红书 XYW 签名契约测试
 *
 * 背景：旧 signer-local.js 的 getXiaohongshuSign 是 md5(ts + "MirAR" + body)
 * 的占位式，与平台真实算法无关，任何走该签名的发布都必然被拒；
 * 且 adapters/xiaohongshu.js 把签名对象塞进 query，会序列化成 sign=[object Object]。
 *
 * 算法来源（Cloxl/xhshow，MIT；Go 版 tamnd/xiaohongshu-cli 独立复现同一常量）：
 *   X-s = "XYW_" + hex(AES-128-CBC(
 *            base64("x1={md5('url=' + fullUri)};x2={envFlags};"
 *                   "x3={a1};x4={timestampMs};"),
 *            key = 7cc4adla5ay0701v, iv = 4uzjr7mbsibcaldp))
 *
 * 关键取舍：只实现 XYW_，不实现 XYS_ —— 参考资料显示老 XYS_ 已被小红书
 * 数据接口以 HTTP 406 拒绝，只有 XYW_ 可用。
 */
import {
  buildXywSignature,
  buildXiaohongshuSignHeaders,
  isXywSignature,
} from '../src/signer-local'

const A1 = '199ebeb1b46cum7cffi8zj6bxe1man1so5fb8wb3630000412513'
const TS = 1700000000000

describe('xiaohongshu XYW signature', () => {
  it('X-s must use the XYW_ prefix (legacy XYS_ is rejected with HTTP 406)', () => {
    const sig = buildXywSignature({
      fullUri: 'https://edith.xiaohongshu.com/api/sns/web/v1/feed',
      a1Value: A1,
      timestampMs: TS,
    })
    expect(typeof sig).toBe('string')
    expect(sig.startsWith('XYW_')).toBe(true)
  })

  it('signature is deterministic: identical input yields identical output', () => {
    const args = {
      fullUri: 'https://edith.xiaohongshu.com/web_api/sns/v2/note',
      a1Value: A1,
      timestampMs: TS,
    }
    expect(buildXywSignature(args)).toBe(buildXywSignature(args))
  })

  it('every input change must alter the signature (must not degenerate to a constant)', () => {
    const base = {
      fullUri: 'https://edith.xiaohongshu.com/web_api/sns/v2/note',
      a1Value: A1,
      timestampMs: TS,
    }
    const s0 = buildXywSignature(base)
    expect(buildXywSignature({ ...base, fullUri: 'https://edith.xiaohongshu.com/api/sns/web/v1/feed' })).not.toBe(s0)
    expect(buildXywSignature({ ...base, a1Value: A1 + 'x' })).not.toBe(s0)
    expect(buildXywSignature({ ...base, timestampMs: TS + 1 })).not.toBe(s0)
  })

  it('missing a1 must fail closed (a1 is a required signature input)', () => {
    expect(() => buildXywSignature({
      fullUri: 'https://edith.xiaohongshu.com/web_api/sns/v2/note',
      a1Value: '',
      timestampMs: TS,
    })).toThrow(/a1/i)
  })

  it('isXywSignature recognises the new format and rejects the legacy one', () => {
    expect(isXywSignature('XYW_abcdef')).toBe(true)
    expect(isXywSignature('XYS_abcdef')).toBe(false)
    expect(isXywSignature('nonsense')).toBe(false)
  })

  it('buildXiaohongshuSignHeaders returns every header the publish chain needs', () => {
    const headers = buildXiaohongshuSignHeaders({
      fullUri: 'https://edith.xiaohongshu.com/web_api/sns/v2/note',
      cookies: { a1: A1, web_session: 'sess-value' },
      timestampMs: TS,
    })
    expect(headers['x-s'].startsWith('XYW_')).toBe(true)
    expect(headers['x-t']).toBe(String(TS))
    expect(headers['x-s-common']).toBeTruthy()
    expect(headers['x-b3-traceid']).toMatch(/^[0-9a-f]{16}$/)
    expect(headers['x-xray-traceid']).toMatch(/^[0-9a-f]{32}$/)
  })

  it('headers must accept the raw cookie-string form too', () => {
    const headers = buildXiaohongshuSignHeaders({
      fullUri: 'https://edith.xiaohongshu.com/web_api/sns/v2/note',
      cookies: `a1=${A1}; web_session=sess-value`,
      timestampMs: TS,
    })
    expect(headers['x-s'].startsWith('XYW_')).toBe(true)
  })
})