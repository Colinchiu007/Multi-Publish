/**
 * update 命名空间文案（locales 结构拆分，FRONTEND-FILE-SPLIT-PLAN-2026-10 v3）
 * 从 locales/zh.js 拆出，键名与拆出前完全一致；zh/en 成对维护（CI Gate 7）。
 */
export default {
    badge: '新版本',
    badgeReady: '重启安装',
    badgeRetry: '重试安装',
    badgeDownloading: (ctx) => '下载中 ' + ctx.named('percent') + '%',
    badgeTitleAvailable: (ctx) => '发现新版本 v' + ctx.named('version') + '，点击后退出应用并安装',
    badgeTitleReady: (ctx) => '新版本 v' + ctx.named('version') + ' 已下载，点击后退出应用并安装',
    badgeTitleDownloading: (ctx) => '正在下载新版本 v' + ctx.named('version') + '，完成后将自动退出应用并安装',
    badgeTitleRetry: '上次安装未完成，点击重试',
    badgeAriaLabel: '应用有新版本，点击后退出应用并安装新版本',
    installingHint: '正在下载新版本，完成后将自动退出应用并安装',
    latestVersion: '当前已是最新版本',
    failedPrefix: '更新失败：',
  }
