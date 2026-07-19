// @ts-check
/**
 * ProjectService 单元测试 — Backlot 项目库服务
 *
 * 测试覆盖：
 *   - scanProjects() 空目录返回 []
 *   - createProject() 创建目录 + project.json + 字段完整
 *   - getProject() 读取已有项目
 *   - getProject() 不存在项目抛 ProjectNotFound
 *   - updateProject() 合并字段 + updatedAt 更新
 *   - deleteProject() 删除目录
 *   - createProject() 缺少参数抛错
 *   - scanProjects() 跳过无效 project.json
 *   - scanProjects() 按 updatedAt 降序排序
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Mock logger 防止 require('./logger') 报错
__registerMock('../services/logger', {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
});

const fs = require('fs');
const path = require('path');
const os = require('os');

// 测试用的临时 projects 目录
let tempDir;
let service;
let ProjectService;
let ProjectNotFound;

beforeEach(() => {
  // 创建独立临时目录，避免污染真实 userData
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'backlot-test-'));
  // 清除 require 缓存，强制重新加载 ProjectService
  delete require.cache[require.resolve('../services/project-service')];
  const mod = require('../services/project-service');
  ProjectService = mod.ProjectService;
  ProjectNotFound = mod.ProjectNotFound;
  // 通过构造函数 options 注入测试隔离路径，不依赖 electron mock
  service = new ProjectService(null, { userDataDir: tempDir });
});

afterEach(() => {
  // 清理临时目录
  try {
    fs.rmSync(tempDir, { recursive: true, force: true });
  } catch (_) { /* ignore */ }
  // 清除缓存以避免跨测试污染
  delete require.cache[require.resolve('../services/project-service')];
});

describe('ProjectService — Backlot 项目库', () => {
  describe('scanProjects', () => {
    it('空目录返回 []', () => {
      const list = service.scanProjects();
      expect(Array.isArray(list)).toBe(true);
      expect(list.length).toBe(0);
    });

    it('跳过无效 project.json', () => {
      // 创建一个缺少 name 的无效 project.json
      const invalidDir = path.join(service.getProjectsDir(), 'invalid-id');
      fs.mkdirSync(invalidDir, { recursive: true });
      fs.writeFileSync(
        path.join(invalidDir, 'project.json'),
        JSON.stringify({ id: 'invalid-id' }), // 缺少 name
        'utf-8'
      );
      const list = service.scanProjects();
      expect(list.length).toBe(0);
    });

    it('跳过损坏的 project.json', () => {
      const brokenDir = path.join(service.getProjectsDir(), 'broken-id');
      fs.mkdirSync(brokenDir, { recursive: true });
      fs.writeFileSync(
        path.join(brokenDir, 'project.json'),
        '{ invalid json !!!',
        'utf-8'
      );
      const list = service.scanProjects();
      expect(list.length).toBe(0);
    });

    it('按 updatedAt 降序排序', () => {
      const a = service.createProject({ name: 'A', pipelineType: 'p' });
      // 确保 updatedAt 不同
      const b = service.createProject({ name: 'B', pipelineType: 'p' });
      // 手动修改 a 的 updatedAt 使其更晚
      service.updateProject(a.id, { name: 'A2' });
      const list = service.scanProjects();
      expect(list.length).toBe(2);
      // A2 被更新过，updatedAt 更晚，应排在前面
      expect(list[0].name).toBe('A2');
      expect(list[1].name).toBe('B');
    });
  });

  describe('createProject', () => {
    it('创建目录 + project.json + 字段完整', () => {
      const project = service.createProject({
        name: '测试项目',
        pipelineType: 'animated-explainer',
        summary: '一个测试项目',
      });
      expect(project.id).toBeTruthy();
      expect(project.name).toBe('测试项目');
      expect(project.pipelineType).toBe('animated-explainer');
      expect(project.status).toBe('draft');
      expect(project.createdAt).toBeTruthy();
      expect(project.updatedAt).toBeTruthy();
      expect(project.lastRunAt).toBeNull();
      expect(project.thumbnailPath).toBeNull();
      expect(project.totalCost).toBe(0);
      expect(project.stages).toEqual([]);
      expect(project.metadata).toEqual({});
      expect(project.summary).toBe('一个测试项目');

      // 验证目录和文件存在
      const projectDir = path.join(service.getProjectsDir(), project.id);
      expect(fs.existsSync(projectDir)).toBe(true);
      expect(fs.existsSync(path.join(projectDir, 'project.json'))).toBe(true);
    });

    it('缺少 name 抛错', () => {
      expect(() => service.createProject({ pipelineType: 'p' })).toThrow();
    });

    it('缺少 pipelineType 抛错', () => {
      expect(() => service.createProject({ name: 'x' })).toThrow();
    });

    it('metadata 默认为空对象', () => {
      const project = service.createProject({ name: 'M', pipelineType: 'p' });
      expect(project.metadata).toEqual({});
    });

    it('创建写盘失败时保留原始文件系统错误', () => {
      const blockingPath = path.join(tempDir, 'not-a-directory');
      fs.writeFileSync(blockingPath, 'blocking file', 'utf-8');
      const blockedService = new ProjectService(null, { userDataDir: blockingPath });

      let thrown;
      try {
        blockedService.createProject({ name: '失败项目', pipelineType: 'p' });
      } catch (error) {
        thrown = error;
      }

      expect(thrown).toBeInstanceOf(Error);
      expect(thrown.message).toContain('Failed to create project');
      expect(thrown.cause).toBeInstanceOf(Error);
      expect(thrown.cause.code).toBe('ENOTDIR');
    });
  });

  describe('getProject', () => {
    it('读取已有项目', () => {
      const created = service.createProject({ name: '读取测试', pipelineType: 'p' });
      const fetched = service.getProject(created.id);
      expect(fetched.id).toBe(created.id);
      expect(fetched.name).toBe('读取测试');
    });

    it('不存在项目抛 ProjectNotFound', () => {
      expect(() => service.getProject('nonexistent')).toThrow(ProjectNotFound);
    });

    it('空 id 抛 ProjectNotFound', () => {
      expect(() => service.getProject('')).toThrow(ProjectNotFound);
    });
  });

  describe('updateProject', () => {
    it('合并字段 + updatedAt 更新', () => {
      const created = service.createProject({ name: '原名称', pipelineType: 'p' });
      const updated = service.updateProject(created.id, { name: '新名称', status: 'running' });
      expect(updated.name).toBe('新名称');
      expect(updated.status).toBe('running');
      expect(updated.updatedAt).not.toBe(created.updatedAt);
      expect(updated.id).toBe(created.id);
    });

    it('写入磁盘持久化', () => {
      const created = service.createProject({ name: 'A', pipelineType: 'p' });
      service.updateProject(created.id, { name: 'B' });
      const raw = JSON.parse(
        fs.readFileSync(
          path.join(service.getProjectsDir(), created.id, 'project.json'),
          'utf-8'
        )
      );
      expect(raw.name).toBe('B');
    });

    it('更新写盘失败时保留原始文件系统错误', () => {
      const created = service.createProject({ name: '原名称', pipelineType: 'p' });
      const projectJsonPath = path.join(service.getProjectsDir(), created.id, 'project.json');
      const updates = {};
      Object.defineProperty(updates, 'name', {
        enumerable: true,
        get() {
          fs.rmSync(projectJsonPath);
          fs.mkdirSync(projectJsonPath);
          return '新名称';
        },
      });

      let thrown;
      try {
        service.updateProject(created.id, updates);
      } catch (error) {
        thrown = error;
      }

      expect(thrown).toBeInstanceOf(Error);
      expect(thrown.message).toContain('Failed to update project');
      expect(thrown.cause).toBeInstanceOf(Error);
      expect(['EISDIR', 'EPERM', 'EACCES']).toContain(thrown.cause.code);
    });
  });

  describe('deleteProject', () => {
    it('删除项目目录', () => {
      const created = service.createProject({ name: '待删除', pipelineType: 'p' });
      const projectDir = path.join(service.getProjectsDir(), created.id);
      expect(fs.existsSync(projectDir)).toBe(true);
      const result = service.deleteProject(created.id);
      expect(result.deleted).toBe(true);
      expect(fs.existsSync(projectDir)).toBe(false);
    });

    it('删除后 scanProjects 不再返回', () => {
      const created = service.createProject({ name: 'X', pipelineType: 'p' });
      expect(service.scanProjects().length).toBe(1);
      service.deleteProject(created.id);
      expect(service.scanProjects().length).toBe(0);
    });

    it('删除不存在的项目抛 ProjectNotFound', () => {
      expect(() => service.deleteProject('nonexistent')).toThrow(ProjectNotFound);
    });
  });

  describe('getProjectsDir', () => {
    it('返回的路径以 projects 结尾', () => {
      const dir = service.getProjectsDir();
      expect(dir.endsWith('projects')).toBe(true);
    });

    it('目录不存在时自动创建', () => {
      const dir = service.getProjectsDir();
      expect(fs.existsSync(dir)).toBe(true);
    });
  });
});
