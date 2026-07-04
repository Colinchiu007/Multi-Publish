/**
 * Container — 依赖注入容器
 *
 * 支持值注册和工厂注册（延迟初始化）
 * 所有服务默认为 singleton
 */

import type { Container as ContainerInterface, RegistryEntry } from './types';

class Container implements ContainerInterface {
  private _registry: Record<string, RegistryEntry> = {};

  /**
   * 注册服务
   * @param name  服务名称
   * @param value  实例或工厂函数
   */
  register(name: string, value: any): void {
    if (typeof value === 'function' && value.length >= 0) {
      this._registry[name] = { factory: value, singleton: true, value: null, initialized: false };
    } else {
      this._registry[name] = { value, initialized: true };
    }
  }

  /**
   * 批量注册
   * @param map  { name: value, ... }
   */
  registerMany(map: Record<string, any>): void {
    for (const key in map) {
      if (Object.prototype.hasOwnProperty.call(map, key)) {
        this.register(key, map[key]);
      }
    }
  }

  /**
   * 获取服务实例
   */
  get<T = any>(name: string): T {
    const entry = this._registry[name];
    if (!entry) throw new Error('Service not registered: ' + name);
    if (entry.factory && !entry.initialized) {
      entry.value = entry.factory(this);
      entry.initialized = true;
    }
    return entry.value as T;
  }

  /**
   * 检查服务是否已注册
   */
  has(name: string): boolean {
    return !!this._registry[name];
  }

  /**
   * 断言必需服务已注册
   * @throws 如果有缺失服务
   */
  assertRequired(names: string[]): void {
    const missing: string[] = [];
    for (let i = 0; i < names.length; i++) {
      if (!this._registry[names[i]]) missing.push(names[i]);
    }
    if (missing.length > 0) {
      throw new Error('Missing required services: ' + missing.join(', '));
    }
  }
}

export = Container;
