// @ts-check
/**
 * ProjectService — Backlot 项目库服务（OpenMontage 集成）
 *
 * 职责：
 *   - 扫描磁盘 projects/ 目录，构造 Project[] 列表
 *   - CRUD 项目（createProject / getProject / updateProject / deleteProject）
 *   - 同步写入 SQLite backlot_projects 表（备查/索引）
 *   - 每个项目对应一个目录 projects/<id>/，内含 project.json
 *
 * 设计原则：
 *   - 磁盘 project.json 为 source of truth，SQLite 为索引副本
 *   - 所有文件操作包裹 try-catch，IO 异常不抛出（返回空列表 / null）
 *   - 不存在的项目抛 ProjectNotFound 错误（调用方处理）
 *
 * 依赖：
 *   - store (SQLite, 可选 — 不可用时退化为纯文件模式)
 *   - logger
 *   - path-utils (getProjectRoot)
 */

'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const log = require('./logger');

/**
 * 自定义错误：项目不存在
 */
class ProjectNotFound extends Error {
  constructor(id) {
    super('Project not found: ' + id);
    this.name = 'ProjectNotFound';
    this.code = 'PROJECT_NOT_FOUND';
  }
}

/**
 * 获取 userData 目录（兼容测试环境无 electron 的情况）
 */
function _getUserDataDir() {
  try {
    const { app } = require('electron');
    return app.getPath('userData');
  } catch (_) {
    // 测试环境 fallback 到系统临时目录
    return process.env.TMPDIR || process.env.TEMP || require('os').tmpdir();
  }
}

class ProjectService {
  /**
   * @param {object} [store] - SQLite Store 实例（可选，无则纯文件模式）
   * @param {object} [options] - 可选配置
   * @param {string} [options.userDataDir] - 覆盖 userData 目录（测试用）
   */
  constructor(store, options = {}) {
    this.store = store || null;
    this._userDataDirOverride = options.userDataDir || null;
    this._projectsDir = null; // 懒加载
  }

  /**
   * 获取 projects 目录路径
   * 路径：{userData}/projects/
   */
  getProjectsDir() {
    if (this._projectsDir) return this._projectsDir;
    const base = this._userDataDirOverride || _getUserDataDir();
    this._projectsDir = path.join(base, 'projects');
    this._ensureProjectsDir();
    return this._projectsDir;
  }

  /**
   * 确保 projects/ 目录存在
   * @private
   */
  _ensureProjectsDir() {
    try {
      if (!fs.existsSync(this._projectsDir)) {
        fs.mkdirSync(this._projectsDir, { recursive: true });
      }
    } catch (e) {
      log.error('ProjectService', 'Failed to create projects dir: ' + e.message);
    }
  }

  /**
   * 扫描所有项目（按 updatedAt 降序）
   * @returns {Project[]}
   */
  scanProjects() {
    const dir = this.getProjectsDir();
    let entries = [];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch (e) {
      log.warn('ProjectService', 'Failed to read projects dir: ' + e.message);
      return [];
    }

    const projects = [];
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const projectJsonPath = path.join(dir, entry.name, 'project.json');
      try {
        const raw = fs.readFileSync(projectJsonPath, 'utf-8');
        const project = JSON.parse(raw);
        // 校验关键字段
        if (!project.id || !project.name) {
          log.warn('ProjectService', 'Skipping invalid project.json: ' + entry.name);
          continue;
        }
        projects.push(project);
      } catch (e) {
        // 单个项目损坏不影响其他
        log.warn('ProjectService', 'Failed to read project.json for ' + entry.name + ': ' + e.message);
      }
    }

    // 按 updatedAt 降序
    projects.sort((a, b) => {
      const ta = a.updatedAt || '';
      const tb = b.updatedAt || '';
      return tb.localeCompare(ta);
    });

    return projects;
  }

  /**
   * 获取单个项目
   * @param {string} id - 项目 ID
   * @returns {Project}
   * @throws {ProjectNotFound}
   */
  getProject(id) {
    if (!id) throw new ProjectNotFound(id);
    const projectJsonPath = path.join(this.getProjectsDir(), id, 'project.json');
    try {
      const raw = fs.readFileSync(projectJsonPath, 'utf-8');
      return JSON.parse(raw);
    } catch (e) {
      throw new ProjectNotFound(id);
    }
  }

  /**
   * 创建新项目
   * @param {object} meta - { name, pipelineType, summary?, metadata? }
   * @returns {Project}
   */
  createProject(meta) {
    if (!meta || !meta.name || !meta.pipelineType) {
      throw new Error('createProject requires name and pipelineType');
    }
    const id = crypto.randomUUID ? crypto.randomUUID() : _uuidV4Fallback();
    const now = new Date().toISOString();
    const project = {
      id,
      name: meta.name,
      pipelineType: meta.pipelineType,
      status: 'draft',
      createdAt: now,
      updatedAt: now,
      lastRunAt: null,
      thumbnailPath: null,
      summary: meta.summary || '',
      totalCost: 0,
      stages: [],
      metadata: meta.metadata || {},
    };

    // 创建目录 + project.json
    const projectDir = path.join(this.getProjectsDir(), id);
    try {
      fs.mkdirSync(projectDir, { recursive: true });
      fs.writeFileSync(
        path.join(projectDir, 'project.json'),
        JSON.stringify(project, null, 2),
        'utf-8'
      );
    } catch (e) {
      log.error('ProjectService', 'Failed to create project ' + id + ': ' + e.message);
      throw new Error('Failed to create project: ' + e.message);
    }

    // 同步写入 SQLite
    this._upsertDb(project);

    return project;
  }

  /**
   * 更新项目元数据
   * @param {string} id
   * @param {object} updates - 要更新的字段
   * @returns {Project}
   * @throws {ProjectNotFound}
   */
  updateProject(id, updates) {
    const existing = this.getProject(id);
    const merged = { ...existing, ...updates, id, updatedAt: new Date().toISOString() };

    // 写入磁盘
    const projectJsonPath = path.join(this.getProjectsDir(), id, 'project.json');
    try {
      fs.writeFileSync(projectJsonPath, JSON.stringify(merged, null, 2), 'utf-8');
    } catch (e) {
      log.error('ProjectService', 'Failed to write project ' + id + ': ' + e.message);
      throw new Error('Failed to update project: ' + e.message);
    }

    // 更新 SQLite
    this._upsertDb(merged);

    return merged;
  }

  /**
   * 删除项目
   * @param {string} id
   * @returns {{ deleted: true }}
   * @throws {ProjectNotFound}
   */
  deleteProject(id) {
    // 先检查存在（不存在会抛 ProjectNotFound）
    this.getProject(id);

    // 递归删除目录（失败则抛错，不静默吞掉）
    const projectDir = path.join(this.getProjectsDir(), id);
    _rmrf(projectDir);

    // 删除 SQLite 记录
    if (this.store && this.store._ready && this.store.db) {
      try {
        this.store.db.prepare('DELETE FROM backlot_projects WHERE id = ?').run(id);
        if (this.store.db.persist) this.store.db.persist();
      } catch (e) {
        log.warn('ProjectService', 'Failed to delete DB record: ' + e.message);
      }
    }

    return { deleted: true };
  }

  /**
   * 写入/更新 SQLite 记录
   * @private
   */
  _upsertDb(project) {
    if (!this.store || !this.store._ready || !this.store.db) return;
    try {
      const stmt = this.store.db.prepare(`
        INSERT OR REPLACE INTO backlot_projects
          (id, name, pipeline_type, status, summary, thumbnail_path, total_cost,
           last_run_at, stages, metadata, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      stmt.run(
        project.id,
        project.name,
        project.pipelineType,
        project.status || 'draft',
        project.summary || '',
        project.thumbnailPath || null,
        project.totalCost || 0,
        project.lastRunAt || null,
        JSON.stringify(project.stages || []),
        JSON.stringify(project.metadata || {}),
        project.createdAt || new Date().toISOString(),
        project.updatedAt || new Date().toISOString()
      );
      if (this.store.db.persist) this.store.db.persist();
    } catch (e) {
      log.warn('ProjectService', 'Failed to upsert DB record: ' + e.message);
    }
  }
}

/**
 * 递归删除目录（手动递归，兼容所有环境）
 * 注意：fs.rmSync({recursive:true}) 在某些 Windows + vitest 环境下
 * 不抛错但也不实际删除，因此始终使用手动递归删除。
 * @private
 */
function _rmrf(targetPath) {
  if (!fs.existsSync(targetPath)) return;
  const entries = fs.readdirSync(targetPath, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(targetPath, entry.name);
    if (entry.isDirectory()) {
      _rmrf(full);
    } else {
      try { fs.unlinkSync(full); } catch (_) { /* ignore */ }
    }
  }
  try { fs.rmdirSync(targetPath); } catch (_) { /* ignore */ }
}

/**
 * UUID v4 fallback（Node < 14.17 没有 crypto.randomUUID）
 * @private
 */
function _uuidV4Fallback() {
  const b = crypto.randomBytes(16);
  b[6] = (b[6] & 0x0f) | 0x40; // version 4
  b[8] = (b[8] & 0x3f) | 0x80; // variant
  const h = b.toString('hex');
  return h.slice(0, 8) + '-' + h.slice(8, 12) + '-' + h.slice(12, 16) +
         '-' + h.slice(16, 20) + '-' + h.slice(20);
}

module.exports = { ProjectService, ProjectNotFound };
