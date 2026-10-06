/**
 * runBatchPublish.js — 批量发布的提交编排（从 useBatchPublish.js 拆出，逐文件行数门禁）。
 *
 * 拆分理由：useBatchPublish.js 同时承担「条目状态管理 + 字段面构造 + 提交编排 +
 * 进度订阅与轮询」，行数已逼近门禁阈值并连续触发 LEDGER_GREW。提交编排这一段
 * （校验 → 确认 → 离线分支 → batchCreate → batchSchedule / batchExecute + 轮询）
 * 自成一体，与条目编辑逻辑无关，单独成文件更清晰也便于单独测试。
 *
 * 依赖注入约定：编排需要一批外部依赖（refs、校验器、通知、IPC、进度回调）。
 * 统一由工厂参数 deps 解构并**闭包捕获**，本文件不声明第二份真源；
 * 调用方（useBatchPublish.js）传入它自己闭包里的同一批引用，行为与拆分前完全一致。
 */

export function createBatchPublisher (deps) {
  const {
    batchPublishing, articles, ensureLogin,
    notifyWarning, notifyError, notifySuccess, notifyConfirm,
    formatUserError, progressText,
    isAccountAvailable, validatePublishTargets, validatePublishMetadata,
    validatePlatformContent, validateScheduleEntries, buildPublishTargets,
    convertBatchArticleItem,
    offlineStatus, offlineAddToCache, buildCacheTargets, buildBatchArticlePayload,
    toPlainJson, batchCreate, batchSchedule, batchExecute, batchGet, onBatchProgress,
    clearBatchTracking, batchProgress, failedBatchTasks, scheduledBatchId,
    publishProgressStore, totalPlatformTasks,
    batchStatusPollMaxAttempts, batchStatusPollIntervalMs,
    progressHandles,
  } = deps

  async function handleBatchPublish () {
    if (batchPublishing.value) return
    // 主动操作登录门：未登录弹登录窗口，登录成功后继续批量发布
    if (!(await ensureLogin({ message: '批量发布功能需要登录后使用，是否立即登录？' }))) return
    batchPublishing.value = true

    let keepPublishingLock = false
    try {
      // 平台字数限制体系：逐条目收集截断记录（PRD §F3），确认弹窗汇总提示
      const conversionSummaries = []
      // 验证每篇文章
      for (const a of articles.value) {
        if (!a.title.trim()) {
          notifyWarning('publishPage.batchNotify.missingTitle')
          return
        }
        if (!a.content.trim()) {
          notifyWarning('publishPage.batchNotify.missingContent')
          return
        }
        if (!a.platforms || a.platforms.length === 0) {
          notifyWarning('publishPage.batchNotify.noPlatform', { params: { title: a.title.slice(0, 20) } })
          return
        }
        if (isAccountAvailable) {
          const targetCheck = validatePublishTargets(buildPublishTargets(a.platforms, a.accounts || a.selectedAccounts || {}))
          if (!targetCheck.valid) {
            notifyWarning('publishPage.batchNotify.targetInvalid', { params: { message: targetCheck.message } })
            return
          }
        }
        const metadataCheck = validatePublishMetadata({
          ...a,
          tags: a.tagsText || a.tags,
          topics: a.topicsText || a.topics,
          mentions: a.mentionsText || a.mentions,
          images: a.images || a.image_files,
          image_files: a.image_files || a.images,
        })
        if (!metadataCheck.valid) {
          notifyWarning('publishPage.batchNotify.metadataInvalid', { params: { title: a.title.slice(0, 20), message: metadataCheck.message } })
          return
        }
        // 平台字数限制体系（PRD-PLATFORM-CHAR-LIMITS-2026-10-02 §F3/§F4）：
        // ① 应用级 10000 字截断（写回条目，用户可见）；
        // ② 按平台生成差异化覆盖截断（取代「超限整批中止」——转换后仍超限才中止）。
        // 逐条目收集截断记录，确认弹窗汇总提示。转换编排单一实现在
        // platform-content-conversion.convertBatchArticleItem（单篇/批量共口径）。
        for (const notice of convertBatchArticleItem(a)) {
          conversionSummaries.push({
            title: a.title.slice(0, 20),
            detail: progressText(notice.key, notice.params),
          })
        }
        const contentCheck = validatePlatformContent({
          platforms: a.platforms,
          article: { title: a.title, content: a.content },
          platformOverrides: a.platformOverrides,
        })
        if (!contentCheck.valid) {
          notifyWarning('publishPage.batchNotify.contentInvalid', {
            params: { title: a.title.slice(0, 20), message: contentCheck.message },
          })
          return
        }
        if (
          isAccountAvailable &&
          buildPublishTargets(a.platforms, a.accounts || a.selectedAccounts || {})
            .some(target => target.accountId && !isAccountAvailable(target.platform, target.accountId))
        ) {
          notifyWarning('publishPage.batchNotify.accountInvalid')
          return
        }
      }

      const scheduleEntries = articles.value.flatMap(function (a) {
        if (!a.publishTime) return []
        return buildPublishTargets(
          a.platforms || [],
          a.accounts || a.selectedAccounts || {},
        ).map(function (target) {
          return { ...target, publishTime: a.publishTime }
        })
      })
      const scheduleCheck = validateScheduleEntries(scheduleEntries, { translate: (k, p) => progressText(`publishPage.scheduleValidation.${k}`, p) })
      if (!scheduleCheck.valid) {
        notifyWarning('publishPage.batchNotify.scheduleInvalid', { params: { message: scheduleCheck.message } })
        return
      }

      const confirmed = await notifyConfirm('publishPage.batchNotify.confirmMessage', {
        params: {
          count: articles.value.length,
          tasks: totalPlatformTasks.value,
          ...(conversionSummaries.length > 0
            ? { converted: progressText('publishPage.batchNotify.contentConverted', {
                count: conversionSummaries.length,
                details: conversionSummaries.map(item => `「${item.title}」${item.detail}`).join('；'),
              }) }
            : {}),
        },
        title: progressText('publishPage.batchNotify.confirmTitle'),
        confirmButtonText: progressText('publishPage.batchNotify.confirmButton'),
        cancelButtonText: progressText('publishPage.batchNotify.cancelButton'),
        type: 'warning',
      })
      if (!confirmed) return

      clearBatchTracking()
      batchProgress.value = []
      failedBatchTasks.value = []
      // publish-progress-ux：阶段级本地监听已删除——该监听在 finally 无条件注销，
      // 而 batchExecute 返回后任务才真正执行，阶段事件本就无人接收（死代码）。
      // 阶段进度由全局 store 的 App 级订阅承载（PublishProgressPanel）；本页保留
      // batch:progress 任务级监听 + batchGet 有界轮询驱动页面进度卡。

      // 离线检测（与单篇 usePublishFlow 对齐）：离线时不硬发，逐篇进离线缓存。
      // 平台侧定时（2026-10-07）：带 publishTime 的条目**不走离线缓存** ——
      // 定时创建只是把排期提交给平台（主进程 batch:schedule，不依赖渲染层在线态），
      // 而离线缓存形状 {targets, data} **不含 publishTime** ⇒ 网络恢复后立即发布。
      const offlineRes = articles.value.some(a => a.publishTime)
        ? { code: 0, data: { offline: false } }
        : await offlineStatus()
      if (offlineRes && offlineRes.code === 0 && offlineRes.data && offlineRes.data.offline) {
        let cachedCount = 0
        for (const a of articles.value) {
          const cacheRes = await offlineAddToCache(toPlainJson({
            targets: buildCacheTargets(a),
            data: buildBatchArticlePayload(a),
          }))
          if (!cacheRes || cacheRes.code !== 0 || cacheRes.data === false) {
            const message = formatUserError(cacheRes, {
              fallback: progressText('publishPage.batchNotify.offlineCacheFailed'),
            }).message
            batchProgress.value.push({
              text: progressText('publishPage.batchNotify.offlineCacheFailed') + ': ' + message,
              time: new Date().toLocaleTimeString('zh-CN'),
              type: 'danger',
            })
            notifyError('publishPage.batchNotify.offlineCacheFailed', { message })
            return
          }
          cachedCount += 1
        }
        batchProgress.value.push({
          text: progressText('publishPage.batchNotify.offlineCached', { count: cachedCount }),
          time: new Date().toLocaleTimeString('zh-CN'),
          type: 'warning',
        })
        notifyWarning('publishPage.batchNotify.offlineCached', { params: { count: cachedCount } })
        return
      }

      const createRes = await batchCreate(toPlainJson({
        name: progressText('publishPage.batchNotify.batchNamePrefix') + new Date().toLocaleDateString('zh-CN'),
        articles: articles.value.map(buildBatchArticlePayload),
      }))

      if (!createRes || createRes.code !== 0) {
        throw new Error((createRes && createRes.message) || '创建批量任务失败')
      }
      if (!createRes.data || !createRes.data.id) {
        throw new Error('创建批量任务失败：响应缺少批次 ID')
      }

      const batchId = createRes.data.id
      // 检查是否有定时任务
      const hasScheduled = articles.value.some(function (a) { return a.publishTime })
      if (hasScheduled) {
        const scheduleRes = await batchSchedule(batchId)
        if (!scheduleRes || scheduleRes.code !== 0) {
          throw new Error((scheduleRes && scheduleRes.message) || progressText('publishPage.batchNotify.scheduleFailedFallback'))
        }
        // 排期成功才暴露取消入口（失败时不留可取消的幽灵状态）
        scheduledBatchId.value = batchId
        batchProgress.value.push({
          text: progressText('publishPage.batchNotify.progressScheduled', { count: articles.value.length }),
          time: new Date().toLocaleTimeString('zh-CN'),
          type: 'success',
        })
      } else {
        const expectedTaskCount = totalPlatformTasks.value
        let receivedTaskCount = 0
        let succeededTaskCount = 0
        let failedTaskCount = 0
        let completedBeforeSubscribe = false
        let batchSettled = false
        let pollAttempts = 0
        const seenTaskIds = new Set()

        const finishBatchProgress = function (counts) {
          if (batchSettled) return
          batchSettled = true
          batchPublishing.value = false
          const succeeded = counts && Number.isInteger(counts.succeeded)
            ? counts.succeeded
            : succeededTaskCount
          const failed = counts && Number.isInteger(counts.failed)
            ? counts.failed
            : failedTaskCount
          const total = counts && Number.isInteger(counts.total)
            ? counts.total
            : expectedTaskCount

          if (failed === total && total > 0) {
            notifyError('publishPage.batchNotify.publishAllFailed', { params: { failed } })
          } else if (failed > 0) {
            notifyWarning('publishPage.batchNotify.publishPartial', { params: { succeeded, failed } })
          } else {
            notifySuccess('publishPage.batchNotify.publishSuccess', { params: { succeeded } })
          }

          if (progressHandles.stop) clearBatchTracking()
          else completedBeforeSubscribe = true
        }

        const unsubscribe = onBatchProgress(function (data) {
          if (!data || (data.batchId && data.batchId !== batchId)) return
          if (data.kind === 'batch-complete') {
            finishBatchProgress(data)
            return
          }
          if (data.taskId && seenTaskIds.has(data.taskId)) return
          if (data.taskId) seenTaskIds.add(data.taskId)

          const title = String(data.title || '').slice(0, 20)
          const platform = data.platform || progressText('publishPage.batchNotify.unknownPlatform')
          batchProgress.value.push({
            text: data.ok
              ? progressText('publishPage.batchNotify.progressTaskSuccess', { platform, title })
              : progressText('publishPage.batchNotify.progressTaskFailed', { platform, title, message: data.message || progressText('publishPage.batchNotify.taskFailedFallback') }),
            time: new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }),
            type: data.ok ? 'success' : 'danger',
          })
          if (!data.ok && typeof data.taskId === 'string' && data.taskId &&
              !failedBatchTasks.value.some(task => task.taskId === data.taskId)) {
            failedBatchTasks.value.push({
              taskId: data.taskId,
              platform,
              title,
            })
          }

          receivedTaskCount += 1
          if (data.ok) succeededTaskCount += 1
          else failedTaskCount += 1
          if (receivedTaskCount >= expectedTaskCount) finishBatchProgress()
        })
        progressHandles.stop = typeof unsubscribe === 'function' ? unsubscribe : null
        if (completedBeforeSubscribe) clearBatchTracking()

        const executeRes = await batchExecute(batchId)
        if (!executeRes || executeRes.code !== 0) {
          throw new Error((executeRes && executeRes.message) || '批量执行失败')
        }
        // publish-progress-ux：登记全局会话（按 batchId 归属）——全局面板跨路由跟踪，
        // 任务条目由进度事件按 batchId 动态归入（PRD-PUBLISH-PROGRESS-UX §5.4）
        publishProgressStore.registerSession({
          batchId,
          title: progressText('publishPage.batchNotify.batchNamePrefix') + new Date().toLocaleDateString('zh-CN'),
        })
        const executeContract = executeRes.data && typeof executeRes.data === 'object'
          ? executeRes.data
          : executeRes
        const acceptedCount = Number.isInteger(executeContract.accepted)
          ? executeContract.accepted
          : expectedTaskCount
        const enqueueFailedCount = Number.isInteger(executeContract.failed)
          ? executeContract.failed
          : 0
        batchProgress.value.push({
          text: enqueueFailedCount > 0
            ? progressText('publishPage.batchNotify.progressAcceptedPartial', { accepted: acceptedCount, failed: enqueueFailedCount })
            : progressText('publishPage.batchNotify.progressAccepted', { accepted: acceptedCount }),
          time: new Date().toLocaleTimeString('zh-CN'),
          type: 'primary',
        })

        const pollBatchStatus = async function () {
          if (batchSettled) return
          pollAttempts += 1
          try {
            if (typeof batchGet === 'function') {
              const statusRes = await batchGet(batchId)
              const status = statusRes && statusRes.code === 0 ? statusRes.data : null
              if (status && status.status === 'done') {
                const completed = Number.isInteger(status.completed) ? status.completed : expectedTaskCount
                const failed = Number.isInteger(status.failed) ? status.failed : failedTaskCount
                finishBatchProgress({
                  total: Number.isInteger(status.total) ? status.total : expectedTaskCount,
                  succeeded: Math.max(0, completed - failed),
                  failed,
                })
                return
              }
            }
          } catch (_) {
            // IPC 瞬时失败由下一次有界轮询重试，达到上限后统一提示。
          }

          if (batchSettled) return
          if (pollAttempts >= batchStatusPollMaxAttempts) {
            batchSettled = true
            batchPublishing.value = false
            notifyError('publishPage.batchNotify.statusTimeout')
            clearBatchTracking()
            return
          }
          scheduleBatchStatusPoll()
        }

        const scheduleBatchStatusPoll = function () {
          if (batchSettled) return
          progressHandles.timer = setTimeout(function () {
            progressHandles.timer = null
            void pollBatchStatus()
          }, batchStatusPollIntervalMs)
          if (progressHandles.timer && typeof progressHandles.timer.unref === 'function') {
            progressHandles.timer.unref()
          }
        }

        if (!batchSettled) {
          keepPublishingLock = true
          scheduleBatchStatusPoll()
        }
      }
    } catch (e) {
      keepPublishingLock = false
      clearBatchTracking()
      batchProgress.value.push({
        text: progressText('publishPage.batchNotify.progressFailed', { message: formatUserError(e, { fallback: progressText('publishPage.batchNotify.unknownError') }).message }),
        time: new Date().toLocaleTimeString('zh-CN'),
        type: 'danger',
      })
    } finally {
      if (!keepPublishingLock) batchPublishing.value = false
    }
  }

  return handleBatchPublish
}
