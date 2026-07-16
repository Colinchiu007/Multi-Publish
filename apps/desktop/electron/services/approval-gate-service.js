// @ts-check
/**
 * ApprovalGateService — 审批门服务（Backlot Task 7）
 *
 * 职责：
 *   - 监听 PipelineEngine 的 checkpoint:pause 事件，创建审批门
 *   - 支持 approve / approveWithModify 两种决策模式
 *   - 维护审批门队列（多门排队）
 *   - 推送 approval:request（type='approval_gate'）到渲染进程
 *
 * 审批门类型：
 *   - script: 脚本审批门
 *   - storyboard: 分镜审批门
 *   - scene_assets: 场景素材审批门
 *
 * 决策模式（requiredDecision）：
 *   - approve: 仅通过/拒绝
 *   - approve_or_modify: 通过 或 修改后继续
 */

'use strict';

const log = require('./logger');

class ApprovalGateService {
  /**
   * @param {object} deps
   * @param {object} deps.pipelineEngine - PipelineEngine 实例
   * @param {object} [deps.boardService] - BoardService 实例
   * @param {Function} [deps.getMainWindow] - 获取主窗口函数
   */
  constructor(deps) {
    this.pipelineEngine = deps.pipelineEngine;
    this.boardService = deps.boardService || null;
    this.getMainWindow = deps.getMainWindow || (() => null);

    // projectId → ApprovalGate[]（待处理队列）
    this._gates = new Map();
    // gateId → projectId 映射
    this._gateProject = new Map();
    this._unsubscribers = [];
    this._listening = false;
    this._gateIdCounter = 0;
  }

  startListening() {
    if (this._listening) return;
    this._listening = true;
    const unsub = this.pipelineEngine.on('checkpoint:pause', (data) => this._onCheckpointPause(data || {}));
    this._unsubscribers.push(unsub);
    log.info('ApprovalGateService', 'Started listening to checkpoint:pause');
  }

  stopListening() {
    for (const unsub of this._unsubscribers) {
      try { unsub(); } catch (_) { /* ignore */ }
    }
    this._unsubscribers = [];
    this._listening = false;
  }

  /**
   * 获取项目当前待处理的审批门
   * @param {string} projectId
   * @returns {ApprovalGate|null}
   */
  getCurrentGate(projectId) {
    if (!projectId) return null;
    const gates = this._gates.get(projectId);
    if (!gates || gates.length === 0) return null;
    return gates[0];
  }

  /**
   * 处理审批决策
   * @param {string} gateId
   * @param {string} decision - 'approve' | 'modify'
   * @param {string} [modification] - 修改意见（decision='modify' 时必填）
   * @returns {{ resolved: boolean, gate?: ApprovalGate }}
   */
  approveGate(gateId, decision, modification) {
    const projectId = this._gateProject.get(gateId);
    if (!projectId) {
      log.warn('ApprovalGateService', 'approveGate: gate not found: ' + gateId);
      return { resolved: false };
    }

    const gates = this._gates.get(projectId);
    if (!gates || gates.length === 0) {
      return { resolved: false };
    }

    const gate = gates.find(g => g.id === gateId);
    if (!gate) return { resolved: false };
    if (gate.status !== 'pending') {
      log.warn('ApprovalGateService', 'Gate already resolved: ' + gateId);
      return { resolved: false };
    }

    if (decision === 'approve') {
      gate.status = 'approved';
      gate.resolvedAt = new Date().toISOString();
      // 通知 PipelineEngine 恢复
      this._resumePipeline(projectId, { decision: 'approve' });
    } else if (decision === 'modify') {
      if (!modification) {
        log.warn('ApprovalGateService', 'modify decision requires modification text');
        return { resolved: false };
      }
      gate.status = 'modified';
      gate.modification = modification;
      gate.resolvedAt = new Date().toISOString();
      // 通知 PipelineEngine 带修改意见恢复
      this._resumePipeline(projectId, { decision: 'modify', modification });
    } else {
      log.warn('ApprovalGateService', 'Unknown decision: ' + decision);
      return { resolved: false };
    }

    // 从队列移除已处理的 gate
    const idx = gates.indexOf(gate);
    if (idx !== -1) gates.splice(idx, 1);

    // 通知 BoardService 推送更新
    this._notifyBoard(projectId);

    // 如果队列中还有下一个 gate，推送它
    if (gates.length > 0) {
      this._pushGate(projectId, gates[0]);
    }

    return { resolved: true, gate };
  }

  /**
   * 内部：处理 checkpoint:pause 事件
   * @private
   */
  _onCheckpointPause(eventData) {
    const { runId, stageName, checkpointType, projectId } = eventData;
    if (!projectId && !runId) {
      log.warn('ApprovalGateService', 'checkpoint:pause missing projectId/runId');
      return;
    }

    const pid = projectId || runId;
    if (!this._gates.has(pid)) {
      this._gates.set(pid, []);
    }

    // 创建审批门
    const gate = {
      id: 'gate_' + (++this._gateIdCounter),
      projectId: pid,
      type: checkpointType || this._inferGateType(stageName),
      stageName: stageName || '',
      status: 'pending',
      requiredDecision: this._getRequiredDecision(checkpointType),
      content: this._extractApprovalContent(eventData),
      context: eventData.context || {},
      createdAt: new Date().toISOString(),
    };

    this._gateProject.set(gate.id, pid);
    this._gates.get(pid).push(gate);

    log.info('ApprovalGateService',
      'Created approval gate ' + gate.id + ' (type: ' + gate.type + ', project: ' + pid + ')');

    // 如果是队列中的第一个，立即推送
    const gates = this._gates.get(pid);
    if (gates.length === 1) {
      this._pushGate(pid, gate);
    }

    // 通知 BoardService
    this._notifyBoard(pid);
  }

  /**
   * 推送审批门到渲染进程
   * @private
   */
  _pushGate(projectId, gate) {
    const payload = {
      type: 'approval_gate',
      gateId: gate.id,
      projectId,
      gateType: gate.type,
      stageName: gate.stageName,
      requiredDecision: gate.requiredDecision,
      content: gate.content,
      context: gate.context,
      createdAt: gate.createdAt,
    };

    const mainWin = this.getMainWindow();
    if (mainWin && mainWin.webContents) {
      try {
        if (!mainWin.webContents.isDestroyed()) {
          mainWin.webContents.send('approval:request', payload);
        }
      } catch (e) {
        log.warn('ApprovalGateService', 'Failed to push gate via mainWin: ' + e.message);
      }
    }

    // 通过 BoardService 订阅者推送
    if (this.boardService) {
      const subscribers = this.boardService._subscribers;
      for (const wc of subscribers) {
        try {
          if (wc && !wc.isDestroyed() && wc.send) {
            wc.send('approval:request', payload);
          }
        } catch (_) { /* ignore */ }
      }
    }
  }

  /**
   * 通知 BoardService 推送更新
   * @private
   */
  _notifyBoard(projectId) {
    if (!this.boardService) return;
    try {
      const board = this.boardService.buildBoardState(projectId);
      if (board) {
        board.pendingGates = (this._gates.get(projectId) || []).length;
        this.boardService._pushToSubscribers(board);
      }
    } catch (e) {
      log.warn('ApprovalGateService', 'Failed to notify board: ' + e.message);
    }
  }

  /**
   * 恢复 PipelineEngine 执行
   * @private
   */
  _resumePipeline(projectId, payload) {
    if (!this.pipelineEngine) return;
    try {
      if (typeof this.pipelineEngine.resume === 'function') {
        this.pipelineEngine.resume();
      }
      // 通知监听者审批已通过
      this.pipelineEngine._emit('approval:resolved', { projectId, ...payload });
      log.info('ApprovalGateService', 'Pipeline resumed for project ' + projectId);
    } catch (e) {
      log.warn('ApprovalGateService', 'Failed to resume pipeline: ' + e.message);
    }
  }

  /**
   * 根据阶段名推断审批门类型
   * @private
   */
  _inferGateType(stageName) {
    if (!stageName) return 'generic';
    if (stageName.includes('script')) return 'script';
    if (stageName.includes('storyboard') || stageName.includes('scenes')) return 'storyboard';
    if (stageName.includes('assets') || stageName.includes('scene')) return 'scene_assets';
    return 'generic';
  }

  /**
   * 根据审批门类型获取决策模式
   * @private
   */
  _getRequiredDecision(checkpointType) {
    if (checkpointType === 'script') return 'approve_or_modify';
    if (checkpointType === 'storyboard') return 'approve_or_modify';
    return 'approve';
  }

  /**
   * 从事件数据提取审批内容
   * @private
   */
  _extractApprovalContent(eventData) {
    if (eventData.content) return eventData.content;
    if (eventData.context) {
      // 尝试从 context 中提取脚本/分镜等内容
      if (eventData.context.script) return eventData.context.script;
      if (eventData.context.storyboard) return eventData.context.storyboard;
    }
    return '';
  }

  /**
   * 清理项目的所有审批门（用于项目删除等场景）
   * @param {string} projectId
   */
  clearProjectGates(projectId) {
    const gates = this._gates.get(projectId) || [];
    for (const g of gates) {
      this._gateProject.delete(g.id);
    }
    this._gates.delete(projectId);
  }
}

module.exports = { ApprovalGateService };
