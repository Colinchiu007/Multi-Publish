/**
 * ws mock for flutter-skill-bridge tests
 */
const mock = {
  WebSocketServer: jest.fn().mockImplementation(function() {
    return { on: jest.fn(), close: jest.fn() };
  }),
  WebSocket: jest.fn().mockImplementation(function() {
    return { on: jest.fn(), send: jest.fn(), close: jest.fn() };
  }),
};
module.exports = mock;
