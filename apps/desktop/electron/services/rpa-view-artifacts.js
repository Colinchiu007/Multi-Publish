// @ts-check
/**
 * rpa-view-artifacts.js — 发布产物（作品）查询族（mixin 片段）
 *
 * 2026-10-01 从 rpa-view-navigation-helpers.js 拆出：该文件已贴逐文件行数上限（500），
 * 导致为过门禁反复压缩注释、损害可读性。artifact 族（各平台作品列表查询 + 证据解析 +
 * 严格平台兜底）与交互辅助**零耦合**，仅依赖 win/context 与宿主 mixin 的 this._sleep 等，
 * 故独立成文件；合并方式不变（Object.assign 回 platformsMixin），调用方零改动。
 *
 * 依赖：log（logger）+ normalizePublishId/sanitizePublishResultUrl（rpa-publish-id-extract）
 *      + 宿主 mixin 提供的 this._sleep / this._emitProgress。
 */
'use strict'

const log = require('./logger')
const {
  normalizePublishId,
  sanitizePublishResultUrl,
} = require('./rpa-publish-id-extract')

// 模块级：快手产物证据解析（被 _findKuaishouArtifact 使用，随族一起搬出）

function parseKuaishouArtifactEvidence (body, response) {
  const status = Number(response?.status)
  if (!Number.isFinite(status) || status < 200 || status >= 300) return null
  if (!String(response?.endpoint || '').includes('/rest/cp/works/v2/video/pc/photo/list')) return null
  try {
    const json = JSON.parse(String(body || ''))
    const rows = json && json.data && Array.isArray(json.data.list) ? json.data.list : []
    const kuaishouArtifacts = rows.map(item => {
      const postId = normalizePublishId(item && (item.workId || item.photoId || item.id))
      if (!postId) return null
      const title = String(item.title || item.caption || '').replace(/#g/g, '').replace(/ g/g, '').trim().slice(0, 512)
      const rawTime = item.publishTime || item.uploadTime || 0
      const seconds = Number(String(rawTime).substring(0, 10))
      return {
        postId,
        title,
        publishedAt: Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : 0,
        url: 'https://m.gifshow.com/fw/photo/' + postId,
      }
    }).filter(Boolean).slice(0, 50)
    return kuaishouArtifacts.length > 0 ? { kuaishouArtifacts } : null
  } catch (_) {
    return null
  }
}
  // ========== 发布产物（artifact）查询：把「发布是否真的落地」从响应信号升级为作品列表核对 ==========
  // 拆分自 rpa-view-platforms.js（2026-09-30，行数门禁）：这些方法只依赖 this._sleep /
  // this._navigateAndWait / this._waitForCondition / this._startPublishNetworkCapture 与
  // 模块级 parseKuaishouArtifactEvidence，移出后行为不变。

const artifactsHelpers = {
  async _queryBaijiahaoArtifact(win, context, maxAttempts = 3) {
    const title = String(context.title || '').trim()
    const startedAt = Number(context.publishedAt || Date.now())
    if (!title) return null
    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      try {
        const js = '(async function(){' +
          'var title = ' + JSON.stringify(title) + ';' +
          'var startedAt = ' + JSON.stringify(startedAt) + ';' +
          'var endpoint = "https://baijiahao.baidu.com/pcui/article/lists";' +
          'for (var page = 0; page < 3; page++) {' +
            'var params = new URLSearchParams({currentPage:String(page+1),pageSize:"10",type:"video",collection:"publish",search:"",dynamic:"1"});' +
            'var resp = await fetch(endpoint + "?" + params.toString(), {credentials:"include",headers:{Accept:"application/json, text/plain, */*","X-Requested-With":"XMLHttpRequest"}});' +
            'if (!resp.ok) continue;' +
            'var json = await resp.json();' +
            'var rows = json && json.data && Array.isArray(json.data.list) ? json.data.list : [];' +
            'for (var i = 0; i < rows.length; i++) {' +
              'var item = rows[i] || {};' +
              'var id = item.article_id || item.id;' +
              'if (!id) continue;' +
              'var itemTitle = String(item.title || "").trim();' +
              'var status = String(item.status || "");' +
              'var publishAt = item.publish_at ? new Date(item.publish_at).getTime() : 0;' +
              'var inWindow = Number.isFinite(publishAt) && publishAt > 0 && publishAt >= startedAt - 300000 && publishAt <= startedAt + 900000;' +
              'if (status === "publish" && inWindow && itemTitle === title) {' +
                'return {postId:String(id),url:item.share_url || "",title:itemTitle,status:status};' +
              '}' +
            '}' +
          '}' +
          'return null;' +
        '})()'
        const found = await win.webContents.executeJavaScript(js)
        const postId = normalizePublishId(found && found.postId)
        if (postId) {
          log.info('RpaView', '[baijiahao] artifact lookup matched id=' + postId.slice(0, 80))
          return { ...found, postId, url: sanitizePublishResultUrl(found.url) }
        }
      } catch (e) {
        log.warn('RpaView', '[baijiahao] artifact lookup attempt ' + (attempt + 1) + ': ' + e.message)
      }
      if (attempt + 1 < maxAttempts) await this._sleep(3000)
    }
    return null
  },
  _parseKuaishouArtifact(evidence, context) {
    const title = String(context.title || '').trim()
    const startedAt = Number(context.publishedAt || Date.now())
    if (!title) return null
    for (const entry of evidence || []) {
      const artifacts = entry && Array.isArray(entry.kuaishouArtifacts) ? entry.kuaishouArtifacts : []
      for (const item of artifacts) {
        const postId = normalizePublishId(item && item.postId)
        if (!postId) continue
        const itemTitle = String(item.title || '').trim()
        const publishedAt = Number(item.publishedAt || 0)
        const inWindow = Number.isFinite(publishedAt) && publishedAt > 0 && publishedAt >= startedAt - 120000 && publishedAt <= startedAt + 900000
        if (inWindow && itemTitle === title) {
          return { postId, url: item.url || 'https://m.gifshow.com/fw/photo/' + postId, title: itemTitle }
        }
      }
    }
    return null
  },
  async _findKuaishouArtifact(win, context, maxAttempts = 2) {
    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      let capture = null
      try {
        capture = await this._startPublishNetworkCapture(win, { parseResponseBody: parseKuaishouArtifactEvidence })
        const statuses = attempt === 0 ? ['1', '2', '3'] : ['1']
        for (const status of statuses) {
          try {
            await this._navigateAndWait(win, 'https://cp.kuaishou.com/article/manage/video?status=' + status, 2000)
            await this._waitForCondition(win, 'function(){var t=(document.body&&document.body.innerText)||"";return /作品管理|发布作品|视频管理|内容管理/.test(t)||document.querySelectorAll("a[href*=photo],[data-photo-id],[class*=work-item],[class*=works-list]").length>0}', 15000, 500)
          } catch (e) { log.warn('RpaView', 'kuaishou manage page: ' + e.message) }
          await this._sleep(2500)
          const artifact = this._parseKuaishouArtifact(capture?.evidence || [], context)
          if (artifact) {
            log.info('RpaView', '[kuaishou] artifact lookup matched id=' + String(artifact.postId).slice(0, 80))
            await capture.stop()
            capture = null
            return artifact
          }
        }
      } catch (e) {
        log.warn('RpaView', '[kuaishou] artifact lookup attempt ' + (attempt + 1) + ': ' + e.message)
      } finally {
        if (capture) { try { await capture.stop() } catch (e) { /* ignore */ } }
      }
      if (attempt + 1 < maxAttempts) await this._sleep(3000)
    }
    return null
  },
  // ========== 头条发布产物查询（2026-09-30，参考产品同款口径）==========
  // 头条发布后**不跳转**（URL 恒为 /profile_v4/graphic/publish），故 success_mode='url' 必超时。
  // 参考产品（参考产品）的做法是查**作品列表 API** 并检查 `ArticleAttr.Status`：
  //   "2"=已发布  "6"=审核中（两者均视为「已提交成功」）  "4"=草稿  "3"=被拒
  // 端点同样取自参考产品：`mp.toutiao.com/mp/agw/creator_center/list`（type=4 图文）。
  // 判定要素：标题精确匹配 + 展示时间落在 [startedAt-10min, startedAt+30min] 窗口内。
  async _findToutiaoArtifact(win, context) {
    const title = String((context && context.title) || '').trim()
    const startedAt = Number((context && context.publishedAt) || Date.now())
    if (!title) return null
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        const js = [
          '(async function(){',
          '  var title=' + JSON.stringify(title) + ';',
          '  var start=' + JSON.stringify(startedAt) + ';',
          '  var url="https://mp.toutiao.com/mp/agw/creator_center/list?type=4&status=0&size=20&mode=1&need_stat=true&total_end_cursor=0&end_cursor=0&start_cursor=0";',
          '  try {',
          '    var r=await fetch(url,{credentials:"include",headers:{Accept:"application/json, text/plain, */*"}});',
          '    if(!r.ok)return null;',
          '    var j=await r.json();',
          '    var d=(j&&j.data)||{};',
          // 2026-09-30 真机取证：该接口的**顶层**就是 contents（无 data 包裹）：
          //   {"code":0,"contents":[...],"count":N,"total_count":N,...}
          // 旧实现读 j.data.contents ⇒ 空数组不含此项 ⇒ 恒未命中。
          '    var list=(j&&Array.isArray(j.contents)?j.contents:null)||d.contents||d.Contents||d.list||(Array.isArray(d)?d:[]);',
          '    if(!Array.isArray(list))return null;',
          '    for(var i=0;i<list.length;i++){',
          '      var it=list[i]||{};var a=it.ArticleAttr||it.article_attr||it;',
          '      var st=String(a.Status||a.status||"");',
          '      var id=String(a.ItemId||a.item_id||a.group_id||it.item_id||"");',
          '      var t=String(a.Title||a.title||it.title||"").trim();',
          '      var show=Number(a.ShowTime||a.show_time||a.CreateTime||0);',
          '      var showMs=show>1e12?show:show*1000;',
          '      var inWin=!showMs||(showMs>=start-600000&&showMs<=start+1800000);',
          '      if(id&&t===title&&inWin&&(st==="2"||st==="6")){',
          '        return {postId:id,url:"https://www.toutiao.com/item/"+id+"/",status:st,statusText:st==="2"?"published":"inAudit"};',
          '      }',
          '    }',
          '    return null;',
          '  } catch(e){ return null }',
          '})()',
        ].join('\n')
        const found = await win.webContents.executeJavaScript(js)
        const postId = normalizePublishId(found && found.postId)
        if (postId) {
          log.info('RpaView', '[toutiao] artifact matched id=' + String(postId).slice(0, 40) + ' status=' + String((found && found.status) || ''))
          return { ...found, postId, url: sanitizePublishResultUrl(found.url) }
        }
      } catch (e) {
        log.warn('RpaView', '[toutiao] artifact lookup attempt ' + (attempt + 1) + ': ' + e.message)
      }
      if (attempt < 2) await this._sleep(4000)
    }
    log.warn('RpaView', '[toutiao] artifact lookup 未命中（作品可能仍在审核队列或该 API 口径已变）')
    return null
  },
  // 严格平台兜底（2026-09-30 头条实测）：发布后**既不跳转也不返回响应信号**时，
  // 在判超时前主动查一次发布产物。成功则返回可直接返回给上层的成功结果，否则 null。
  // stopCapture 由调用方传入（网络捕获停止器是主文件局部闭包）。
  async _strictPublishFallback(win, platform, context, stopCapture) {
    try {
      const artifact = await this._findPublishedArtifact(win, platform, context)
      const postId = normalizePublishId(artifact && artifact.postId)
      if (!postId) return null
      this._emitProgress(platform, 'published!', 100)
      let stopped = []
      try { stopped = stopCapture ? await stopCapture() : [] } catch (_) { stopped = [] }
      return {
        success: true,
        url: sanitizePublishResultUrl((artifact && artifact.url) || (win.webContents.getURL() || '')),
        postId,
        platform,
        diagnostics: {
          requests: Array.isArray(stopped) ? stopped.length : 0,
          artifact: { postId: String(postId).slice(0, 60), status: (artifact && artifact.status) || null },
        },
      }
    } catch (e) {
      log.warn('RpaView', '[' + platform + '] strict artifact fallback: ' + e.message)
      return null
    }
  },
  async _findPublishedArtifact(win, platform, context = {}) {
    if (platform === 'baijiahao') return await this._queryBaijiahaoArtifact(win, context)
    if (platform === 'kuaishou') return await this._findKuaishouArtifact(win, context)
    if (platform === 'toutiao') return await this._findToutiaoArtifact(win, context)
    return null
  },
}

module.exports = { artifactsHelpers, parseKuaishouArtifactEvidence }
