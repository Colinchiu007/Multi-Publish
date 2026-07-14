// @ts-nocheck
const Container = require('./container');

describe('Container (TS)', () => {
  it('register and get a value', () => {
    const c = new Container();
    c.register('foo', 'bar');
    expect(c.get('foo')).toBe('bar');
  });

  it('register a factory and lazy init', () => {
    const c = new Container();
    const factory = vi.fn(() => 42);
    c.register('num', factory);
    expect(factory).not.toHaveBeenCalled();
    expect(c.get('num')).toBe(42);
    expect(factory).toHaveBeenCalledTimes(1);
  });

  it('factory is singleton', () => {
    const c = new Container();
    c.register('obj', () => ({ a: 1 }));
    const v1 = c.get('obj');
    const v2 = c.get('obj');
    expect(v1).toBe(v2);
  });

  it('has returns correct boolean', () => {
    const c = new Container();
    c.register('x', 1);
    expect(c.has('x')).toBe(true);
    expect(c.has('y')).toBe(false);
  });

  it('registerMany', () => {
    const c = new Container();
    c.registerMany({ a: 1, b: 2 });
    expect(c.get('a')).toBe(1);
    expect(c.get('b')).toBe(2);
  });

  it('assertRequired passes when all present', () => {
    const c = new Container();
    c.register('a', 1); c.register('b', 2);
    expect(() => c.assertRequired(['a', 'b'])).not.toThrow();
  });

  it('assertRequired throws when missing', () => {
    const c = new Container();
    c.register('a', 1);
    expect(() => c.assertRequired(['a', 'b'])).toThrow('Missing required');
  });

  it('get throws for unregistered', () => {
    const c = new Container();
    expect(() => c.get('nope')).toThrow('not registered');
  });
});

// ── P0-2 回归测试：循环依赖检测 + dispose ──────────────
describe('Container circular dependency detection', () => {
  it('detects A -> B -> A cycle', () => {
    const c = new Container();
    c.register('A', (container) => container.get('B'));
    c.register('B', (container) => container.get('A'));
    expect(() => c.get('A')).toThrow('Circular dependency');
  });

  it('detects A -> A self cycle', () => {
    const c = new Container();
    c.register('A', (container) => container.get('A'));
    expect(() => c.get('A')).toThrow('Circular dependency');
  });

  it('detectCircularDeps returns cached cycle after get() throws', () => {
    const c = new Container();
    c.register('A', (container) => container.get('B'));
    c.register('B', (container) => container.get('A'));
    try { c.get('A') } catch (e) { /* expected */ }
    const result = c.detectCircularDeps();
    expect(result.hasCycle).toBe(true);
    expect(result.cycle).toContain('A');
    expect(result.cycle).toContain('B');
  });

  it('detectCircularDeps proactively detects cycle without prior get()', () => {
    const c = new Container();
    c.register('X', (container) => container.get('Y'));
    c.register('Y', (container) => container.get('X'));
    const result = c.detectCircularDeps();
    expect(result.hasCycle).toBe(true);
  });

  it('detectCircularDeps returns no cycle for clean graph', () => {
    const c = new Container();
    c.register('config', { db: 'sqlite' });
    c.register('db', (container) => ({ cfg: container.get('config') }));
    const result = c.detectCircularDeps();
    expect(result.hasCycle).toBe(false);
    expect(result.cycle).toEqual([]);
  });

  it('resolving stack is cleaned up after successful resolution', () => {
    const c = new Container();
    c.register('a', () => 1);
    c.register('b', (container) => container.get('a') + 1);
    expect(c.get('b')).toBe(2);
    // 第二次调用不应误判循环
    expect(c.get('b')).toBe(2);
  });
});

describe('Container dispose (P0-2)', () => {
  it('calls dispose() on disposable services', async () => {
    const c = new Container();
    const disposed = [];
    c.register('svc', { dispose: () => { disposed.push('svc') } }, { disposable: true });
    await c.dispose();
    expect(disposed).toEqual(['svc']);
  });

  it('does not call dispose() on non-disposable services', async () => {
    const c = new Container();
    const disposed = [];
    c.register('svc', { dispose: () => { disposed.push('svc') } });  // disposable 默认 false
    await c.dispose();
    expect(disposed).toEqual([]);
  });

  it('isolates dispose errors across services', async () => {
    const c = new Container();
    const disposed = [];
    c.register('bad', { dispose: () => { throw new Error('boom') } }, { disposable: true });
    c.register('good', { dispose: () => { disposed.push('good') } }, { disposable: true });
    // 不应抛错
    await expect(c.dispose()).resolves.toBeUndefined();
    expect(disposed).toEqual(['good']);
  });

  it('clears registry after dispose', async () => {
    const c = new Container();
    c.register('svc', { dispose: () => {} }, { disposable: true });
    await c.dispose();
    expect(c.list()).toEqual([]);
  });
});
