/**
 * SelectorEngine — 三层级选择器引擎
 *
 * Level 1: 预定义选择器 (从 platform-selectors.js 加载, ⚡ 快)
 * Level 2: 语义 fallback (Playwright text= / role= / placeholder)
 * Level 3: AI 看图定位 (预留, 暂不实现)
 *
 * 使用方式:
 *   const { SelectorEngine } = require('./selector-engine')
 *   const el = await SelectorEngine.find(page, 'zhihu', 'publish_btn')
 */
const platformSelectors = require('./platform-selectors')

class SelectorEngine {
  /**
   * 查找页面元素，自动降级
   *
   * @param {import('playwright').Page} page
   * @param {string} platform - 平台标识 (zhihu, weibo, ...)
   * @param {string} elementKey - 元素键名 (publish_btn, title_input, ...)
   * @param {object} [options]
   * @param {number} [options.timeout=5000] - 每级超时 (ms)
   * @param {boolean} [options.verbose=false] - 日志
   * @returns {Promise<import('playwright').Locator|null>}
   */
  static async find (page, platform, elementKey, options = {}) {
    const { timeout = 5000, verbose = false } = options

    // Level 1: 配置中的主选择器
    const primary = await SelectorEngine._tryPrimary(page, platform, elementKey, timeout, verbose)
    if (primary) return primary

    // Level 2: 语义 fallback
    const fallback = await SelectorEngine._trySemantic(page, platform, elementKey, timeout, verbose)
    if (fallback) return fallback

    if (verbose) {
      console.log(`[SelectorEngine] Level 1+2 失败: ${platform}.${elementKey}`)
    }
    return null
  }

  /**
   * Level 1: 从 platform-selectors.js 加载预定义选择器
   */
  static async _tryPrimary (page, platform, elementKey, timeout, verbose) {
    const publishSelectors = platformSelectors.PLATFORM_PUBLISH_SELECTORS[platform]
    if (!publishSelectors || !publishSelectors[elementKey]) return null

    const selectors = publishSelectors[elementKey]
    for (const sel of selectors) {
      try {
        const locator = page.locator(sel).first()
        await locator.waitFor({ state: 'visible', timeout })
        if (verbose) console.log(`[SelectorEngine] L1 命中: ${sel}`)
        return locator
      } catch {
        // 继续尝试下一个选择器
      }
    }
    return null
  }

  /**
   * Level 2: 语义 fallback — 根据元素类型推断 Playwright 语义选择器
   */
  static async _trySemantic (page, platform, elementKey, timeout, verbose) {
    const semanticSelectors = SelectorEngine._buildSemanticSelectors(platform, elementKey)
    for (const sel of semanticSelectors) {
      try {
        const locator = page.locator(sel).first()
        await locator.waitFor({ state: 'visible', timeout: Math.min(timeout, 3000) })
        if (verbose) console.log(`[SelectorEngine] L2 命中: ${sel}`)
        return locator
      } catch {
        // 继续
      }
    }
    return null
  }

  /**
   * 根据平台和元素类型，构建语义选择器列表
   */
  static _buildSemanticSelectors (platform, elementKey) {
    const rules = {
      publish_btn: [
        'button:has-text("发布")',
        'button:has-text("Publish")',
        'button:has-text("Post")',
        'button:has-text("发表")',
        '[role="button"]:has-text("发布")',
        'a:has-text("发布")',
      ],
      title_input: [
        'input[placeholder*="标题"]',
        'input[placeholder*="title"]',
        'input[placeholder*="Title"]',
        '[contenteditable="true"]:first-of-type',
      ],
      save_btn: [
        'button:has-text("保存")',
        'button:has-text("Save")',
        'a:has-text("保存")',
        'a:has-text("Save")',
      ],
      editor: [
        '[contenteditable="true"]',
        '.ql-editor',
        'textarea',
        '[role="textbox"]',
      ],
      upload_btn: [
        'button:has-text("上传")',
        'button:has-text("Upload")',
        'input[type="file"]',
      ],
      next_btn: [
        'button:has-text("下一步")',
        'button:has-text("Next")',
        'button:has-text("Continue")',
      ],
    }

    return rules[elementKey] || []
  }

  /**
   * 批量查找多个元素
   *
   * @param {import('playwright').Page} page
   * @param {string} platform
   * @param {string[]} elementKeys
   * @param {object} [options]
   * @returns {Promise<Object<string, import('playwright').Locator|null>>}
   */
  static async findMultiple (page, platform, elementKeys, options = {}) {
    const results = {}
    for (const key of elementKeys) {
      results[key] = await SelectorEngine.find(page, platform, key, options)
    }
    return results
  }
}

module.exports = { SelectorEngine }
