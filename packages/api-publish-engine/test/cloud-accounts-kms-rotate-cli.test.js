'use strict'
/**
 * 轮转 CLI（rotate-cloud-kms-key.js）的回归测试
 *
 * 运维入口的失败模式很朴素：参数写错、路径写错、把演练当无副作用。这几件事都必须在生产机器
 * 之前被发现，因为轮转的目标就是"别把凭证搞丢"。
 *
 * 三条最要紧的：
 *  - `--dry-run` **一个字节都不写**，且校验强度与真跑一致（共用 `assertNewKeyIdUsable`）。
 *    若演练也改环，"演练一次、正式再演练一次"就会把 active 悄悄移两次。
 *  - 选项值不得吞掉下一个 flag（评审 C2）：`--key-id --dry-run` 若被读成
 *    `keyId='--dry-run'` + `dryRun=false`，运维本想演练却执行了真实轮转。
 *  - 输出里绝不出现密钥材料（`rotateKeyring` 现在只返回 `{activeKeyId, keyIds}`，
 *    但这条断言把"返回值形状"也一起锁住，防止有人改回返回整份 ring）。
 */
const fs = require('fs')
const os = require('os')
const path = require('path')
const crypto = require('crypto')
const { test } = require('node:test')
const assert = require('node:assert')

const { main, parseArgs } = require('../scripts/rotate-cloud-kms-key')
const { writeKeyringFile, readKeyringFile } = require('../src/cloud-accounts/keyring-kms')

const HEX = crypto.randomBytes(32).toString('hex')

function tempRing (t, ring) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `mp-kms-cli-${process.pid}-`))
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }))
  const filePath = path.join(dir, 'keyring.json')
  if (ring) writeKeyringFile(filePath, ring)
  return { dir, filePath }
}

const baseRing = () => ({ version: 1, activeKeyId: 'k1', keys: { k1: HEX } })

/**
 * 捕获 stdout。这里替换的是 `console.log`（CLI 唯一的输出点），不是 `process.stdout.write`——
 * 后者是测试 runner 自己在用的通道，整体接管会依赖"runner 串行执行、被测函数同步返回"这类
 * 隐式前提（评审 W3）。异步的 main() 由调用方 await，因此也不存在"内容还没写就断言"的窗口。
 */
async function capture (fn) {
  const chunks = []
  const real = console.log
  console.log = (...args) => { chunks.push(args.map(String).join(' ')) }
  try {
    const code = await fn()
    return { code, out: chunks.join('\n') }
  } finally {
    console.log = real
  }
}

test('parseArgs：只认 --ring / --key-id / --dry-run，未知参数当场报错而不是静默忽略', () => {
  assert.deepEqual(parseArgs(['--ring', '/tmp/a.json', '--key-id', 'k2']), { ring: '/tmp/a.json', keyId: 'k2', dryRun: false })
  assert.deepEqual(parseArgs(['--ring', '/tmp/a.json', '--key-id', 'k2', '--dry-run']), { ring: '/tmp/a.json', keyId: 'k2', dryRun: true })
  assert.throws(() => parseArgs(['--force']), /未知参数/)
})

test('parseArgs：选项值缺失或被下一个 flag 顶替一律报错（评审 C2：误用会让演练变成真实轮转）', () => {
  assert.throws(() => parseArgs(['--ring', 'ring.json', '--key-id', '--dry-run']), /--key-id 缺少值/)
  assert.throws(() => parseArgs(['--ring', '--key-id', 'k2']), /--ring 缺少值/)
  assert.throws(() => parseArgs(['--key-id']), /--key-id 缺少值/)
  assert.throws(() => parseArgs(['--ring']), /--ring 缺少值/)
})

test('--dry-run：报出会写成什么，但一个字节都不写', async (t) => {
  const { filePath } = tempRing(t, baseRing())
  const before = fs.readFileSync(filePath, 'utf8')

  const res = await capture(() => main(['--ring', filePath, '--key-id', 'k2', '--dry-run']))
  assert.strictEqual(res.code, 0)
  const printed = JSON.parse(res.out.trim())
  assert.strictEqual(printed.dryRun, true)
  assert.strictEqual(printed.wouldWrite.activeKeyId, 'k2')
  assert.deepEqual(printed.wouldWrite.keyIds, ['k1', 'k2'])
  assert.strictEqual(fs.readFileSync(filePath, 'utf8'), before, '--dry-run 不得改环')
  assert.ok(!res.out.includes(HEX), 'CLI 输出了主密钥')
})

test('--dry-run 的校验强度与真跑一致：撞名同样报错，且不写盘', async (t) => {
  const { filePath } = tempRing(t, baseRing())
  const before = fs.readFileSync(filePath, 'utf8')
  await assert.rejects(() => main(['--ring', filePath, '--key-id', 'k1', '--dry-run']), /KEY_ID_EXISTS|KMS_CONFIG_INVALID/)
  assert.strictEqual(fs.readFileSync(filePath, 'utf8'), before)
})

test('真跑：active 移到新 id，旧密钥仍在环里（删旧密钥 = 销毁数据）', async (t) => {
  const { filePath } = tempRing(t, baseRing())
  const res = await capture(() => main(['--ring', filePath, '--key-id', '2026-10']))
  assert.strictEqual(res.code, 0)
  assert.ok(!res.out.includes(HEX), 'CLI 输出了主密钥')

  const ring = readKeyringFile(filePath)
  assert.strictEqual(ring.activeKeyId, '2026-10')
  assert.deepEqual(Object.keys(ring.keys).sort(), ['2026-10', 'k1'])
  assert.ok(/重启/.test(res.out), '输出必须提示"要重启才切换"，否则运维以为换完了')
})

test('缺参数 / 环不存在 / 撞名：非零收口且不改动原环', async (t) => {
  const { dir, filePath } = tempRing(t, baseRing())
  const before = fs.readFileSync(filePath, 'utf8')

  await assert.rejects(() => main(['--ring', filePath]), /--key-id/)
  await assert.rejects(() => main(['--key-id', 'k9'], {}), /必须给出 --ring/)
  await assert.rejects(() => main(['--ring', path.join(dir, 'ghost.json'), '--key-id', 'k9']), /不存在/)
  await assert.rejects(() => main(['--ring', filePath, '--key-id', 'k1']), /KEY_ID_EXISTS/)
  assert.strictEqual(fs.readFileSync(filePath, 'utf8'), before)
})

test('环境变量给环路径时不用重复传 --ring（与服务端读取的是同一个变量）', async (t) => {
  const { filePath } = tempRing(t, baseRing())
  const res = await capture(() => main(['--key-id', 'k2'], { MP_CLOUD_KMS_KEYRING: filePath }))
  assert.strictEqual(res.code, 0)
  assert.strictEqual(readKeyringFile(filePath).activeKeyId, 'k2')
})
