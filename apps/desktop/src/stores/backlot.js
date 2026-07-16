// @ts-check
/**
 * Backlot Pinia Store — OpenMontage 集成
 *
 * 集中管理：
 *   - 项目库列表（projects）
 *   - 当前看板状态（currentBoard）
 *   - 待审批列表（pendingApprovals，Task 7/8 ApprovalGate 接入后填充）
 *   - 加载/错误状态
 *
 * 设计原则：
 *   - IPC push 监听在 store 外部（useBacklot composable）注册生命周期
 *   - store 仅持有状态 + 同步/异步 action，不直接持有 ipcRenderer 引用
 *   - 通过 window.electronAPI 调用 preload 暴露的 API
 */
import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

export const useBacklotStore = defineStore('backlot', () => {
  // ─── State ───
  /** @type {import('vue').Ref<Array>} 项目列表 */
  const projects = ref([])
  /** @type {import('vue').Ref<object|null>} 当前看板状态 */
  const currentBoard = ref(null)
  /** @type {import('vue').Ref<Array>} 待审批项 */
  const pendingApprovals = ref([])
  /** @type {import('vue').Ref<boolean>} 加载中 */
  const loading = ref(false)
  /** @type {import('vue').Ref<string|null>} 错误信息 */
  const error = ref(null)
  /** @type {import('vue').Ref<boolean>} 最近一次审批是否已被用户关闭（避免重复弹窗） */
  const lastApprovalDismissed = ref(false)
  /** @type {import('vue').Ref<string|null>} 当前订阅看板的 projectId */
  const subscribedProjectId = ref(null)

  // ─── Getters ───
  /** 当前运行中的项目（status === 'running'） */
  const runningProject = computed(() =>
    projects.value.find(p => p && p.status === 'running') || null
  )

  /** 是否有待审批项 */
  const hasPendingApprovals = computed(() => pendingApprovals.value.length > 0)

  /** 当前项目（按 subscribedProjectId 或 runningProject） */
  const currentProject = computed(() => {
    if (!subscribedProjectId.value) return runningProject.value
    return projects.value.find(p => p && p.id === subscribedProjectId.value) || null
  })

  // ─── Actions ───
  /**
   * 加载项目列表
   * @returns {Promise<Array>}
   */
  async function loadProjects() {
    const api = window.electronAPI
    if (!api || !api.project || !api.project.list) {
      error.value = 'electronAPI.project.list 不可用'
      return []
    }
    loading.value = true
    error.value = null
    try {
      const res = await api.project.list()
      // 兼容两种响应：{ code: 0, data: [...] } 或直接数组
      if (res && res.code === 0 && Array.isArray(res.data)) {
        projects.value = res.data
      } else if (Array.isArray(res)) {
        projects.value = res
      } else {
        projects.value = []
      }
      return projects.value
    } catch (e) {
      error.value = e && e.message ? e.message : String(e)
      projects.value = []
      return []
    } finally {
      loading.value = false
    }
  }

  /**
   * 删除项目
   * @param {string} projectId
   * @returns {Promise<boolean>}
   */
  async function deleteProject(projectId) {
    const api = window.electronAPI
    if (!api || !api.project || !api.project.del) return false
    try {
      await api.project.del(projectId)
      projects.value = projects.value.filter(p => p && p.id !== projectId)
      if (subscribedProjectId.value === projectId) {
        subscribedProjectId.value = null
        currentBoard.value = null
      }
      return true
    } catch (e) {
      error.value = e && e.message ? e.message : String(e)
      return false
    }
  }

  /**
   * 订阅看板推送
   * @param {string} projectId
   * @returns {Promise<object|null>} 初始看板状态
   */
  async function subscribeBoard(projectId) {
    const api = window.electronAPI
    if (!api || !api.board || !api.board.subscribe) return null
    try {
      const res = await api.board.subscribe(projectId)
      subscribedProjectId.value = projectId
      // res: { subscribed, initial }
      if (res && res.initial) {
        currentBoard.value = res.initial
      } else {
        currentBoard.value = null
      }
      return res
    } catch (e) {
      error.value = e && e.message ? e.message : String(e)
      return null
    }
  }

  /**
   * 取消看板订阅
   * @returns {Promise<void>}
   */
  async function unsubscribeBoard() {
    const api = window.electronAPI
    if (!api || !api.board || !api.board.unsubscribe) return
    try {
      await api.board.unsubscribe()
    } catch (e) {
      // 静默失败
    } finally {
      subscribedProjectId.value = null
      currentBoard.value = null
    }
  }

  /**
   * 主动拉取看板状态（无订阅时使用）
   * @param {string} projectId
   * @returns {Promise<object|null>}
   */
  async function fetchBoard(projectId) {
    const api = window.electronAPI
    if (!api || !api.board || !api.board.get) return null
    try {
      const res = await api.board.get(projectId)
      if (res && res.code === 0 && res.data) {
        currentBoard.value = res.data
        return res.data
      } else if (res && !res.code) {
        // 直接返回 BoardState
        currentBoard.value = res
        return res
      }
      return null
    } catch (e) {
      error.value = e && e.message ? e.message : String(e)
      return null
    }
  }

  /**
   * 处理 board:update 推送（由 useBacklot composable 调用）
   * @param {object} board - BoardState
   */
  function handleBoardUpdate(board) {
    if (!board) return
    currentBoard.value = board
  }

  // ─── 审批相关（待 Task 7/8 ApprovalGate 接入） ───
  /**
   * 添加待审批项（ApprovalGate 推送时调用）
   * @param {object} approval
   */
  function addApproval(approval) {
    if (!approval) return
    pendingApprovals.value.push(approval)
    lastApprovalDismissed.value = false
  }

  /**
   * 批准审批项
   * @param {string} approvalId
   * @returns {Promise<boolean>}
   */
  async function approve(approvalId) {
    const api = window.electronAPI
    // Task 7/8 未完成时，approval.approve API 可能不存在
    if (!api || !api.approval || !api.approval.approve) {
      pendingApprovals.value = pendingApprovals.value.filter(a => a && a.id !== approvalId)
      return true
    }
    try {
      await api.approval.approve(approvalId)
      pendingApprovals.value = pendingApprovals.value.filter(a => a && a.id !== approvalId)
      return true
    } catch (e) {
      error.value = e && e.message ? e.message : String(e)
      return false
    }
  }

  /**
   * 驳回审批项
   * @param {string} approvalId
   * @param {string} [reason]
   * @returns {Promise<boolean>}
   */
  async function reject(approvalId, reason) {
    const api = window.electronAPI
    if (!api || !api.approval || !api.approval.reject) {
      pendingApprovals.value = pendingApprovals.value.filter(a => a && a.id !== approvalId)
      return true
    }
    try {
      await api.approval.reject(approvalId, reason)
      pendingApprovals.value = pendingApprovals.value.filter(a => a && a.id !== approvalId)
      return true
    } catch (e) {
      error.value = e && e.message ? e.message : String(e)
      return false
    }
  }

  /** 关闭审批弹窗（仅 UI 状态） */
  function dismissApproval() {
    lastApprovalDismissed.value = true
  }

  /** 清空错误 */
  function clearError() {
    error.value = null
  }

  return {
    // state
    projects,
    currentBoard,
    pendingApprovals,
    loading,
    error,
    lastApprovalDismissed,
    subscribedProjectId,
    // getters
    runningProject,
    hasPendingApprovals,
    currentProject,
    // actions
    loadProjects,
    deleteProject,
    subscribeBoard,
    unsubscribeBoard,
    fetchBoard,
    handleBoardUpdate,
    addApproval,
    approve,
    reject,
    dismissApproval,
    clearError,
  }
})
