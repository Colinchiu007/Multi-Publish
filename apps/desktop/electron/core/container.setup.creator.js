'use strict';

/**
 * Container setup 分片：博主监控与采集（2026-10-07，PRD-CREATOR-MONITOR-COLLECT）
 *
 * 为什么从 container.setup.js 拆出来：
 *   装配这三项需要 20+ 行注释与依赖串接，顶上去会让 container.setup.js 撞上
 *   check-max-lines 的 500 行硬限（NEW_OVER_LIMIT，新代码不得引入超大文件）。
 *   仓库对这条红线的既定处方是「拆兄弟模块」而不是 `--update` 挂账——
 *   挂账等于承认「接受漂移」，而这个文件是全仓所有主进程服务的注册总表，
 *   让它无限增长只会把真正的结构问题藏进台账里。
 *
 * 装配顺序有依赖：creatorStore 需要 store，creatorCollector 需要凭证提供者，
 * creatorRuntime 依赖前两者。容器按注册顺序惰性求值，get 不到未注册名会抛，
 * 故这里显式串起来而不是让 runtime 自己去 get。
 */
function registerCreatorServices(container) {
  container.register('creatorStore', function(c) {
    const { createCreatorStore } = require('../services/creator-store');
    const store = c.get('store');
    // getDb 是主路径；db 是历史字段名，两条都兜住以免 store 换实现时静默拿到 undefined
    // （undefined 会在建表时才炸，离装配点很远，排查成本高）。
    const db = typeof store.getDb === 'function' ? store.getDb() : store.db;
    return createCreatorStore(db);
  });

  container.register('creatorCollector', function(c) {
    const { createCreatorCollector } = require('../services/creator-collector-runtime');
    return createCreatorCollector({
      // 凭证提供者是可选注册项：未接入时回落空实现而不是让 get 抛，
      // 否则「没配 Key」会变成「整个容器起不来」——两者的可恢复性完全不同。
      credentialProvider: c.get('creatorCredentialProvider') || (() => null),
      log: c.get('logger'),
    });
  });

  container.register('creatorRuntime', function(c) {
    const { createCreatorRuntime } = require('../services/creator-runtime');
    return createCreatorRuntime({
      store: c.get('creatorStore'),
      collector: c.get('creatorCollector'),
      log: c.get('logger'),
    });
  });
}

module.exports = { registerCreatorServices };
