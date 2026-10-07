// @ts-check
/**
 * PublishMonitor — 发布后状态监控
 * 
 * 基于参考产品逆向分析的发布后状态查询（QueryStateTaskScheduler）：
 * - 发布完成后自动查询发布结果
 * - 轮询检查：草稿→已发布→审核中→已上线/驳回
 * - 失败重试 + 超时处理
 * 
 * 文件位置: apps/desktop/electron/publish-monitor.js
 */
const log = require('./logger')
const { checkBilibiliAuditStatus, BILIBILI_LIST_URL } = require('./bilibili-audit-check')

const POLL_INTERVAL = 10000 // 10秒
const MAX_RETRIES = 12 // 最大重试次数 = 2分钟
const CHECK_URLS = {
  weibo: 'https://weibo.com/ajax/statuses/mymblog',
  douyin: 'https://creator.douyin.com/aweme/v1/list/',
  // bilibili 端点已于 2026-10-05 真机只读取证纠正（旧值 api.bilibili.com/x/web-interface/archive/space
  // 是从未成立的猜测；真实容器是 member.bilibili.com/x/web/archives 的 data.arc_audits[]）。
  // 判据不在这张表里，在 bilibili-audit-check.js —— 该表项只为 parity 锁与「端点不再虚构」而存在。
  bilibili: BILIBILI_LIST_URL,
  zhihu: 'https://www.zhihu.com/api/v4/articles',
  xiaohongshu: 'https://creator.xiaohongshu.com/api/content/list',
  // kuaishou 已移除（2026-09-28 活体残余③）：其状态查询是 cp.kuaishou.com/graphql
  // 的 POST 查询，通用 GET+id 轮询协议形状错误（必然 error）；且监控 cookies 取自
  // task.article（恒空，凭证在 authData 不随任务走）。无已验证的快手状态查询
  // 端点前诚实跳过（skipped），不 12 连 error 污染发布历史。待有端点证据后
  // 以专用 POST 查询实现补回。
  toutiao: 'https://mp.toutiao.com/profile_v4/graphic/publishing',
  youtube: 'https://www.googleapis.com/youtube/v3/videos',
}

/**
 * 创建发布监控任务
 * 
 * @param {object} task - { postId, platform, accountId, cookies, callback, axios }
 *   axios 为可选的传输层注入（默认 require('axios')）—— 测试禁止真实出站（AGENTS.md QM-3），
 *   且没有它就无法在装配层（而不是服务层）驱动 B 站分桶查询的日志出口。
 * @returns {object} { taskId, stop } — stop() 取消监控
 */
function createMonitorTask (task) {
  const { postId, platform, cookies, callback, maxRetries = MAX_RETRIES, axios } = task
  const pollUrl = CHECK_URLS[platform]
  
  if (!pollUrl) {
    log.notify('PublishMonitor', 'check-url-missing', { level: 'WARN', params: { platform } })
    callback && callback({ status: 'skipped', message: '不支持的状态查询平台' })
    return { stop: () => {} }
  }
  
  let cancelled = false
  let retries = 0
  let timerId = null
  
  const poll = async () => {
    if (cancelled) return
    
    try {
      const result = await checkPublishStatus(platform, postId, cookies, pollUrl, { axios })
      
      if (cancelled) return
      
      if (result.status === 'published' || result.status === 'reviewed' || result.status === 'rejected') {
        callback && callback({ status: result.status, postId, raw: result.raw })
        return
      }
      
      if (result.status === 'failed') {
        callback && callback({ status: 'failed', postId, message: result.message })
        return
      }
      
      // still pending
      retries++
      if (retries >= maxRetries) {
        // 超时恰是最需要「一行定场」的时刻：只带 lastReason 就得让人回头翻 poll 历史行
        // 才能知道当时探到哪个桶、平台回报了什么 state（QM-6 前端轴 I2）
        log.notify('PublishMonitor', 'monitor-timeout', {
          level: 'WARN',
          params: {
            platform, postId, maxRetries, lastReason: result.reason || '',
            lastBucket: result.bucket || '', lastState: result.state ?? '', lastStateDesc: result.stateDesc || '',
            lastBucketsProbed: Array.isArray(result.bucketsProbed) ? result.bucketsProbed.join(',') : '',
          },
        })
        callback && callback({ status: 'timeout', postId, message: '状态查询超时', reason: result.reason || '' })
        return
      }
      
      // pending 无定论：把 reason 带进日志（no-cookies/nav-not-established/envelope-not-ok/state-unobserved
      // /not-in-list/in-review-bucket/in-not-pubed-bucket…），
      // 否则「会话未建立 / 风控信封 / 列表缺字段 / 稿件在审核桶里」在排障时无法区分。
      // bucket/state/primaryState/stateDesc 必须一并带出：B 站「审核中/不通过的 state 取值」
      // 在平台侧是未观测的，日志是它唯一的现场来源（服务层分桶了而日志不打＝等于没分桶）。
      // 回退口径统一用 `?? ''`：logger 只收 string/number/boolean，裸透传 undefined 会让
      // 键**整个消失**，同一事件的日志 schema 于是时有时无（QM-6 前端轴 I5）。
      // classCounts 是桶计数本身——「为什么没扇出」的现场，不记就等于留了个没人读的字段。
      log.notify('PublishMonitor', 'poll-progress', {
        level: 'INFO',
        params: {
          retries, maxRetries, platform, postId, status: result.status, reason: result.reason || '',
          bucket: result.bucket || '', state: result.state ?? '', primaryState: result.primaryState ?? '',
          stateDesc: result.stateDesc || '',
          bucketsProbed: Array.isArray(result.bucketsProbed) ? result.bucketsProbed.join(',') : '',
          classCounts: result.classCounts ? JSON.stringify(result.classCounts) : '',
          bucketsTruncated: result.bucketsTruncated === true,
        },
      })
      timerId = setTimeout(poll, POLL_INTERVAL)
      // R28 修复：unref 让定时器不阻止进程退出
      if (timerId && timerId.unref) timerId.unref()
    } catch (e) {
      log.notify('PublishMonitor', 'poll-error', { level: 'ERROR', params: { platform, postId }, error: String(e.message) })
      retries++
      if (retries >= maxRetries) {
        callback && callback({ status: 'error', postId, message: e.message })
        return
      }
      timerId = setTimeout(poll, POLL_INTERVAL)
      // R28 修复：unref 让定时器不阻止进程退出
      if (timerId && timerId.unref) timerId.unref()
    }
  }
  
  // 启动监控
  timerId = setTimeout(poll, POLL_INTERVAL)
  // R28 修复：unref 让定时器不阻止进程退出
  if (timerId && timerId.unref) timerId.unref()
  
  return {
    stop: () => {
      cancelled = true
      if (timerId) clearTimeout(timerId)
    },
  }
}

/**
 * 检查发布状态
 *
 * @param {string} platform 平台标识
 * @param {string} postId 平台作品标识
 * @param {string} cookies 账号分区解出的 Cookie 串
 * @param {string} [pollUrl] 轮询端点；缺省时由调用方（createMonitorTask）从 CHECK_URLS 取。
 *   取证过的平台会把它透传成自己的 listUrl（B 站＝checkBilibiliAuditStatus 的主桶 URL），
 *   所以这张表**确实载重**，不是装饰性参数（回归锁 T15/M1）。
 * @param {object} [opts]
 * @param {object} [opts.axios] 注入的传输层；缺省回落 require('axios')。测试禁止真实出站
 *   （AGENTS.md QM-3），且本仓没有 nock/msw。
 * @returns {Promise<{status: string, postId?: string, reason?: string, message?: string, bucket?: string, state?: *, primaryState?: *, stateDesc?: *, bucketsProbed?: string[], classCounts?: object|null, bucketsTruncated?: boolean, raw?: object}>}
 */
async function checkPublishStatus (platform, postId, cookies, pollUrl, opts) {
  // 取证过的平台走专用实现，不再套「GET + params:{id}」的通用猜测
  // （实测：B 站的未知 status 会被静默忽略并返回默认列表，"请求成功"对判据零信息量）
  if (platform === 'bilibili') {
    const o = opts && typeof opts === 'object' ? opts : {}
    return checkBilibiliAuditStatus({
      postId,
      cookies,
      axios: o.axios,
      listUrl: pollUrl
    })
  }
  try {
    const axios = (opts && opts.axios) || require('axios')
    
    const response = await axios.get(pollUrl, {
      params: { id: postId },
      headers: { Cookie: cookies || '' },
      timeout: 15000,
    })
    
    const data = response.data
    const items = data?.data?.list || data?.items || [data?.data] || []
    
    for (const item of items) {
      if (String(item.id) === String(postId) || String(item.article_id) === String(postId)) {
        // 状态映射
        const statusMap = {
          published: ['published', 'online', 'published_at'],
          reviewed: ['reviewing', 'under_review', '审核中'],
          rejected: ['rejected', 'failed', '审核不通过'],
          draft: ['draft', '未发布'],
        }
        
        const itemStatus = item?.status || item?.state || item?.publish_status || ''
        const statusText = item?.status_text || ''
        
        for (const [status, keywords] of Object.entries(statusMap)) {
          if (keywords.some(k => String(itemStatus).includes(k) || statusText.includes(k))) {
            return { status, postId, raw: item }
          }
        }
        
        return { status: 'unknown', postId, raw: item, rawStatus: itemStatus }
      }
    }
    
    return { status: 'pending', postId }
  } catch (e) {
    return { status: 'error', postId, message: e.message }
  }
}

module.exports = {
  createMonitorTask,
  checkPublishStatus,
  CHECK_URLS,
  POLL_INTERVAL,
  MAX_RETRIES,
}
