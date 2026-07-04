const Container = require('./container');

describe('Container (TS)', () => {
  it('register and get a value', () => {
    const c = new Container();
    c.register('foo', 'bar');
    expect(c.get('foo')).toBe('bar');
  });

  it('register a factory and lazy init', () => {
    const c = new Container();
    const factory = jest.fn(() => 42);
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
