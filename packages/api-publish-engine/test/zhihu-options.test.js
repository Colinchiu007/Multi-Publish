const assert = require('assert')
const ZhihuAdapter = require('../src/adapters/zhihu')

async function run () {
  const adapter = new ZhihuAdapter()
  const postData = adapter.buildPostData({
    title: '标题',
    content: '正文',
    commentPermission: 'anyone',
    declare: 5,
  })

  assert.strictEqual(postData.commentPermission, 'anyone')
  assert.strictEqual(postData.declare, 5)

  const requests = []
  adapter.http = {
    post: async (url, body) => {
      requests.push({ url, body })
      if (url.includes('/drafts')) return { status: 200, data: { article_id: 'article-1' } }
      return { status: 200, data: { success: true } }
    },
  }

  const result = await adapter.publish('z_c0=secret', postData, null)
  const publishRequest = requests.at(-1)

  assert.strictEqual(result.success, true)
  assert.strictEqual(publishRequest.url, 'https://www.zhihu.com/api/v4/content/publish')
  assert.strictEqual(publishRequest.body.comment_permission, 'anyone')
  assert.deepStrictEqual(publishRequest.body.commentsPermission, { comment_permission: 'anyone' })
  assert.deepStrictEqual(publishRequest.body.creationStatement, {
    disclaimer_status: 'open',
    disclaimer_type: 'ai_creation',
  })
  const businessParams = JSON.parse(publishRequest.body.extra_info.pc_business_params)
  assert.strictEqual(businessParams.commentPermission, 'anyone')
  assert.strictEqual(businessParams.disclaimer_type, 'ai_creation')
  console.log('zhihu options: 1 passed')
}

run().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
