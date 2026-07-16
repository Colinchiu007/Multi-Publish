// @ts-check
/**
 * useBacklot.js — Backlot 集成 composable
 *
 * 三个子 composable：
 *   - useProjectList() — 加载项目列表 + 刷新
 *   - useLiveBoard(projectIdRef) — 订阅看板推送 + 自动取消订阅（onUnmounted）
 *   - useApprovalFlow() — 审批流程通用逻辑
 *
 * 设计原则：
 *   - IPC push 监听的生命周期由 composable 管理（onMounted 注册 / onUnmounted 注销）
 *   - 不直接访问 ipcRenderer，通过 window.electronAPI
 *   - 兼容测试环境（无 window.electronAPI 时降级为 noop）
 *   - 使用 storeToRefs 将 store 的 state/getter 转为 ref，保持响应性
 */
import { computed, onUnmounted, ref, unref } from 'vue'
import { storeToRefs } from 'pinia'
import { useBacklotStore } from '@/stores/backlot'

/**
 * 项目列表 composable
 *
 * 用法：
 *   const { projects, loading, error, refresh, deleteProject } = useProjectList()
 *   onMounted(() => refresh())
 *
 * @returns {object}
 */
export function useProjectList() {
  const store = useBacklotStore()
  const { projects, loading, error, runningProject } = storeToRefs(store)
  const refreshed = ref(false)

  async function refresh() {
    await store.loadProjects()
    refreshed.value = true
  }

  async function deleteProject(projectId) {
    return await store.deleteProject(projectId)
  }

  return {
    projects,
    loading,
    error,
    runningProject,
    refreshed,
    refresh,
    deleteProject,
  }
}

/**
 * 实时看板 composable
 *
 * 用法：
 *   const projectId = ref('xxx')
 *   const { board, subscribe, unsubscribe } = useLiveBoard(projectId)
 *   onMounted(subscribe)
 *   onUnmounted(unsubscribe)
 *
 * @param {import('vue').Ref<string|null>|string} projectIdRef - 项目 ID（响应式或常量）
 * @returns {object}
 */
export function useLiveBoard(projectIdRef) {
  const store = useBacklotStore()
  const { currentBoard: board, subscribedProjectId } = storeToRefs(store)
  /** @type {null | (() => void)} board:update 取消监听函数 */
  let unsubUpdate = null

  async function subscribe() {
    const projectId = unref(projectIdRef)
    if (!projectId) return
    // 注册 board:update 推送监听
    const api = window.electronAPI
    if (api && api.board && api.board.onUpdate) {
      unsubUpdate = api.board.onUpdate((boardState) => {
        store.handleBoardUpdate(boardState)
      })
    }
    await store.subscribeBoard(projectId)
  }

  async function unsubscribe() {
    if (unsubUpdate) {
      try { unsubUpdate() } catch (_) { /* 静默 */ }
      unsubUpdate = null
    }
    await store.unsubscribeBoard()
  }

  async function refresh() {
    const projectId = unref(projectIdRef)
    if (!projectId) return
    await store.fetchBoard(projectId)
  }

  // 自动生命周期管理（仅在组件上下文中生效）
  try {
    onUnmounted(() => {
      if (unsubUpdate) {
        try { unsubUpdate() } catch (_) { /* 静默 */ }
        unsubUpdate = null
      }
    })
  } catch (_) {
    // 非组件上下文（如测试中直接调用），不注册生命周期钩子
  }

  return {
    board,
    subscribedProjectId,
    subscribe,
    unsubscribe,
    refresh,
  }
}

/**
 * 审批流程 composable
 *
 * 用法：
 *   const { pendingApprovals, hasPending, approve, reject, dismiss } = useApprovalFlow()
 *
 * @returns {object}
 */
export function useApprovalFlow() {
  const store = useBacklotStore()

  /** 待审批列表（响应式 ref） */
  const pendingApprovals = computed(() => store.pendingApprovals)
  /** 是否有待审批 */
  const hasPending = computed(() => store.hasPendingApprovals)
  /** 当前弹窗显示的审批项（取第一个，响应式） */
  const currentApproval = computed(() =>
    store.pendingApprovals.length > 0 ? store.pendingApprovals[0] : null
  )

  async function approve(approvalId) {
    return await store.approve(approvalId)
  }

  async function reject(approvalId, reason) {
    return await store.reject(approvalId, reason)
  }

  function dismiss() {
    store.dismissApproval()
  }

  /** 添加审批项（外部推送调用） */
  function addApproval(approval) {
    store.addApproval(approval)
  }

  return {
    pendingApprovals,
    hasPending,
    currentApproval,
    approve,
    reject,
    dismiss,
    addApproval,
  }
}
