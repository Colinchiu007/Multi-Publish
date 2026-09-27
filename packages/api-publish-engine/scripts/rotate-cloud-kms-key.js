#!/usr/bin/env node
'use strict'
/**
 * rotate-cloud-kms-key.js — 账号云镜像主密钥轮转的运维入口（ADR-0007、OPS §5.1）。
 *
 * 做的事只有一件：**追加**一把新主密钥并把 active 指针移过去。从不删除旧密钥 ——
 * 旧信封的 `encryptedDataKey` 里登记着它当初用的 key id，删掉那把 key 就等于
 * 把那些凭证永久销毁（凭证不可恢复，用户只能全部重新扫码）。
 *
 * 用法：
 *   node packages/api-publish-engine/scripts/rotate-cloud-kms-key.js \
 *     --ring /var/lib/mulpub/cloud-kms-keyring.json --key-id 2026-10 [--dry-run]
 *
 * 为什么把新 key id 交给运维而不是自动按日期生成：轮转必须是一次**有名字的事件**，
 * 出问题时能回答"这批信封是哪一次轮转之前写的"。
 *
 * 生效时机（容易被误判）：服务端的 KMS 实例在首次使用时构造并**永久缓存**
 * （`src/auth/publish-api-cloud-accounts.js` 的 `_cloudAccounts()`），所以轮转之后正在跑的
 * 那份进程仍会用旧 active 继续封装，新密钥要等重启才生效。旧信封任何时候都解得开
 * （旧密钥不删），所以这不是数据风险，但"轮转完就以为换完了"是运维误判。
 *
 * 失败一律非零退出且不改动原环（写盘走原子替换，见 src/atomic-rename.js）。
 */
const fs = require('fs')
const path = require('path')

const {
  rotateKeyring, readKeyringFile, assertNewKeyIdUsable, KEYRING_ENV,
} = require('../src/cloud-accounts/keyring-kms')

/**
 * 取选项值：下一个 token 缺失或以 `--` 开头一律报错。
 * 这条校验存在的理由是一个具体的误用形态：`--key-id --dry-run` 会被"顺手取下一个参数"的
 * 实现读成 `keyId='--dry-run'` 且 `dryRun=false` —— 运维**本想演练**，结果执行了一次真实轮转。
 * 演练与真跑之间的差别必须可预测，所以宁可报错也不猜。
 */
function takeValue (argv, index, flag) {
  const next = argv[index + 1]
  if (next === undefined || next.startsWith('--')) {
    throw new Error(`${flag} 缺少值（拿到 ${JSON.stringify(next)}）；用法见文件头`)
  }
  return next
}

function parseArgs (argv) {
  const out = { dryRun: false }
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i]
    if (token === '--dry-run') { out.dryRun = true; continue }
    if (token === '--ring') { out.ring = takeValue(argv, i, '--ring'); i += 1; continue }
    if (token === '--key-id') { out.keyId = takeValue(argv, i, '--key-id'); i += 1; continue }
    throw new Error(`未知参数：${token}（用法见文件头）`)
  }
  return out
}

async function main (argv = process.argv.slice(2), env = process.env) {
  const args = parseArgs(argv)
  const ringPath = args.ring || String(env[KEYRING_ENV] || '').trim()
  if (!ringPath) throw new Error(`必须给出 --ring 或环境变量 ${KEYRING_ENV}`)
  if (!args.keyId) throw new Error('必须给出 --key-id（轮转是一次有名字的事件，不自动按日期生成）')
  const absolute = path.resolve(ringPath)
  if (!fs.existsSync(absolute)) throw new Error(`密钥环不存在：${absolute}（不得凭空造一份，先按 OPS §5.1 初始化）`)

  const before = readKeyringFile(absolute)
  if (args.dryRun) {
    // 演练与真跑共用同一把校验口径（别在 CLI 里重抄一遍），但一个字节都不写
    assertNewKeyIdUsable(args.keyId, before.keys)
    console.log(JSON.stringify({
      dryRun: true,
      before: { activeKeyId: before.activeKeyId, keyIds: Object.keys(before.keys).sort() },
      wouldWrite: { activeKeyId: args.keyId, keyIds: [...Object.keys(before.keys), args.keyId].sort() },
      note: '演练不写盘；真跑后正在运行的服务仍会用旧 active 继续封装，需重启才切换',
    }))
    return 0
  }

  const next = await rotateKeyring({ filePath: absolute, newKeyId: args.keyId })
  console.log(JSON.stringify({
    rotated: true,
    activeKeyId: next.activeKeyId,
    keyIds: next.keyIds,
    ring: absolute,
    nextSteps: [
      '重启业务 API 进程，新写入才会用新 active 封装',
      'OPS §5.1 第 5 步验收：取一份轮转前镜像的账号真跑一次 sync，确认仍能解出凭证',
    ],
  }))
  return 0
}

if (require.main === module) {
  main().then(
    (code) => { process.exitCode = code },
    (error) => {
      // 只报错误码与消息：底层消息可能含路径，绝不回显任何密钥材料
      console.error(`[rotate-cloud-kms-key] ${error && error.code ? error.code + ': ' : ''}${error && error.message ? error.message : String(error)}`)
      process.exitCode = 1
    },
  )
}

module.exports = { main, parseArgs }
