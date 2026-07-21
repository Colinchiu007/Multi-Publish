const assert = require('assert')

async function main() {
  const { ensureBusinessUser, verifyLogtoWebhookSignature, isOwnedBySubject } = require('../src/auth/business-identity')
  let created = null
  const repository = {
    findBySubject: async (provider, subject) => provider === 'logto' && subject === 'sub-new' ? null : { id: 'user-1', auth_provider: provider, auth_subject: subject },
    create: async (record) => { created = record; return { id: 'user-new', ...record } },
    updateProfile: async (id, profile) => ({ id, ...profile }),
  }
  const user = await ensureBusinessUser(repository, { subject: 'sub-new', scopes: [] }, { name: '用户甲' })
  assert.strictEqual(user.auth_subject, 'sub-new')
  assert.strictEqual(created.auth_provider, 'logto')
  assert.strictEqual(isOwnedBySubject({ auth_subject: 'sub-new' }, { subject: 'sub-new' }), true)
  assert.strictEqual(isOwnedBySubject({ auth_subject: 'sub-other' }, { subject: 'sub-new' }), false)

  let existingAfterConflict = null
  const concurrentUser = await ensureBusinessUser({
    findBySubject: async () => existingAfterConflict,
    create: async () => {
      existingAfterConflict = { id: 'user-concurrent', auth_provider: 'logto', auth_subject: 'sub-race', status: 'active' }
      throw Object.assign(new Error('unique violation'), { code: '23505' })
    },
  }, { subject: 'sub-race' })
  assert.strictEqual(concurrentUser.id, 'user-concurrent')

  await assert.rejects(
    ensureBusinessUser({
      findBySubject: async () => ({ id: 'user-suspended', auth_subject: 'sub-suspended', status: 'suspended' }),
      create: async () => { throw new Error('不应创建已存在用户') },
    }, { subject: 'sub-suspended' }),
    (error) => error && error.code === 'BUSINESS_USER_SUSPENDED'
  )

  const payload = { event: 'User.Data.Updated', userId: 'sub-new' }
  const crypto = require('crypto')
  const signature = crypto.createHmac('sha256', 'secret').update(JSON.stringify(payload)).digest('hex')
  assert.strictEqual(verifyLogtoWebhookSignature(JSON.stringify(payload), signature, 'secret'), true)
  assert.throws(() => verifyLogtoWebhookSignature(JSON.stringify(payload), 'bad', 'secret'), /WEBHOOK_SIGNATURE_INVALID/)
  console.log('  ✅ sub 懒同步、资源归属和 Logto webhook HMAC')
}

main().catch((error) => {
  console.error(`  ❌ business identity: ${error.stack || error.message}`)
  process.exitCode = 1
})
