/**
 * update 命名空间文案（locales 结构拆分，FRONTEND-FILE-SPLIT-PLAN-2026-10 v3）
 * 从 locales/en.js 拆出，键名与拆出前完全一致；zh/en 成对维护（CI Gate 7）。
 */
export default {
    badge: 'New version',
    badgeReady: 'Restart to install',
    badgeRetry: 'Retry install',
    badgeDownloading: (ctx) => 'Downloading ' + ctx.named('percent') + '%',
    badgeTitleAvailable: (ctx) => 'Version v' + ctx.named('version') + ' is available. Click to quit the app and install it.',
    badgeTitleReady: (ctx) => 'Version v' + ctx.named('version') + ' has been downloaded. Click to quit the app and install it.',
    badgeTitleDownloading: (ctx) => 'Downloading v' + ctx.named('version') + '; the app will quit and install automatically when done.',
    badgeTitleRetry: 'The previous install did not finish. Click to retry.',
    badgeAriaLabel: 'A new version is available. Click to quit the app and install it.',
    installingHint: 'Downloading the new version; the app will quit and install automatically when done.',
    latestVersion: 'You are on the latest version',
    failedPrefix: 'Update failed: ',
  }
