/**
 * creator-wiring.js — 博主监控的依赖组装
 *
 * ## 为什么单独成文件
 *
 * 方案评审定的决断（PRD-CREATOR-WIRING-2026-10-07 §1）：`creatorMonitor` 必须在
 * **IPC 注册点**组装，不能在容器装配期组。两个原因各自独立成立：
 *   ① 门面依赖 store，而装配期 sql.js 尚未就绪，`store.db` 是 null；
 *   ② 门面要从容器取 runtime 与 monitor 两个模块，容器装配期它们还不一定已注册。
 * 把组装逻辑抽出来是为了**可测**：装配点本身是 `phase5-ipc` 这种大文件，
 * 组装错了很难在单测里定位。
 *
 * ## 门面而不是别名
 *
 * 成员一律用箭头函数包一层再转发，**不用解构**：
 *   错：const { collectOne } = runtime        // 丢 this
 *   对：collectOne: (...a) => runtime.collectOne(...a)
 * 当前 runtime 的方法恰好是闭包、解构也能跑，但那是实现细节；
 * 一旦哪个方法改成读 `this.store`，解构版会在运行时静默炸。
 * 箭头转发不依赖这个假设。
 *
 * 门面上**恰含 4 个方法**（PRD §1），`ipc-contract` 与本模块的锁都按此断言。
 */

'use strict'

const { PROBE_POOL, COLLECT_POOL } = require('./creator-store.discoveries')
const { assertQuotaFits } = require('./creator-monitor')

/** 门面的方法名清单。注册锁按此断言「恰含 4 个」，多一个少一个都红。 */
const FACADE_METHODS = ['assertQuotaFits', 'probeCreator', 'collectOne', 'collectBatch']

/**
 * 组装 creatorMonitor 门面。
 * @param {{creatorRuntime: object, creatorMonitorModule?: object}} deps
 * @returns {{assertQuotaFits: Function, probeCreator: Function, collectOne: Function, collectBatch: Function}}
 */
function createCreatorMonitorFacade (deps) {
  const { creatorRuntime, creatorMonitorModule } = deps || {}
  if (!creatorRuntime) {
    // 缺依赖时抛而不是返回空对象：空门面会让上层拿到 undefined 方法，
    // 错误延后到调用点，报错信息完全指不回根因。
    throw new Error('createCreatorMonitorFacade 需要 creatorRuntime')
  }
  const monitorModule = creatorMonitorModule || require('./creator-monitor')

  return {
    // 纯函数：直接从 creator-monitor 取，保留原始 this 语义
    assertQuotaFits: (...a) => monitorModule.assertQuotaFits(...a),
    probeCreator: (...a) => creatorRuntime.probeCreator(...a),
    collectOne: (...a) => creatorRuntime.collectOne(...a),
    collectBatch: (...a) => creatorRuntime.collectBatch(...a),
  }
}

/**
 * 产出 creatorQuota：把 store 的账本方法包成「预检 + 记账」两个动作。
 * 池默认取自 discoveries 模块的常量，避免「探测池 1500、采集池 200」
 * 这两个数字散落在调用点。
 */
function createCreatorQuota (store, opts = {}) {
  const probePool = typeof opts.probePool === 'number' ? opts.probePool : PROBE_POOL
  const collectPool = typeof opts.collectPool === 'number' ? opts.collectPool : COLLECT_POOL

  if (!store || typeof store.canSpend !== 'function') {
    throw new Error('createCreatorQuota 需要带 canSpend/spend 的 store')
  }

  return {
    probePool,
    collectPool,
    /** 只读预检：超池即拒，**不写账本**（拒绝必须零副作用） */
    canSpend: (kind, units) => store.canSpend(kind, units, kind === 'probe' ? probePool : collectPool),
    /** 记账：只在 finalizeCollected 的事务内被调用 */
    spend: (kind, units, sig) => store.spend(kind, units, sig),
  }
}

module.exports = { createCreatorMonitorFacade, createCreatorQuota, FACADE_METHODS, assertQuotaFits }
