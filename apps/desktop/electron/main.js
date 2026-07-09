// @ts-nocheck
/**
 * main.js — 应用入口（已拆分为 bootstrap/window/shutdown 三件套）
 *
 * 职责：编排启动流程，自身不持有业务逻辑
 *   1. createAppContext()           同步初始化基础设施（DI 容器消费 + taskQueue 接线）
 *   2. registerShutdownHandlers()   注册 window-all-closed 退出清理
 *   3. runWhenReady()               注册 app.whenReady 回调（内含 createWindow）
 *   4. activate 事件                macOS 重新激活时重建窗口
 */
const { app, BrowserWindow } = require('electron')
const { createAppContext, runWhenReady } = require('./bootstrap')
const { createWindow } = require('./window')
const { registerShutdownHandlers } = require('./shutdown')

// 同步初始化基础设施（DI 容器消费 + taskQueue 接线 + 基础设施构建）
const context = createAppContext()

// 注册 window-all-closed 退出清理
registerShutdownHandlers(context)

// 注册 app.whenReady 回调（pythonBridge / store / callbackServer / createWindow 等）
runWhenReady(context, { createWindow })

// macOS：点击 Dock 图标时若窗口已全部关闭则重建主窗口
app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow(context)
})
