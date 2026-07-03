// TDD: 错误码体系 + CancelToken + 进度上报 + 富文本处理
// 先写测试，再实现
const assert = require('assert');

// === 1. 错误码体系测试 ===
function testErrorCodes() {
  const EC = require('../src/error-codes');
  assert(EC.errorCode.request_error === -1, 'request_error=-1');
  assert(EC.errorCode.data_error === -2, 'data_error=-2');
  assert(EC.errorCode.success === 0, 'success=0');
  assert(typeof EC.getMsg === 'function', 'has getMsg');
  assert(EC.getMsg(0) === 'Success', 'getMsg(0) returns Success');
  console.log('  [PASS] error-codes');
}

// === 2. CancelToken 测试 ===
function testCancelToken() {
  const { CancelToken } = require('../src/cancel-token');
  const ct = new CancelToken();
  assert(ct.isCancelled === false, 'initially not cancelled');
  ct.cancel();
  assert(ct.isCancelled === true, 'cancelled after cancel()');
  assert(typeof ct.throwIfCancelled === 'function', 'has throwIfCancelled');
  console.log('  [PASS] cancel-token');
}

// === 3. 进度上报测试 ===
function testProgressEmitter() {
  const { ProgressEmitter, publishStatusEnum } = require('../src/progress-emitter');
  const pe = new ProgressEmitter();
  let lastProgress = null;
  pe.on('progress', (p) => { lastProgress = p; });
  pe.setProgress(50, 'Uploading...');
  assert(lastProgress !== null, 'progress event fired');
  assert(lastProgress.percent === 50, 'percent=50');
  assert(lastProgress.message === 'Uploading...', 'message correct');
  assert(publishStatusEnum.uploading === 'uploading', 'status enum correct');
  console.log('  [PASS] progress-emitter');
}

// === 4. 富文本处理器测试 ===
function testRichTextProcessor() {
  const { RichTextProcessor } = require('../src/rich-text-processor');
  const rtp = new RichTextProcessor();
  const result = rtp.process('Hello #world# @friend');
  assert(Array.isArray(result.segments), 'should return segments array');
  assert(result.segments.length >= 3, 'at least 3 segments');
  const topicSeg = result.segments.find(s => s.type === 'topic');
  assert(topicSeg, 'should find topic segment');
  assert(topicSeg.text === '#world#', 'topic text correct');
  const mentionSeg = result.segments.find(s => s.type === 'mention');
  assert(mentionSeg, 'should find mention segment');
  console.log('  [PASS] rich-text-processor');
}

console.log('=== Core Module TDD Tests ===');
testErrorCodes();
testCancelToken();
testProgressEmitter();
testRichTextProcessor();
console.log('All core module tests PASSED');
