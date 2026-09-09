/**
 * SQLiteStorage 测试
 */
var { SQLiteStorage } = require('../src/sqlite-storage')

function createMockDb() {
  var store = Object.create(null)
  return {
    prepare: function (sql) {
      return {
        get: function (key) {
          return store[key] ? { value: store[key] } : null
        },
        run: function (key, value) {
          store[key] = value
        }
      }
    }
  }
}

describe('SQLiteStorage', function () {
  var storage, db

  beforeEach(function () {
    db = createMockDb()
    storage = new SQLiteStorage(db)
  })

  test('should be ready after construction with db', function () {
    expect(storage.isReady()).toBe(true)
  })

  test('should set and get values', function () {
    storage.set('test_key', 'test_value')
    var val = storage.get('test_key')
    expect(val).toBe('test_value')
  })

  test('should return null for missing key', function () {
    var val = storage.get('nonexistent')
    expect(val).toBe(null)
  })

  test('should overwrite existing key', function () {
    storage.set('key', 'old')
    storage.set('key', 'new')
    expect(storage.get('key')).toBe('new')
  })

  test('should not be ready when constructed without db', function () {
    var s = new SQLiteStorage(null)
    expect(s.isReady()).toBe(false)
  })

  test('should become ready after setDb', function () {
    var s = new SQLiteStorage(null)
    expect(s.isReady()).toBe(false)
    s.setDb(db)
    expect(s.isReady()).toBe(true)
  })

  test('should return null on get when not ready', function () {
    var s = new SQLiteStorage(null)
    expect(s.get('any')).toBe(null)
  })
})
