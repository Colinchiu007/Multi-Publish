// @ts-check
/**
 * BoardService — Backlot 实时生产看板服务（OpenMontage 集成）
 *
 * 职责：
 *   - 订阅 PipelineEngine 事件（pipeline:start/complete/fail, stage:start/complete/fail, checkpoint:pause）
 *   - 构建 BoardState 快照（项目状态 + 阶段进度 + 当前操作）
 *   - 通过 webContents.send('board:update', boardState) 推送给订阅的渲染进程
 *   - 管理 webContents 订阅/取消订阅
 *
 * 设计原则：
 *   - 轻量级：不持久化 BoardState，每次事件触发时从 PipelineEngine 实时构建
 *   - 可扩展：后续 ContactSheet/ApprovalGate 事件可接入同一推送通道
 *   - 安全：webContents 销毁时自动清理订阅
 */

'use strict';

const log = require('./logger');

class BoardService {
  /**
   * @param {object} deps
   * @param {object} deps.pipelineEngine - PipelineEngine 实例（需有 on/off/_emit）
   * @param {object} [deps.projectService] - ProjectService 实例（用于项目元数据）
   * @param {Function} [deps.getMainWindow] - 获取主窗口函数（返回 BrowserWindow 或 null）
   */
  constructor(deps) {
    this.pipelineEngine = deps.pipelineEngine;
    this.projectService = deps.projectService || null;
    this.getMainWindow = deps.getMainWindow || (() => null);

    // 订阅的 webContents Set（每个 webContents 对应一个渲染进程标签页）
    this._subscribers = new Set();
    // 当前订阅的 PipelineEngine 事件取消函数
    this._unsubscribers = [];
    // 当前跟踪的 runId → projectId 映射
    this._runProjectMap = new Map();
    // 是否已启动监听
    this._listening = false;
  }

  /**
   * 启动 PipelineEngine 事件监听
   */
  startListening() {
    if (this._listening) return;
    this._listening = true;

    const events = [
      'pipeline:start',
      'stage:start',
      'stage:complete',
      'stage:fail',
      'pipeline:complete',
      'pipeline:fail',
      'checkpoint:pause',
    ];

    for (const evt of events) {
      const unsub = this.pipelineEngine.on(evt, (data) => this._handleEvent(evt, data));
      this._unsubscribers.push(unsub);
    }

    log.info('BoardService', 'Started listening to PipelineEngine events');
  }

  /**
   * 停止监听
   */
  stopListening() {
    for (const unsub of this._unsubscribers) {
      try { unsub(); } catch (_) { /* ignore */ }
    }
    this._unsubscribers = [];
    this._listening = false;
    log.info('BoardService', 'Stopped listening');
  }

  /**
   * 订阅看板更新（webContents 级别）
   * @param {object} webContents - Electron webContents
   * @param {string} projectId - 要订阅的项目 ID
   * @returns {{ subscribed: boolean, initial?: object }}
   */
  subscribe(webContents, projectId) {
    if (!webContents) return { subscribed: false };

    this._subscribers.add(webContents);
    this._currentProjectId = projectId;

    // webContents 销毁时自动清理
    if (webContents.once) {
      webContents.once('destroyed', () => {
        this._subscribers.delete(webContents);
      });
    }

    // 构建初始快照
    const initial = this.buildBoardState(projectId);
    return { subscribed: true, initial };
  }

  /**
   * 取消订阅
   * @param {object} webContents
   * @returns {{ unsubscribed: boolean }}
   */
  unsubscribe(webContents) {
    this._subscribers.delete(webContents);
    return { unsubscribed: true };
  }

  /**
   * 构建看板状态快照
   * @param {string} projectId
   * @returns {object|null} BoardState
   */
  buildBoardState(projectId) {
    if (!projectId) return null;

    // 从 ProjectService 获取项目元数据
    let project = null;
    if (this.projectService) {
      try {
        project = this.projectService.getProject(projectId);
      } catch (_) {
        // 项目不存在时返回 null
        return null;
      }
    }

    // 从 PipelineEngine 获取运行状态
    const run = this._getCurrentRun();
    const stages = run ? run.stages.map((s, i) => ({
      name: s.name,
      status: s.status,
      startedAt: s.startedAt,
      completedAt: s.completedAt,
      duration: s.startedAt && s.completedAt
        ? Math.round((new Date(s.completedAt) - new Date(s.startedAt)) / 1000)
        : 0,
      cost: 0,
      error: s.status === 'failed' ? (run.error || '') : null,
    })) : (project ? project.stages || [] : []);

    const currentStageIndex = run ? run.currentStage : -1;
    const status = run ? run.status : (project ? project.status : 'idle');

    return {
      projectId,
      projectName: project ? project.name : 'Unknown',
      status,
      currentStageIndex,
      stages,
      totalEstimatedCost: project ? project.totalCost || 0 : 0,
      totalActualCost: 0,
      currentOperation: run ? this._describeCurrentOperation(run) : 'idle',
      startedAt: run ? run.createdAt : (project ? project.createdAt : null),
      elapsed: run ? Math.round((Date.now() - new Date(run.createdAt).getTime()) / 1000) : 0,
      updatedAt: new Date().toISOString(),
    };
  }

  /**
   * 处理 PipelineEngine 事件
   * @private
   */
  _handleEvent(eventType, data) {
    // 记录 runId → projectId 映射
    if (eventType === 'pipeline:start' && data.runId) {
      // 暂时用 runId 作为 projectId 的代理（实际应从 params 传入）
      this._runProjectMap.set(data.runId, this._currentProjectId || data.runId);
    }

    // 查找 projectId：优先从 runId 映射，fallback 到当前订阅的 projectId
    const projectId = (data.runId && this._runProjectMap.get(data.runId)) || this._currentProjectId;
    if (!projectId) return;

    // 构建并推送看板状态
    const board = this.buildBoardState(projectId);
    if (board) {
      board.lastEvent = { type: eventType, data, timestamp: new Date().toISOString() };
      this._pushToSubscribers(board);
    }

    // 流水线结束时清理映射
    if (eventType === 'pipeline:complete' || eventType === 'pipeline:fail') {
      if (data.runId) this._runProjectMap.delete(data.runId);
    }
  }

  /**
   * 推送看板状态到所有订阅者
   * @private
   */
  _pushToSubscribers(boardState) {
    const payload = { board: boardState };
    for (const wc of this._subscribers) {
      try {
        if (wc && !wc.isDestroyed() && wc.send) {
          wc.send('board:update', payload);
        }
      } catch (e) {
        log.warn('BoardService', 'Failed to push board update: ' + e.message);
      }
    }
    // 也推送到主窗口（确保看板页面可见时能收到）
    const mainWin = this.getMainWindow();
    if (mainWin && mainWin.webContents) {
      try {
        if (!mainWin.webContents.isDestroyed()) {
          mainWin.webContents.send('board:update', payload);
        }
      } catch (_) { /* ignore */ }
    }
  }

  /**
   * 获取当前 PipelineEngine 运行
   * @private
   */
  _getCurrentRun() {
    if (!this.pipelineEngine || !this.pipelineEngine._getCurrentRun) return null;
    return this.pipelineEngine._getCurrentRun();
  }

  /**
   * 描述当前操作
   * @private
   */
  _describeCurrentOperation(run) {
    if (!run || !run.stages) return 'idle';
    const stage = run.stages[run.currentStage];
    if (!stage) return 'completing';
    return stage.name + ' (' + stage.status + ')';
  }
}

module.exports = { BoardService };
