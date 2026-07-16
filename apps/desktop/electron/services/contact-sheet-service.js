// @ts-check
/**
 * ContactSheetService — 场景素材审批服务（Backlot Task 5）
 *
 * 职责：
 *   - 维护项目内每个场景的 takes（候选素材）和审批状态
 *   - 监听 PipelineEngine 的 scene:complete 事件，将场景置为 AWAITING
 *   - 通过 safeSend 推送 approval:request（type='contact_sheet'）到渲染进程
 *   - 提供 approveScene / rejectScene API
 *   - 所有场景审批完成后通知 PipelineEngine 继续下一阶段
 *
 * 场景状态机：
 *   QUEUED → GENERATING → AWAITING → APPROVED | REJECTED
 *   REJECTED → QUEUED (重新生成)
 */

'use strict';

const log = require('./logger');

class ContactSheetService {
  /**
   * @param {object} deps
   * @param {object} deps.pipelineEngine - PipelineEngine 实例
   * @param {object} [deps.boardService] - BoardService 实例（可选，用于状态同步）
   * @param {Function} [deps.getMainWindow] - 获取主窗口函数
   */
  constructor(deps) {
    this.pipelineEngine = deps.pipelineEngine;
    this.boardService = deps.boardService || null;
    this.getMainWindow = deps.getMainWindow || (() => null);

    // projectId → Map<sceneId, Scene>
    this._projectScenes = new Map();
    // runId → projectId 映射
    this._runProjectMap = new Map();
    this._unsubscribers = [];
    this._listening = false;
  }

  /**
   * 启动 PipelineEngine 事件监听
   */
  startListening() {
    if (this._listening) return;
    this._listening = true;

    const events = ['scene:complete', 'scene:fail', 'pipeline:start'];
    for (const evt of events) {
      const unsub = this.pipelineEngine.on(evt, (data) => this._handleEvent(evt, data));
      this._unsubscribers.push(unsub);
    }
    log.info('ContactSheetService', 'Started listening to PipelineEngine events');
  }

  stopListening() {
    for (const unsub of this._unsubscribers) {
      try { unsub(); } catch (_) { /* ignore */ }
    }
    this._unsubscribers = [];
    this._listening = false;
  }

  /**
   * 获取项目的所有场景审批数据
   * @param {string} projectId
   * @returns {Scene[]}
   */
  getContactSheet(projectId) {
    if (!projectId) return [];
    const scenes = this._projectScenes.get(projectId);
    return scenes ? Array.from(scenes.values()) : [];
  }

  /**
   * 批准场景的某个 take
   * @param {string} sceneId
   * @param {string} [selectedTakeId]
   * @returns {{ approved: boolean, scene?: Scene, allApproved?: boolean }}
   */
  approveScene(sceneId, selectedTakeId) {
    const scene = this._findSceneById(sceneId);
    if (!scene) {
      log.warn('ContactSheetService', 'approveScene: scene not found: ' + sceneId);
      return { approved: false };
    }

    scene.status = 'APPROVED';
    if (selectedTakeId) {
      scene.selectedTakeId = selectedTakeId;
    }
    scene.approvedAt = new Date().toISOString();

    // 通知 BoardService 推送更新
    this._notifyBoard(scene.projectId);

    // 检查所有场景是否已审批/完成
    const allApproved = this._checkAllApproved(scene.projectId);
    if (allApproved) {
      // 所有场景审批完成，通知 PipelineEngine 继续
      this._notifyPipelineContinue(scene.projectId);
    }

    return { approved: true, scene, allApproved };
  }

  /**
   * 驳回场景，触发重新生成
   * @param {string} sceneId
   * @param {string} [feedback]
   * @returns {{ rejected: boolean, requeued: boolean, scene?: Scene }}
   */
  rejectScene(sceneId, feedback) {
    const scene = this._findSceneById(sceneId);
    if (!scene) {
      log.warn('ContactSheetService', 'rejectScene: scene not found: ' + sceneId);
      return { rejected: false, requeued: false };
    }

    scene.status = 'REJECTED';
    scene.feedback = feedback || '';
    scene.rejectedAt = new Date().toISOString();

    // 重新入队
    scene.status = 'QUEUED';
    scene.takes = [];
    scene.selectedTakeId = null;

    // 通知 BoardService 推送更新
    this._notifyBoard(scene.projectId);

    // 通知 PipelineEngine 重新生成（通过 scene:retry 事件）
    if (this.pipelineEngine) {
      try {
        this.pipelineEngine._emit('scene:retry', {
          sceneId,
          projectId: scene.projectId,
          feedback,
        });
      } catch (e) {
        log.warn('ContactSheetService', 'scene:retry emit failed: ' + e.message);
      }
    }

    return { rejected: true, requeued: true, scene };
  }

  /**
   * 内部：场景完成事件处理
   * @private
   */
  _onSceneComplete(eventData) {
    const { runId, sceneId, takes, projectId } = eventData;
    const pid = projectId || this._runProjectMap.get(runId);
    if (!pid || !sceneId) return;

    // 确保项目场景 Map 存在
    if (!this._projectScenes.has(pid)) {
      this._projectScenes.set(pid, new Map());
    }
    const scenes = this._projectScenes.get(pid);

    // 更新场景状态为 AWAITING
    const scene = scenes.get(sceneId) || {
      id: sceneId,
      projectId: pid,
      index: scenes.size + 1,
      name: eventData.sceneName || ('Scene ' + (scenes.size + 1)),
      status: 'QUEUED',
      takes: [],
    };

    scene.status = 'AWAITING';
    scene.takes = takes || [];
    scene.completedAt = new Date().toISOString();

    scenes.set(sceneId, scene);

    // 推送 approval:request 到渲染进程
    this._pushApprovalRequest(pid, {
      type: 'contact_sheet',
      sceneId,
      projectId: pid,
      sceneName: scene.name,
      takes: scene.takes,
    });

    log.info('ContactSheetService',
      'Scene ' + sceneId + ' awaiting approval (takes: ' + (scene.takes.length || 0) + ')');
  }

  /**
   * 事件处理分发
   * @private
   */
  _handleEvent(eventType, data) {
    if (eventType === 'pipeline:start' && data && data.runId) {
      // 不在此处建立 runId → projectId 映射，由 BoardService 负责
      // ContactSheetService 通过 scene 事件中的 projectId 字段工作
      return;
    }
    if (eventType === 'scene:complete') {
      this._onSceneComplete(data || {});
      return;
    }
    if (eventType === 'scene:fail') {
      const sceneId = data && data.sceneId;
      const pid = data && data.projectId;
      if (pid && sceneId && this._projectScenes.has(pid)) {
        const scenes = this._projectScenes.get(pid);
        const scene = scenes.get(sceneId);
        if (scene) {
          scene.status = 'FAILED';
          scene.error = data.error || 'Generation failed';
          this._notifyBoard(pid);
        }
      }
    }
  }

  /**
   * 查找场景
   * @private
   */
  _findSceneById(sceneId) {
    for (const scenes of this._projectScenes.values()) {
      if (scenes.has(sceneId)) {
        return scenes.get(sceneId);
      }
    }
    return null;
  }

  /**
   * 检查项目所有场景是否都已审批/完成
   * @private
   */
  _checkAllApproved(projectId) {
    const scenes = this._projectScenes.get(projectId);
    if (!scenes || scenes.size === 0) return false;
    for (const scene of scenes.values()) {
      if (scene.status !== 'APPROVED' && scene.status !== 'COMPLETED') {
        return false;
      }
    }
    return true;
  }

  /**
   * 通知 PipelineEngine 继续下一阶段
   * @private
   */
  _notifyPipelineContinue(projectId) {
    if (!this.pipelineEngine) return;
    try {
      this.pipelineEngine._emit('contact_sheet:all_approved', { projectId });
      log.info('ContactSheetService', 'All scenes approved for project ' + projectId);
    } catch (e) {
      log.warn('ContactSheetService', 'Failed to notify pipeline continue: ' + e.message);
    }
  }

  /**
   * 通知 BoardService 推送看板更新
   * @private
   */
  _notifyBoard(projectId) {
    if (!this.boardService) return;
    try {
      const board = this.boardService.buildBoardState(projectId);
      if (board) {
        // 附加场景列表到看板状态
        board.scenes = this.getContactSheet(projectId);
        this.boardService._pushToSubscribers(board);
      }
    } catch (e) {
      log.warn('ContactSheetService', 'Failed to notify board: ' + e.message);
    }
  }

  /**
   * 推送 approval:request 到渲染进程
   * @private
   */
  _pushApprovalRequest(projectId, payload) {
    const mainWin = this.getMainWindow();
    if (mainWin && mainWin.webContents) {
      try {
        if (!mainWin.webContents.isDestroyed()) {
          mainWin.webContents.send('approval:request', payload);
        }
      } catch (e) {
        log.warn('ContactSheetService', 'Failed to push approval:request: ' + e.message);
      }
    }
    // 同时通过 BoardService 的订阅者推送
    if (this.boardService) {
      try {
        const subscribers = this.boardService._subscribers;
        for (const wc of subscribers) {
          try {
            if (wc && !wc.isDestroyed() && wc.send) {
              wc.send('approval:request', payload);
            }
          } catch (_) { /* ignore individual subscriber failure */ }
        }
      } catch (_) { /* ignore */ }
    }
  }
}

module.exports = { ContactSheetService };
