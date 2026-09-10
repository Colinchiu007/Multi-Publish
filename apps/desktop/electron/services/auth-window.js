// @ts-check
/**
 * 认证窗口公共工厂 —— 独立 BrowserWindow 承载认证类 WebContentsView。
 *
 * 背景：QrCodeLogin / OAuthManager（以及已迁移的 AuthViewManager）原先把认证页
 * 以内嵌 WebContentsView 挂到主窗口 contentView，坐标依赖 AUTH_VIEW_TOP(76)、
 * 侧边栏宽度等硬编码常量，与真实页面布局不符，导致平台页面顶栏与应用
 * TabBar/NavBar/页面 header 多层内容挤压重叠（见 PR #1557 及其专项文档
 * 01-docs/PRD-ACCOUNT-LOGIN-WINDOW.md）。
 *
 * 统一改为独立 BrowserWindow 承载后：认证视图拥有独立坐标系（铺满客户区、
 * 从 (0,0) 起算），从根本上消除与主窗口 DOM 的重叠；隔离 session 与凭证
 * 提取等能力不受影响，仅更换承载容器。
 *
 * 待办已完成：AuthViewManager 的同模式实现（_createLoginWindow）保留为认证语义封装，
 * 底层窗口能力已统一到 ./standalone-window（见 createStandaloneAuthWindow）。
 */
const { createStandaloneWindow } = require('./standalone-window')

/**
 * 认证窗口 = 通用独立窗口 + 认证默认标题。
 *
 * 实现已统一收敛到 ./standalone-window（原 #1557 遗留的「切换到本工厂以消除重复
 * 代码」TODO）：认证与其他「打开应用外 URL」场景共用同一份独立窗口实现。
 *
 * 默认尺寸（1180×820 / 最小 900×640）沿用 standalone-window 工厂默认值。
 *
 * @param {Parameters<typeof createStandaloneWindow>[0]} [options]
 * @returns {ReturnType<typeof createStandaloneWindow>}
 */
function createStandaloneAuthWindow(options = {}) {
  return createStandaloneWindow(
    Object.assign({}, options, { title: options.title || '账号登录' })
  )
}

module.exports = { createStandaloneAuthWindow }
