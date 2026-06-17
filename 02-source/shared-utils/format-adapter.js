/**
 * FormatAdapter — Markdown → 各平台格式适配器
 *
 * 统一入口：format(platform, article) → 各平台需要的格式
 * 自动处理：HTML 转义、标签格式、长度限制、分隔线、列表转换
 */
class FormatAdapter {
  /**
   * 格式化文章到目标平台格式
   * @param {string} platform - 平台标识
   * @param {object} article - { title, content, author, tags? }
   * @returns {object} 平台适配后的文章 { title, content, ... }
   */
  static format (platform, article) {
    const content = article.content || ''
    const handlers = {
      wechat_mp:    () => this._wechat(article),
      zhihu:        () => this._zhihu(article),
      weibo:        () => this._weibo(article),
      douyin:       () => this._douyin(article),
      xiaohongshu:  () => this._xiaohongshu(article),
      tencent_video:() => this._shortVideo(article),
      kuaishou:     () => this._shortVideo(article),
      toutiao:      () => this._toutiao(article),
      youtube:      () => this._youtube(article),
      tiktok:       () => this._tiktok(article),
    }
    const handler = handlers[platform]
    if (!handler) return { ...article, _warnings: ['未适配的平台，使用原始格式'] }
    return handler()
  }

  /**
   * Markdown → 纯文本（通用）
   */
  static _plainText (md) {
    return md
      .replace(/^#{1,6}\s+/gm, '')           // 移除标题标记
      .replace(/\*\*(.+?)\*\*/g, '$1')        // 粗体 → 纯文本
      .replace(/\*(.+?)\*/g, '$1')            // 斜体 → 纯文本
      .replace(/`(.+?)`/g, '$1')              // 行内代码 → 纯文本
      .replace(/```[\s\S]*?```/g, '')         // 代码块 → 移除
      .replace(/!\[.*?\]\(.*?\)/g, '')         // 图片标记 → 移除
      .replace(/\[(.+?)\]\(.*?\)/g, '$1')     // 链接 → 纯文本
      .replace(/^>\s+/gm, '')                 // 引用 → 纯文本
      .replace(/^[-*+]\s+/gm, '• ')           // 列表 → 圆点
      .replace(/^\d+\.\s+/gm, '')             // 数字列表 → 移除编号
      .replace(/\n{3,}/g, '\n\n')             // 多个换行 → 两个
      .trim()
  }

  /**
   * Markdown → HTML（通用）
   */
  static _html (md) {
    let html = md
      // 代码块
      .replace(/```(\w*)\n([\s\S]*?)```/g, '<pre><code>$2</code></pre>')
      // 行内代码
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      // 图片
      .replace(/!\[(.*?)\]\((.*?)\)/g, '<img src="$2" alt="$1">')
      // 链接
      .replace(/\[(.+?)\]\((.*?)\)/g, '<a href="$2">$1</a>')
      // 标题
      .replace(/^######\s+(.+)/gm, '<h6>$1</h6>')
      .replace(/^#####\s+(.+)/gm, '<h5>$1</h5>')
      .replace(/^####\s+(.+)/gm, '<h4>$1</h4>')
      .replace(/^###\s+(.+)/gm, '<h3>$1</h3>')
      .replace(/^##\s+(.+)/gm, '<h2>$1</h2>')
      .replace(/^#\s+(.+)/gm, '<h1>$1</h1>')
      // 粗体/斜体
      .replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>')
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.+?)\*/g, '<em>$1</em>')
      // 引用
      .replace(/^>\s+(.+)/gm, '<blockquote>$1</blockquote>')
      // 列表
      .replace(/^[-*+]\s+(.+)/gm, '<li>$1</li>')
      // 段落
      .replace(/\n\n/g, '</p><p>')
    return '<p>' + html + '</p>'
  }

  /**
   * 截断文本到最大长度，保留完整句子
   */
  static _truncate (text, maxLen) {
    if (text.length <= maxLen) return text
    const truncated = text.slice(0, maxLen)
    const lastPeriod = truncated.lastIndexOf('。')
    const lastNewline = truncated.lastIndexOf('\n')
    const splitAt = Math.max(lastPeriod, lastNewline)
    if (splitAt > maxLen * 0.7) return truncated.slice(0, splitAt + 1)
    return truncated.slice(0, maxLen - 3) + '...'
  }

  // ===== 平台具体实现 =====

  /**
   * 微信公众号 — HTML 格式，特定 CSS 类名
   */
  static _wechat (article) {
    return {
      title: article.title,
      author: article.author || '',
      content: `<section style="padding:10px 0">${this._html(article.content)}</section>`,
      coverUrl: article.cover_url || '',
    }
  }

  /**
   * 知乎 — 支持 Markdown/HTML 混合
   */
  static _zhihu (article) {
    const content = this._html(article.content)
      .replace(/<h1>/g, '<h2>').replace(/<\/h1>/g, '</h2>')
    return {
      title: article.title,
      content,
      tags: article.tags || [],
    }
  }

  /**
   * 微博 — 纯文本 + 话题 #标签#，最长 2000 字
   */
  static _weibo (article) {
    let text = this._plainText(article.content)
    if (article.tags && article.tags.length > 0) {
      text += '\n\n' + article.tags.map(t => `#${t}#`).join(' ')
    }
    const maxLen = 2000
    if (text.length > maxLen) {
      text = this._truncate(text, maxLen - 20) + '\n\n📎 全文见评论'
    }
    return {
      title: article.title,
      content: (article.title ? article.title + '\n\n' : '') + text,
    }
  }

  /**
   * 抖音 — 简短文字 + 话题标签
   */
  static _douyin (article) {
    let text = this._plainText(article.content)
    text = this._truncate(text, 500)
    if (article.tags && article.tags.length > 0) {
      text += '\n' + article.tags.map(t => `#${t}`).join(' ')
    }
    return {
      title: '',
      content: text,
    }
  }

  /**
   * 小红书 — 标题+正文+标签，Emoji 友好
   */
  static _xiaohongshu (article) {
    let text = this._plainText(article.content)
    // 小红书用 @ 提及
    text = text.replace(/@(\w+)/g, '@$1 ')
    text = this._truncate(text, 1000)
    if (article.tags && article.tags.length > 0) {
      text += '\n\n' + article.tags.map(t => `#${t}`).join(' ')
    }
    return {
      title: article.title,
      content: text,
    }
  }

  /**
   * 短视频平台通用（视频号、快手）
   */
  static _shortVideo (article) {
    let text = this._plainText(article.content)
    text = this._truncate(text, 300)
    if (article.tags && article.tags.length > 0) {
      text += '\n' + article.tags.map(t => `#${t}`).join(' ')
    }
    return {
      title: article.title,
      content: text,
      video_path: article.video_path || '',
    }
  }

  /**
   * 今日头条 — HTML，头条号编辑器
   */
  static _toutiao (article) {
    const content = this._html(article.content)
    return {
      title: article.title,
      content,
      tags: article.tags || [],
    }
  }

  /**
   * YouTube — 标题+描述+标签，视频专属
   */
  static _youtube (article) {
    const desc = this._plainText(article.content)
    let description = article.title ? article.title + '\n\n' : ''
    description += desc
    if (article.tags && article.tags.length > 0) {
      description += '\n\n' + article.tags.map(t => `#${t.replace(/\s/g, '')}`).join(' ')
    }
    return {
      title: article.title,
      description: this._truncate(description, 5000),
      tags: article.tags || [],
    }
  }

  /**
   * TikTok — 简短文字 + 话题标签
   */
  static _tiktok (article) {
    let text = this._plainText(article.content)
    text = this._truncate(text, 300)
    if (article.tags && article.tags.length > 0) {
      text += '\n' + article.tags.map(t => `#${t}`).join(' ')
    }
    return {
      title: '',
      content: text,
    }
  }
}

module.exports = FormatAdapter