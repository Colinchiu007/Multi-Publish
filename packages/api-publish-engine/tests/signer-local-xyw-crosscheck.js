'use strict'
/**
 * 交叉校验：JS 实现的 XYW 签名是否与 Python 参考实现（Cloxl/xhshow
 * build_xyw_payload_hex）逐字节等价。
 *
 * 本文件刻意**不复用** signer-local 的任何内部常量与函数，而是照 Python
 * 源码独立复算一遍再比对 —— 同一处错误不会在两边同时复现。
 *
 * Python 侧流程（core/xyw_crypto.py）：
 *   x1 = md5("url=" + full_uri)
 *   message = f"x1={x1};x2={env};x3={a1};x4={ts};"
 *   plaintext = _pkcs7_pad(base64.b64encode(message))   ← 先 base64 再填充
 *   cipher = AES-128-CBC(key=XYW_AES_KEY, iv=XYW_AES_IV)
 *   return cipher.encrypt(plaintext).hex()
 */
const crypto = require('crypto')
const assert = require('assert')
const { buildXywSignature } = require('../src/signer-local')

const KEY = '7cc4adla5ay0701v'
const IV = '4uzjr7mbsibcaldp'
const ENV = '0|0|0|1|0|0|1|0|0|0|1|0|0|0|0|1|0|0|1'
const fullUri = 'https://edith.xiaohongshu.com/web_api/sns/v2/note'
const a1 = '199ebeb1b46cum7cffi8zj6bxe1man1so5fb8wb3630000412513'
const ts = 1700000000000

// ── 独立复算（严格照 Python 流程）──
const x1 = crypto.createHash('md5').update(`url=${fullUri}`, 'utf8').digest('hex')
const message = `x1=${x1};x2=${ENV};x3=${a1};x4=${ts};`
const encoded = Buffer.from(message, 'utf8').toString('base64')      // step 1: base64
const encBuf = Buffer.from(encoded, 'utf8')
const padLen = 16 - (encBuf.length % 16)                            // step 2: PKCS#7
const plaintext = Buffer.concat([encBuf, Buffer.alloc(padLen, padLen)])
const cipher = crypto.createCipheriv('aes-128-cbc', Buffer.from(KEY, 'utf8'), Buffer.from(IV, 'utf8'))
cipher.setAutoPadding(false)
const expectedHex = Buffer.concat([cipher.update(plaintext), cipher.final()]).toString('hex')

const actual = buildXywSignature({ fullUri, a1Value: a1, timestampMs: ts })
const actualHex = actual.replace('XYW_', '')

assert.strictEqual(actual, 'XYW_' + expectedHex, 'XYW signature must equal the Python reference byte-for-byte')
assert.ok(actualHex.length > 0 && actualHex.length % 2 === 0, 'hex length must be even')
assert.strictEqual(actualHex.length / 2 % 16, 0, 'ciphertext must be a whole number of 16-byte blocks')

console.log('OK cross-check passed (JS output == Python reference output)')
console.log('  fullUri   =', fullUri)
console.log('  X-s       =', actual.slice(0, 56) + '...')
console.log('  x1(md5)   =', x1)
console.log('  blocks    =', actualHex.length / 2 / 16)