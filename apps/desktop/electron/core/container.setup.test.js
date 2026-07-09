// container.setup 加载所有服务模块，多数 require electron + fs + path
__enableElectronMock()

__registerMock("fs", {
  existsSync: vi.fn().mockReturnValue(false),
  readFileSync: vi.fn().mockReturnValue("[]"),
  writeFileSync: vi.fn(),
  mkdirSync: vi.fn(),
  readdirSync: vi.fn().mockReturnValue([]),
  statSync: vi.fn().mockReturnValue({ size: 0, mtime: new Date() }),
  unlinkSync: vi.fn(),
  createWriteStream: vi.fn(),
  createReadStream: vi.fn(),
})

__registerMock("path", {
  join: vi.fn(function() { return "/mock/path"; }),
  dirname: vi.fn(function(p) { return p; }),
  basename: vi.fn(function(p) { return p; }),
  resolve: vi.fn(function() { return "/mock/resolved"; }),
  extname: vi.fn(function() { return ""; }),
})

// api-publish-engine/src/api-router.js require './logger' 缺失，mock 整个包规避
__registerMock("@multi-publish/api-publish-engine", {
  supportsApi: vi.fn().mockReturnValue(false),
  publishViaApi: vi.fn(),
})

const { createContainer } = require('./container.setup');

describe('Container setup', () => {
  test('creates container with all services', () => {
    var c = createContainer();
    expect(c.get('store')).toBeDefined();
    expect(c.get('authViewManager')).toBeDefined();
    expect(c.get('rpaViewManager')).toBeDefined();
    expect(c.get('taskQueue')).toBeDefined();
  });

  test('lazy initialization works', () => {
    var c = createContainer();
    var svc = c.get('rpaViewManager');
    expect(svc).toBeDefined();
    expect(c.get('rpaViewManager')).toBe(svc);
  });

  test('dependency injection works', () => {
    var c = createContainer();
    var ci = c.get('contentIntelligence');
    expect(ci).toBeDefined();
    var track = c.get('publishImpactTracker');
    expect(track).toBeDefined();
  });

  test('assertRequired passes', () => {
    expect(() => createContainer()).not.toThrow();
  });
});
