// @ts-check
/**
 * rpa-view-navigation-helpers.js — RPA 发布流程的导航/等待类 helper（mixin 片段）
 *
 * 拆分自 rpa-view-platforms.js (2026-09-29)：原文件超逐文件行数门禁
 * （check-max-lines LEDGER_GREW）。这些方法都是通过 `this.*` 调用的自包含 helper，
 * 抽出后用 Object.assign 合回 platformsMixin，行为不变。
 *
 * 依赖：log（logger）+ 宿主 mixin 提供的 this._waitForElement/_sleep/_waitForCondition。
 */
'use strict'

const log = require('./logger')
const {
  normalizePublishId,
  sanitizePublishResultUrl,
} = require('./rpa-publish-id-extract')

/**
 * HTML → 纯文本（模块级工具，2026-09-30）。
 * 用于无标题平台的描述合并：发布页 Quill 编辑器把草稿正文规范化为 HTML
 * （`<p>…</p>`），而平台描述是纯文本语义（计数器按可见字符算），
 * 不剥标签会让 `<p>` 以字面量出现在作品描述里（快手截图取证）。
 * 块级标签收口为换行，避免段落被粘连；三个以上连续换行压成两行。
 */
function stripHtmlToPlainText (html) {
  return String(html == null ? '' : html)
    .replace(/<\s*br\s*\/?\s*>/gi, '\n')
    .replace(/<\s*\/\s*(?:p|div|li|h[1-6]|blockquote|section|article)\s*>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#0*39;/g, "'")
    .replace(/&amp;/gi, '&')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

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

const navigationHelpers = {
  // ========== 导航后弹窗清理 ==========
  // 平台上传落地页会叠加草稿恢复弹窗（快手：继续编辑/放弃）与功能引导遮罩
  // （抖音/B站：我知道了/知道了），不先关掉会遮挡上传区与表单，导致字段选择器
  // 全部 timeout（2026-09 E2E 实锤：快手草稿弹窗遮挡发布流程）。
  // 草稿冲突优先点「放弃」（丢弃陈旧草稿，本次上传走全新流程）；只有「继续编辑」时点它。
  async _dismissPostNavDialogs(win, platform) {
    try {
      const dismissed = await win.webContents.executeJavaScript(
        '(function(){var clicked=[];' +
        'var visible=function(e){return e&&e.offsetParent&&(e.innerText||"").trim().length<=12};' +
        'var find=function(txt){return [...document.querySelectorAll("button,a,span,div,[role=button]")].filter(function(e){return visible(e)&&(e.innerText||"").trim()===txt})};' +
        'var giveup=find("放弃");if(giveup.length){giveup[giveup.length-1].click();clicked.push("放弃")}' +
        'else{var cont=find("继续编辑");if(cont.length){cont[cont.length-1].click();clicked.push("继续编辑")}}' +
        'var acks=find("我知道了").concat(find("知道了"));for(var i=0;i<acks.length;i++){acks[i].click();clicked.push((acks[i].innerText||"").trim())}' +
        'return clicked.join(",")})()'
      )
      if (dismissed) log.info('RpaView', '[' + platform + '] post-nav dialogs dismissed: ' + String(dismissed))
    } catch (e) { log.warn('RpaView', '[' + platform + '] post-nav dialogs: ' + e.message) }
  },

  // ========== 选择器候选回退 ==========
  // 旧实现只用 candidates[0]：平台改版或落地页差异会让首个候选不存在，整条链路
  // 直接 timeout（2026-09 live DOM 实锤：快手编辑页根本没有 input[placeholder*="标题"]，
  // 标题与作品描述同为 div#work-description-edit[contenteditable]）。必须逐候选尝试。
  // 首个候选给完整预算（等 SPA 渲染），其余候选快速判定存在与否。
  async _resolveSelector(win, selectors, firstTimeoutMs, restTimeoutMs) {
    const list = (Array.isArray(selectors) ? selectors : [selectors]).filter((s) => typeof s === 'string' && s.length > 0)
    for (let i = 0; i < list.length; i++) {
      const cand = list[i]
      // eslint-disable-next-line no-await-in-loop
      if (await this._waitForElement(win, cand, i === 0 ? (firstTimeoutMs || 8000) : (restTimeoutMs || 2500))) return cand
    }
    return null
  },

  // 无独立标题字段的平台（快手作品描述）：标题与正文合并成一段文案写进编辑器，
  // 长度按平台 max_content 截断（快手 500），避免后续正文填充把标题覆写掉。
  // 2026-10-08 CCG 评审（W1/W2）统一口径：合并分隔符从 '\n\n' 收敛为 '\n'、
  // 截断从 UTF-16 slice 改为按码点（不切断代理对），与注册表
  // composeNoTitleDescription 及引擎各链（shipinhao/twitter/weibo/tiktok）一致。
  // 2026-09-30 追加（快手截图取证）：正文来自发布页 Quill 编辑器，携带 HTML 标记
  // （`<p>…</p>`）。无标题平台的描述是**纯文本**语义——平台计数器按可见字符算，
  // 且不剥标签会让 `<p>` 以字面量出现在作品描述里。故此处先把 HTML 归一为纯文本。
  _composeEditorCaption(article, maxLen) {
    const limit = Number(maxLen) > 0 ? Number(maxLen) : 2000
    const parts = [article && article.title, stripHtmlToPlainText(article && article.content)]
      .filter((v) => typeof v === 'string' && v.trim().length > 0)
      .map((v) => v.trim())
    const composed = parts.join('\n')
    const chars = Array.from(composed)
    return chars.length > limit ? chars.slice(0, limit).join('') : composed
  },

  // ========== 发布后的二次确认弹窗 ==========
  // 2026-09-30 快手实测：点「发布」后弹出确认框（模态层含「取 消」「确 认」两颗按钮，
  // 另有禁用态的「确定」），不点「确认」则永不提交 → publish verification timeout。
  // 判据：只点**可见且未禁用**的「确认/确定」——页面常同时存在禁用的同名按钮（如
  // 快手「近7天的下载记录」公告里的确定 d=true），不加 disabled 过滤会误点。
  // 按钮文本可能带空格（「确 认」），比较前统一剥空白。
  async _confirmPublishDialog(win, platform) {
    try {
      const result = await win.webContents.executeJavaScript(
        '(function(){var hit=[...document.querySelectorAll("button,div,span")].filter(function(e){'
        + 'var t=(e.innerText||"").replace(/\\s+/g,"");'
        + 'return (t==="确认"||t==="确定")&&e.offsetParent&&!e.disabled&&e.getClientRects().length>0});'
        + 'if(hit.length){hit[hit.length-1].click();return "CONFIRMED"}return "NO_DIALOG"})()'
      )
      if (result === 'CONFIRMED') {
        log.info('RpaView', '[' + platform + '] publish confirm dialog clicked')
        await this._sleep(2500)
      }
      return result
    } catch (e) {
      log.warn('RpaView', '[' + platform + '] confirm dialog: ' + e.message)
      return null
    }
  },

  // ========== 图片上传后的「图片编辑」模态层收起 ==========
  // 2026-09-29 实测（小红书图文）：图片上传成功后平台自动进入图片编辑（裁剪）界面——
  // 模态层文本「图片编辑 裁剪 模版 贴纸 文字 滤镜 比例 … 裁剪设置 滚动鼠标滚轮或触控板
  // 可缩放图片 完成」。该原生层遮挡「发布」按钮，不收起则发布按钮选择器必然超时
  // （实测 button:has-text("发布") 3s timeout → publish verification failed）。
  // 优先点「完成」（保留默认比例），回退「取消/关闭/×」。
  async _dismissImageEditModal(win, platform) {
    try {
      const result = await win.webContents.executeJavaScript(
        '(function(){var t=(document.body&&document.body.innerText)||"";'
        + 'if(!/裁剪设置|可缩放图片|图片编辑/.test(t))return "NO_EDIT_MODAL";'
        + 'var pick=function(txt){return [...document.querySelectorAll("button,div,span")].filter(function(e){return (e.innerText||"").trim()===txt&&e.offsetParent})};'
        + 'var done=pick("完成");if(done.length){done[done.length-1].click();return "DISMISSED"}'
        + 'var cancel=pick("取消").concat(pick("关闭"),pick("×"));if(cancel.length){cancel[cancel.length-1].click();return "CANCELLED"}'
        + 'return "MODAL_NO_CLOSE"})()'
      )
      if (result && result !== 'NO_EDIT_MODAL') log.info('RpaView', '[' + platform + '] image-edit modal: ' + result)
      if (result === 'DISMISSED' || result === 'CANCELLED') await this._sleep(1500)
      return result
    } catch (e) {
      log.warn('RpaView', '[' + platform + '] image-edit modal: ' + e.message)
      return null
    }
  },

  // ========== 视频上传完成强判定 ==========
  // 旧判定 !progress||success 在快手/B站等平台立即为真（页面不用 progress class），
  // 导致还在上传落地页就继续填字段/点发布，全部失败（2026-09 smoke4 实锤）。
  // v2 收紧：blob 本地预览注入瞬间就存在，不能算完成（smoke5 实锤）。
  // v3（2026-09 smoke6 实锤）：快手 25s 即误判完成，因为页内存在 https 广告 video。
  // 因此加入平台通用的“正在上传”负向信号：上传中…/剩余时间：/转码中/可见进度条
  // 任一命中就继续等；预算也拉到 15 分钟（实测 B站 96MB 上传超 10 分钟）。
  async _waitForVideoUploadComplete(win, platform, timeoutMs) {
    await this._sleep(25000) // 最低稳定期：80MB 视频不可能 25s 内传完，防 blob 预览/首拍误判
    const cond = 'function(){var t=(document.body&&document.body.innerText)||"";'
      + 'var pv=[...document.querySelectorAll("[class*=progress],[class*=uploading],[class*=percent],[class*=Percent]")].filter(function(e){return e.offsetParent&&e.clientHeight>0}).length;'
      + 'var m=t.match(/(\\d{1,3})\\s*%/);var pct=m?Number(m[1]):-1;'
      + 'var uploading=/上传中[….]{1,3}|正在上传|剩余时间[:\uff1a]|转码中|上传失败/.test(t)||pv>0||(pct>=0&&pct<100);'
      + 'if(uploading)return false;'
      + 'var vv=[...document.querySelectorAll("video")].some(function(v){var s=v.currentSrc||v.src||"";return s.indexOf("https:")===0&&v.getClientRects().length>0});'
      + 'var ed=!!document.querySelector(\'input[placeholder*="标题"],textarea[placeholder],[contenteditable="true"]\');'
      + 'return vv||ed||location.href.indexOf("post/video")!==-1}'
    const ok = await this._waitForCondition(win, cond, timeoutMs || 900000, 3000)
    if (!ok) log.warn('RpaView', '[' + platform + '] video upload-complete signal not detected (preview/url), continuing best-effort')
    return ok
  },

  // ========== 发布产物（artifact）查询：把「发布是否真的落地」从响应信号升级为作品列表核对 ==========
  // 拆分自 rpa-view-platforms.js（2026-09-30，行数门禁）：这些方法只依赖 this._sleep /
  // this._navigateAndWait / this._waitForCondition / this._startPublishNetworkCapture 与
  // 模块级 parseKuaishouArtifactEvidence，移出后行为不变。
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

  async _findPublishedArtifact(win, platform, context = {}) {
    if (platform === 'baijiahao') return await this._queryBaijiahaoArtifact(win, context)
    if (platform === 'kuaishou') return await this._findKuaishouArtifact(win, context)
    return null
  },
}

module.exports = { navigationHelpers }
