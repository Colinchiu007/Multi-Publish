// @ts-check
/**
 * RpaViewManager 平台 mixin 结构回归测试
 */
const fs = require('fs')
const platformsMixin = require('./rpa-view-platforms')

function createWechatContext() {
  return {
    _emitProgress: vi.fn(),
    _navigateAndWait: vi.fn().mockResolvedValue(undefined),
    _waitForElement: vi.fn().mockResolvedValue(true),
    _fillInput: vi.fn().mockResolvedValue(undefined),
    _fillInFrame: vi.fn().mockResolvedValue(undefined),
    _click: vi.fn().mockResolvedValue(true),
    _sleep: vi.fn().mockResolvedValue(undefined),
  }
}

describe('rpa-view-platforms — 结构约束', () => {
  it('wechat_mp 发布方法只定义一次，避免 pending stub 覆盖风险', () => {
    const source = fs.readFileSync(require.resolve('./rpa-view-platforms'), 'utf-8')
    const definitions = source.match(/async\s+_publish_wechat_mp\s*\(/g) || []

    expect(definitions).toHaveLength(1)
    expect(source).not.toContain('wechat_mp RPA pending')
  })
})

describe('rpa-view-platforms — 微信公众号发布', () => {
  function createWindow(url) {
    const executeJavaScript = vi.fn().mockResolvedValue(true)
    const win = {
      webContents: {
        getURL: vi.fn().mockReturnValue(url),
        executeJavaScript,
      },
    }

    return { win, executeJavaScript }
  }

  it('保存按钮点击失败时返回失败', async () => {
    const { win } = createWindow('https://mp.weixin.qq.com/cgi-bin/appmsg?appmsgid=12345')
    const context = createWechatContext()
    context._click.mockResolvedValueOnce(false)

    const result = await platformsMixin._publish_wechat_mp.call(context, win, {})

    expect(result).toEqual(expect.objectContaining({
      success: false,
      platform: 'wechat_mp',
    }))
    expect(result.error).toContain('保存')
  })

  it('保存后 URL 没有媒体 ID 时返回失败', async () => {
    const { win } = createWindow('https://mp.weixin.qq.com/cgi-bin/appmsg?t=media/appmsg_edit')
    const context = createWechatContext()

    const result = await platformsMixin._publish_wechat_mp.call(context, win, {})

    expect(result).toEqual(expect.objectContaining({
      success: false,
      platform: 'wechat_mp',
    }))
    expect(result.error).toContain('媒体 ID')
  })

  it('正常保存草稿时返回成功且不进入群发流程', async () => {
    const { win } = createWindow('https://mp.weixin.qq.com/cgi-bin/appmsg?appmsgid=12345')
    const context = createWechatContext()

    const result = await platformsMixin._publish_wechat_mp.call(context, win, {})

    expect(result).toEqual(expect.objectContaining({
      success: true,
      platform: 'wechat_mp',
    }))
    expect(context._navigateAndWait).toHaveBeenCalledTimes(1)
    expect(context._click).toHaveBeenCalledTimes(1)
  })

  it('把保存后 URL 中的媒体 ID 传给群发选择器并成功群发', async () => {
    const { win, executeJavaScript } = createWindow('https://mp.weixin.qq.com/cgi-bin/appmsg?appmsgid=12345')
    const context = createWechatContext()

    const result = await platformsMixin._publish_wechat_mp.call(context, win, { massSend: true })

    expect(result.success).toBe(true)
    expect(context._navigateAndWait).toHaveBeenCalledTimes(2)
    const massSendScript = executeJavaScript.mock.calls
      .map(([script]) => script)
      .find((script) => script.includes('appmsgid'))
    expect(massSendScript).toContain('[appmsgid=\\"12345\\"]')
    expect(context._click).toHaveBeenCalledWith(win, 'a.btn_masssend, a[data-action="masssend"]')
    expect(context._click).toHaveBeenCalledWith(win, '.dialog_bd_btn a:has-text("确定"), .weui-desktop-btn:has-text("确定")')
  })

  it('群发列表找不到已保存草稿时返回失败', async () => {
    const { win, executeJavaScript } = createWindow('https://mp.weixin.qq.com/cgi-bin/appmsg?appmsgid=12345')
    executeJavaScript
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false)
    const context = createWechatContext()

    const result = await platformsMixin._publish_wechat_mp.call(context, win, { massSend: true })

    expect(result).toEqual(expect.objectContaining({
      success: false,
      platform: 'wechat_mp',
    }))
    expect(result.error).toContain('草稿')
    expect(context._click).not.toHaveBeenCalledWith(win, 'a.btn_masssend, a[data-action="masssend"]')
  })

  it('群发按钮点击失败时返回失败', async () => {
    const { win } = createWindow('https://mp.weixin.qq.com/cgi-bin/appmsg?appmsgid=12345')
    const context = createWechatContext()
    context._click
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false)

    const result = await platformsMixin._publish_wechat_mp.call(context, win, { massSend: true })

    expect(result).toEqual(expect.objectContaining({
      success: false,
      platform: 'wechat_mp',
    }))
    expect(result.error).toContain('群发按钮')
  })

  it('群发确认按钮点击失败时返回失败', async () => {
    const { win } = createWindow('https://mp.weixin.qq.com/cgi-bin/appmsg?appmsgid=12345')
    const context = createWechatContext()
    context._click
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false)

    const result = await platformsMixin._publish_wechat_mp.call(context, win, { massSend: true })

    expect(result).toEqual(expect.objectContaining({
      success: false,
      platform: 'wechat_mp',
    }))
    expect(result.error).toContain('群发确认')
  })
})
