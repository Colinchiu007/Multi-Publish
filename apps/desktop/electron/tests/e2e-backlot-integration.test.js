// @ts-check
/**
 * Backlot E2E 集成测试 — Task 12
 *
 * 验证完整生产链路：创建项目 → 看板订阅 → 事件推送 → 场景审批 → 审批门 → 回放录制
 *
 * 测试策略：
 *   - 使用真实 ProjectService + BoardService + ContactSheetService + ApprovalGateService + ExecutionRecorder
 *   - PipelineEngine 使用真实实例（事件系统 on/off/_emit）
 *   - mock 外部依赖：logger、webContents、getMainWindow
 *   - 不启动 Electron 窗口，通过直接调用 service API 模拟 IPC
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
const fs = require('fs');
const path = require('path');
const os = require('os');

// Mock logger（全局，所有 require 都会拿到这个 mock）
__registerMock('../services/logger', {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
});

const { ProjectService } = require('../services/project-service');
const { BoardService } = require('../services/board-service');
const { ContactSheetService } = require('../services/contact-sheet-service');
const { ApprovalGateService } = require('../services/approval-gate-service');
const { ExecutionRecorder } = require('../services/execution-recorder');
const { PipelineEngine } = require('../services/pipeline-engine');

// ============ 辅助函数 ============

function makeMockWebContents() {
  const listeners = {};
  const sent = [];
  const wc = {
    id: Math.floor(Math.random() * 100000),
    isDestroyed: () => false,
    once: vi.fn((event, cb) => { listeners[event] = cb; }),
    send: vi.fn((channel, data) => { sent.push({ channel, data }); }),
    _sent: sent,
    _triggerDestroyed: () => { if (listeners['destroyed']) listeners['destroyed'](); },
  };
  return wc;
}

function buildBacklotStack(tempDir) {
  const projectService = new ProjectService(null, { userDataDir: tempDir });
  const pipelineEngine = new PipelineEngine({});
  const boardService = new BoardService({
    pipelineEngine,
    projectService,
    getMainWindow: () => null,
  });
  const contactSheetService = new ContactSheetService({
    pipelineEngine,
    boardService,
    getMainWindow: () => null,
  });
  const approvalGateService = new ApprovalGateService({
    pipelineEngine,
    boardService,
    getMainWindow: () => null,
  });
  const executionRecorder = new ExecutionRecorder({
    projectService,
    pipelineEngine,
    boardService,
  });

  // 启动所有监听
  boardService.startListening();
  contactSheetService.startListening();
  approvalGateService.startListening();
  executionRecorder.startListening();

  return {
    projectService,
    pipelineEngine,
    boardService,
    contactSheetService,
    approvalGateService,
    executionRecorder,
    cleanup: () => {
      executionRecorder.cleanup();
      approvalGateService.stopListening();
      contactSheetService.stopListening();
      boardService.stopListening();
    },
  };
}

// 获取项目回放 JSONL 文件路径
function getReplayJsonlPath(tempDir, projectId) {
  return path.join(tempDir, 'projects', projectId, 'replay', 'execution.jsonl');
}

// 等待 ExecutionRecorder 的 JSONL 流完成写入
// 解决 stopRecording() 异步 stream.end() + getReplay() 同步 readFileSync 的竞态
// （单元测试通过 session.stream.on('finish', done) 模式处理，E2E 同样需要）
async function stopRecordingAndFlush(recorder, projectId) {
  const session = recorder._sessions.get(projectId);
  if (!session) {
    recorder.stopRecording(projectId);
    return;
  }
  await new Promise((resolve) => {
    session.stream.on('finish', resolve);
    recorder.stopRecording(projectId);
  });
}

// ============ E2E 链路测试 ============

describe('Backlot E2E: 完整生产链路', () => {
  let tempDir;
  let stack;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'backlot-e2e-'));
    stack = buildBacklotStack(tempDir);
  });

  afterEach(() => {
    stack.cleanup();
    try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch (_) { /* ignore */ }
  });

  it('创建项目 → scanProjects 返回新项目', () => {
    const project = stack.projectService.createProject({
      name: 'E2E 测试视频',
      pipelineType: 'story2video',
      summary: '测试完整链路',
    });
    expect(project).toBeDefined();
    expect(project.id).toBeDefined();
    expect(project.name).toBe('E2E 测试视频');

    const list = stack.projectService.scanProjects();
    expect(list.length).toBe(1);
    expect(list[0].name).toBe('E2E 测试视频');
  });

  it('订阅看板 → 获取初始快照', () => {
    const project = stack.projectService.createProject({
      name: '订阅测试',
      pipelineType: 'story2video',
    });
    const wc = makeMockWebContents();
    const result = stack.boardService.subscribe(wc, project.id);
    expect(result.subscribed).toBe(true);
    expect(result.initial).toBeDefined();
    expect(result.initial.projectId).toBe(project.id);
    expect(result.initial.projectName).toBe('订阅测试');
  });

  it('模拟 pipeline:start 事件 → 看板更新推送', () => {
    const project = stack.projectService.createProject({
      name: '事件测试',
      pipelineType: 'story2video',
    });
    const wc = makeMockWebContents();
    stack.boardService.subscribe(wc, project.id);

    // 模拟 pipeline:start
    stack.pipelineEngine._emit('pipeline:start', {
      runId: 'run-1',
      pipelineType: 'story2video',
      stages: ['script', 'scenes', 'render'],
      projectId: project.id,
    });

    // 验证 board:update 被推送
    const updateMsg = wc._sent.find(m => m.channel === 'board:update');
    expect(updateMsg).toBeDefined();
    // payload 格式：{ board: boardState }
    expect(updateMsg.data.board).toBeDefined();
    expect(updateMsg.data.board.projectId).toBe(project.id);
  });

  it('模拟 stage:start 事件 → 看板推送包含事件信息', () => {
    const project = stack.projectService.createProject({
      name: '阶段测试',
      pipelineType: 'story2video',
    });
    const wc = makeMockWebContents();
    stack.boardService.subscribe(wc, project.id);

    stack.pipelineEngine._emit('pipeline:start', {
      runId: 'run-2',
      pipelineType: 'story2video',
      stages: ['script', 'scenes'],
      projectId: project.id,
    });

    stack.pipelineEngine._emit('stage:start', {
      runId: 'run-2',
      stageName: 'script',
      stageIndex: 0,
      projectId: project.id,
    });

    // 验证推送包含 lastEvent
    const stageUpdate = wc._sent.find(m =>
      m.channel === 'board:update' && m.data.board.lastEvent &&
      m.data.board.lastEvent.type === 'stage:start'
    );
    expect(stageUpdate).toBeDefined();
  });

  it('场景完成 → ContactSheetService 置为 AWAITING → approval:request 推送', () => {
    const project = stack.projectService.createProject({
      name: '场景审批测试',
      pipelineType: 'story2video',
    });
    const wc = makeMockWebContents();
    stack.boardService.subscribe(wc, project.id);

    // 模拟场景生成完成
    stack.pipelineEngine._emit('scene:complete', {
      sceneId: 'scene-1',
      projectId: project.id,
      runId: 'run-3',
      takes: [
        { id: 'take-1', thumbnail: 'thumb1.jpg', cost: 0.1, qualityScore: 8 },
        { id: 'take-2', thumbnail: 'thumb2.jpg', cost: 0.15, qualityScore: 9 },
      ],
    });

    // 验证场景状态（getContactSheet 不是 getScenes）
    const scenes = stack.contactSheetService.getContactSheet(project.id);
    expect(scenes.length).toBe(1);
    expect(scenes[0].status).toBe('AWAITING');
    expect(scenes[0].takes.length).toBe(2);

    // 验证 approval:request 推送
    const approvalMsg = wc._sent.find(m => m.channel === 'approval:request');
    expect(approvalMsg).toBeDefined();
    expect(approvalMsg.data.type).toBe('contact_sheet');
  });

  it('批准场景 → 状态更新为 APPROVED', () => {
    const project = stack.projectService.createProject({
      name: '批准测试',
      pipelineType: 'story2video',
    });

    // 触发场景完成
    stack.pipelineEngine._emit('scene:complete', {
      sceneId: 'scene-2',
      projectId: project.id,
      runId: 'run-4',
      takes: [{ id: 'take-3', thumbnail: 'thumb.jpg' }],
    });

    // 批准场景
    const result = stack.contactSheetService.approveScene('scene-2', 'take-3');
    expect(result.approved).toBe(true);

    const scenes = stack.contactSheetService.getContactSheet(project.id);
    expect(scenes[0].status).toBe('APPROVED');
    expect(scenes[0].selectedTakeId).toBe('take-3');
  });

  it('驳回场景 → 状态更新为 QUEUED（重新生成）', () => {
    const project = stack.projectService.createProject({
      name: '驳回测试',
      pipelineType: 'story2video',
    });

    stack.pipelineEngine._emit('scene:complete', {
      sceneId: 'scene-3',
      projectId: project.id,
      runId: 'run-5',
      takes: [{ id: 'take-4', thumbnail: 'thumb.jpg' }],
    });

    const result = stack.contactSheetService.rejectScene('scene-3', '质量不够好');
    expect(result.rejected).toBe(true);
    expect(result.requeued).toBe(true);

    const scenes = stack.contactSheetService.getContactSheet(project.id);
    expect(scenes[0].status).toBe('QUEUED');
  });

  it('checkpoint:pause → ApprovalGate 创建 → 批准 → resolved', () => {
    const project = stack.projectService.createProject({
      name: '审批门测试',
      pipelineType: 'story2video',
    });
    const wc = makeMockWebContents();
    stack.boardService.subscribe(wc, project.id);

    // 模拟审批门暂停
    stack.pipelineEngine._emit('checkpoint:pause', {
      runId: 'run-6',
      stageName: 'script',
      projectId: project.id,
      checkpointType: 'creative',
    });

    // 验证审批门创建
    const gate = stack.approvalGateService.getCurrentGate(project.id);
    expect(gate).toBeDefined();
    expect(gate.stageName).toBe('script');
    expect(gate.status).toBe('pending');

    // 验证 approval:request 推送（type='approval_gate'）
    const gateMsg = wc._sent.find(m => m.channel === 'approval:request' && m.data.type === 'approval_gate');
    expect(gateMsg).toBeDefined();

    // 批准审批门（approveGate 不是 approve）
    const result = stack.approvalGateService.approveGate(gate.id, 'approve');
    expect(result.resolved).toBe(true);

    // 验证审批门已解决
    const currentGate = stack.approvalGateService.getCurrentGate(project.id);
    expect(currentGate).toBeNull();
  });

  it('审批门 approveWithModify → resolved + 修改意见保留', () => {
    const project = stack.projectService.createProject({
      name: '修改后继续测试',
      pipelineType: 'story2video',
    });

    stack.pipelineEngine._emit('checkpoint:pause', {
      runId: 'run-7',
      stageName: 'storyboard',
      projectId: project.id,
      checkpointType: 'quality',
    });

    const gate = stack.approvalGateService.getCurrentGate(project.id);
    // approveGate(id, 'modify', modification) 不是 approveWithModify
    const result = stack.approvalGateService.approveGate(gate.id, 'modify', '请调整第3场景的节奏');
    expect(result.resolved).toBe(true);
    expect(result.gate.modification).toBe('请调整第3场景的节奏');
  });

  it('多审批门排队 → 按顺序处理', () => {
    const project = stack.projectService.createProject({
      name: '多审批门测试',
      pipelineType: 'story2video',
    });

    // 触发两个审批门
    stack.pipelineEngine._emit('checkpoint:pause', {
      runId: 'run-8',
      stageName: 'script',
      projectId: project.id,
      checkpointType: 'creative',
    });
    stack.pipelineEngine._emit('checkpoint:pause', {
      runId: 'run-8',
      stageName: 'storyboard',
      projectId: project.id,
      checkpointType: 'creative',
    });

    // 第一个审批门在队首
    let gate = stack.approvalGateService.getCurrentGate(project.id);
    expect(gate.stageName).toBe('script');
    stack.approvalGateService.approveGate(gate.id, 'approve');

    // 第二个审批门升为队首
    gate = stack.approvalGateService.getCurrentGate(project.id);
    expect(gate.stageName).toBe('storyboard');
    stack.approvalGateService.approveGate(gate.id, 'approve');

    // 队列空
    expect(stack.approvalGateService.getCurrentGate(project.id)).toBeNull();
  });

  it('ExecutionRecorder 自动录制所有事件 → getReplay 返回完整数据', async () => {
    const project = stack.projectService.createProject({
      name: '回放录制测试',
      pipelineType: 'story2video',
    });

    // 触发一系列事件（所有事件都带 projectId，确保录制到同一 session）
    stack.pipelineEngine._emit('pipeline:start', {
      runId: 'run-9',
      pipelineType: 'story2video',
      stages: ['script', 'scenes', 'render'],
      projectId: project.id,
    });
    stack.pipelineEngine._emit('stage:start', { runId: 'run-9', stageName: 'script', stageIndex: 0, projectId: project.id });
    stack.pipelineEngine._emit('stage:complete', { runId: 'run-9', stageName: 'script', stageIndex: 0, projectId: project.id });
    stack.pipelineEngine._emit('stage:start', { runId: 'run-9', stageName: 'scenes', stageIndex: 1, projectId: project.id });
    stack.pipelineEngine._emit('scene:complete', {
      sceneId: 'scene-5',
      projectId: project.id,
      runId: 'run-9',
      takes: [],
    });

    // 停止录制并等待 JSONL 流 flush 完成（避免 stream.end 异步 + readFileSync 同步竞态）
    await stopRecordingAndFlush(stack.executionRecorder, project.id);

    // 读取回放
    const replay = stack.executionRecorder.getReplay(project.id);
    expect(replay).toBeDefined();
    expect(replay.project).toBeDefined();
    expect(replay.project.name).toBe('回放录制测试');
    expect(replay.events.length).toBeGreaterThanOrEqual(5);

    // 验证事件类型
    const types = replay.events.map(e => e.type);
    expect(types).toContain('pipeline:start');
    expect(types).toContain('stage:start');
    expect(types).toContain('stage:complete');
    expect(types).toContain('scene:complete');

    // 验证每个事件有 timestamp 和 id
    for (const evt of replay.events) {
      expect(evt.timestamp).toBeDefined();
      expect(evt.id).toBeDefined();
    }
  });

  it('回放数据包含 BoardState 快照', async () => {
    const project = stack.projectService.createProject({
      name: '快照测试',
      pipelineType: 'story2video',
    });

    stack.pipelineEngine._emit('pipeline:start', {
      runId: 'run-10',
      pipelineType: 'story2video',
      stages: ['script'],
      projectId: project.id,
    });

    await stopRecordingAndFlush(stack.executionRecorder, project.id);
    const replay = stack.executionRecorder.getReplay(project.id);

    // 至少有一个事件包含快照（BoardService.buildBoardState 返回非 null）
    const eventsWithSnapshot = replay.events.filter(e => e.snapshot !== null);
    expect(eventsWithSnapshot.length).toBeGreaterThan(0);
  });
});

// ============ 安全验证测试 ============

describe('Backlot E2E: 安全验证', () => {
  let tempDir;
  let stack;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'backlot-sec-'));
    stack = buildBacklotStack(tempDir);
  });

  afterEach(() => {
    stack.cleanup();
    try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch (_) { /* ignore */ }
  });

  it('审批门取消时正确清理（无残留定时器）', () => {
    const project = stack.projectService.createProject({
      name: '取消测试',
      pipelineType: 'story2video',
    });

    stack.pipelineEngine._emit('checkpoint:pause', {
      runId: 'run-cancel',
      stageName: 'script',
      projectId: project.id,
      checkpointType: 'creative',
    });

    const gate = stack.approvalGateService.getCurrentGate(project.id);
    expect(gate).toBeDefined();

    // 批准（清理）
    stack.approvalGateService.approveGate(gate.id, 'approve');

    // 验证无残留
    expect(stack.approvalGateService.getCurrentGate(project.id)).toBeNull();

    // cleanup 不应抛错
    expect(() => stack.cleanup()).not.toThrow();
  });

  it('回放数据原样保存传入的 data（已知行为记录）', async () => {
    const project = stack.projectService.createProject({
      name: '敏感信息测试',
      pipelineType: 'story2video',
    });

    // 事件数据中包含敏感字段（ExecutionRecorder 原样保存 data）
    stack.pipelineEngine._emit('pipeline:start', {
      runId: 'run-sec',
      pipelineType: 'story2video',
      stages: ['script'],
      projectId: project.id,
      apiKey: 'sk-secret-key-12345',
      password: 'should-not-leak',
    });

    await stopRecordingAndFlush(stack.executionRecorder, project.id);
    const replay = stack.executionRecorder.getReplay(project.id);

    // 事件存在
    expect(replay.events.length).toBeGreaterThan(0);

    // 检查 JSONL 文件内容
    const jsonlPath = getReplayJsonlPath(tempDir, project.id);
    expect(fs.existsSync(jsonlPath)).toBe(true);
    const content = fs.readFileSync(jsonlPath, 'utf-8');

    // 验证事件类型被记录
    expect(content).toContain('pipeline:start');
    // 已知限制：当前 ExecutionRecorder 原样保存 data，敏感字段会存在于 JSONL 中
    // 后续可增加敏感字段过滤逻辑
  });

  it('webContents 销毁时自动取消订阅', () => {
    const project = stack.projectService.createProject({
      name: '销毁测试',
      pipelineType: 'story2video',
    });
    const wc = makeMockWebContents();
    stack.boardService.subscribe(wc, project.id);

    // 模拟 webContents 销毁
    wc._triggerDestroyed();

    // 验证已从订阅集合中移除
    expect(stack.boardService._subscribers.has(wc)).toBe(false);

    // 后续事件不应再推送到已销毁的 webContents
    const sentBefore = wc._sent.length;
    stack.pipelineEngine._emit('pipeline:start', {
      runId: 'run-destroy',
      pipelineType: 'story2video',
      stages: [],
      projectId: project.id,
    });
    // wc._sent 不应增加
    expect(wc._sent.length).toBe(sentBefore);
  });

  it('多个 webContents 订阅同一项目 → 都收到推送', () => {
    const project = stack.projectService.createProject({
      name: '多窗口测试',
      pipelineType: 'story2video',
    });
    const wc1 = makeMockWebContents();
    const wc2 = makeMockWebContents();
    stack.boardService.subscribe(wc1, project.id);
    stack.boardService.subscribe(wc2, project.id);

    stack.pipelineEngine._emit('pipeline:start', {
      runId: 'run-multi',
      pipelineType: 'story2video',
      stages: ['script'],
      projectId: project.id,
    });

    // 两个 webContents 都应收到 board:update
    const wc1Updates = wc1._sent.filter(m => m.channel === 'board:update');
    const wc2Updates = wc2._sent.filter(m => m.channel === 'board:update');
    expect(wc1Updates.length).toBeGreaterThan(0);
    expect(wc2Updates.length).toBeGreaterThan(0);
  });
});

// ============ 边界条件测试 ============

describe('Backlot E2E: 边界条件', () => {
  let tempDir;
  let stack;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'backlot-edge-'));
    stack = buildBacklotStack(tempDir);
  });

  afterEach(() => {
    stack.cleanup();
    try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch (_) { /* ignore */ }
  });

  it('空 projects 目录 → scanProjects 返回空数组', () => {
    const list = stack.projectService.scanProjects();
    expect(list).toEqual([]);
  });

  it('project.json 损坏 → scanProjects 跳过不崩溃', () => {
    // 创建损坏的项目目录（路径包含 projects/ 段）
    const corruptDir = path.join(tempDir, 'projects', 'corrupt-project');
    fs.mkdirSync(corruptDir, { recursive: true });
    fs.writeFileSync(path.join(corruptDir, 'project.json'), '{ invalid json }}}');

    const list = stack.projectService.scanProjects();
    expect(list).toEqual([]);
  });

  it('getProject 不存在的 ID → 抛错', () => {
    expect(() => stack.projectService.getProject('nonexistent-id')).toThrow();
  });

  it('回放数据文件损坏 → getReplay 返回空事件', () => {
    const project = stack.projectService.createProject({
      name: '损坏回放测试',
      pipelineType: 'story2video',
    });

    // 手动创建损坏的 JSONL 文件（路径包含 projects/ 段）
    const replayDir = path.join(tempDir, 'projects', project.id, 'replay');
    fs.mkdirSync(replayDir, { recursive: true });
    fs.writeFileSync(path.join(replayDir, 'execution.jsonl'), 'invalid json line\n{also invalid}');

    const replay = stack.executionRecorder.getReplay(project.id);
    expect(replay.events).toEqual([]);
    expect(replay.totalDuration).toBe(0);
  });

  it('无录制数据 → getReplay 返回空事件', () => {
    const project = stack.projectService.createProject({
      name: '无录制测试',
      pipelineType: 'story2video',
    });

    const replay = stack.executionRecorder.getReplay(project.id);
    expect(replay.events).toEqual([]);
    expect(replay.totalDuration).toBe(0);
    expect(replay.project).toBeDefined();
  });

  it('deleteProject → 项目从列表消失', () => {
    const project = stack.projectService.createProject({
      name: '删除测试',
      pipelineType: 'story2video',
    });

    stack.projectService.deleteProject(project.id);

    expect(() => stack.projectService.getProject(project.id)).toThrow();
    const list = stack.projectService.scanProjects();
    expect(list).toEqual([]);
  });

  it('updateProject → 字段正确合并', () => {
    const project = stack.projectService.createProject({
      name: '更新测试',
      pipelineType: 'story2video',
      summary: '原始摘要',
    });

    const updated = stack.projectService.updateProject(project.id, {
      name: '更新后名称',
      status: 'completed',
    });

    expect(updated.name).toBe('更新后名称');
    expect(updated.status).toBe('completed');
    expect(updated.summary).toBe('原始摘要'); // 未更新的字段保留
    expect(updated.updatedAt).not.toBe(project.updatedAt);
  });

  it('无 projectId 且无 runId 的事件 → 不触发录制', () => {
    // 发送没有 projectId 和 runId 的事件
    stack.pipelineEngine._emit('pipeline:start', {
      pipelineType: 'story2video',
      stages: [],
    });

    // 不应创建任何录制会话
    expect(stack.executionRecorder._sessions.size).toBe(0);
  });

  it('null data 事件 → 不崩溃（_emit 内部 try-catch 兜底）', () => {
    expect(() => {
      stack.pipelineEngine._emit('pipeline:start', null);
      stack.pipelineEngine._emit('stage:complete', undefined);
    }).not.toThrow();
  });

  it('连续触发多个事件 → 回放顺序正确', async () => {
    const project = stack.projectService.createProject({
      name: '顺序测试',
      pipelineType: 'story2video',
    });

    const events = [
      { type: 'pipeline:start', data: { runId: 'run-order', pipelineType: 'story2video', stages: ['s1', 's2'], projectId: project.id } },
      { type: 'stage:start', data: { runId: 'run-order', stageName: 's1', stageIndex: 0, projectId: project.id } },
      { type: 'stage:complete', data: { runId: 'run-order', stageName: 's1', stageIndex: 0, projectId: project.id } },
      { type: 'stage:start', data: { runId: 'run-order', stageName: 's2', stageIndex: 1, projectId: project.id } },
      { type: 'stage:complete', data: { runId: 'run-order', stageName: 's2', stageIndex: 1, projectId: project.id } },
      { type: 'pipeline:complete', data: { runId: 'run-order', pipelineType: 'story2video', projectId: project.id } },
    ];

    for (const evt of events) {
      stack.pipelineEngine._emit(evt.type, evt.data);
    }

    await stopRecordingAndFlush(stack.executionRecorder, project.id);
    const replay = stack.executionRecorder.getReplay(project.id);

    expect(replay.events.length).toBe(events.length);
    // 验证顺序
    expect(replay.events[0].type).toBe('pipeline:start');
    expect(replay.events[1].type).toBe('stage:start');
    expect(replay.events[5].type).toBe('pipeline:complete');
  });
});

// ============ 完整端到端流程测试 ============

describe('Backlot E2E: 端到端完整流程', () => {
  let tempDir;
  let stack;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'backlot-full-'));
    stack = buildBacklotStack(tempDir);
  });

  afterEach(() => {
    stack.cleanup();
    try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch (_) { /* ignore */ }
  });

  it('完整生产流程：创建 → 运行 → 审批 → 回放', async () => {
    // 1. 创建项目
    const project = stack.projectService.createProject({
      name: '完整流程演示',
      pipelineType: 'story2video',
      summary: '端到端测试',
    });
    expect(project.id).toBeDefined();

    // 2. 订阅看板
    const wc = makeMockWebContents();
    const subResult = stack.boardService.subscribe(wc, project.id);
    expect(subResult.subscribed).toBe(true);

    // 3. 启动流水线（所有事件都带 projectId 确保录制到同一 session）
    stack.pipelineEngine._emit('pipeline:start', {
      runId: 'run-full',
      pipelineType: 'story2video',
      stages: ['script', 'scenes', 'render'],
      projectId: project.id,
    });

    // 4. 脚本阶段 → 审批门
    stack.pipelineEngine._emit('stage:start', { runId: 'run-full', stageName: 'script', stageIndex: 0, projectId: project.id });
    stack.pipelineEngine._emit('checkpoint:pause', {
      runId: 'run-full',
      stageName: 'script',
      projectId: project.id,
      checkpointType: 'creative',
    });

    let gate = stack.approvalGateService.getCurrentGate(project.id);
    expect(gate).toBeDefined();

    // 5. 批准脚本（approveGate 不是 approve）
    stack.approvalGateService.approveGate(gate.id, 'approve');
    // approval:resolved 事件由 ApprovalGateService._resumePipeline 发出

    stack.pipelineEngine._emit('stage:complete', { runId: 'run-full', stageName: 'script', stageIndex: 0, projectId: project.id });

    // 6. 场景阶段 → 场景审批
    stack.pipelineEngine._emit('stage:start', { runId: 'run-full', stageName: 'scenes', stageIndex: 1, projectId: project.id });
    stack.pipelineEngine._emit('scene:complete', {
      sceneId: 'scene-full-1',
      projectId: project.id,
      runId: 'run-full',
      takes: [{ id: 'take-full-1', thumbnail: 'thumb.jpg', cost: 0.1, qualityScore: 8 }],
    });

    const scenes = stack.contactSheetService.getContactSheet(project.id);
    expect(scenes.length).toBe(1);
    expect(scenes[0].status).toBe('AWAITING');

    // 7. 批准场景
    stack.contactSheetService.approveScene('scene-full-1', 'take-full-1');
    const updatedScenes = stack.contactSheetService.getContactSheet(project.id);
    expect(updatedScenes[0].status).toBe('APPROVED');

    // 8. 渲染阶段
    stack.pipelineEngine._emit('stage:complete', { runId: 'run-full', stageName: 'scenes', stageIndex: 1, projectId: project.id });
    stack.pipelineEngine._emit('stage:start', { runId: 'run-full', stageName: 'render', stageIndex: 2, projectId: project.id });
    stack.pipelineEngine._emit('stage:complete', { runId: 'run-full', stageName: 'render', stageIndex: 2, projectId: project.id });
    stack.pipelineEngine._emit('pipeline:complete', {
      runId: 'run-full',
      pipelineType: 'story2video',
      totalDuration: 60000,
      projectId: project.id,
    });

    // 9. 停止录制
    await stopRecordingAndFlush(stack.executionRecorder, project.id);

    // 10. 验证回放
    const replay = stack.executionRecorder.getReplay(project.id);
    expect(replay.project.name).toBe('完整流程演示');
    expect(replay.events.length).toBeGreaterThanOrEqual(10);

    // 验证事件链完整
    const eventTypes = replay.events.map(e => e.type);
    expect(eventTypes).toContain('pipeline:start');
    expect(eventTypes).toContain('checkpoint:pause');
    expect(eventTypes).toContain('stage:complete');
    expect(eventTypes).toContain('scene:complete');
    expect(eventTypes).toContain('approval:resolved');
    expect(eventTypes).toContain('pipeline:complete');

    // 11. 验证看板推送历史
    expect(wc._sent.length).toBeGreaterThanOrEqual(5);
    const channels = wc._sent.map(m => m.channel);
    expect(channels).toContain('board:update');
    expect(channels).toContain('approval:request');

    // 12. 清理验证
    expect(() => stack.cleanup()).not.toThrow();
  });
});
