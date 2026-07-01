const assert = require('assert');

function assertTrue(val, msg) {
  if (!val) throw new Error(msg || 'Expected truthy value');
}

function checkLoginByURL(platform, url) {
  const PATTERNS = { bilibili: ['www.bilibili.com/'] };
  const patterns = PATTERNS[platform];
  if (!patterns) return false;
  return patterns.some(p => url.includes(p));
}

function checkLoginByCDP(response) {
  try {
    const data = typeof response === 'string' ? JSON.parse(response) : response;
    return !!(data.code === 0 && data.data && 
      (data.data.isLogin === true || data.data.dedeUserID || data.data.mid || data.data.access_token));
  } catch (e) { return false; }
}

console.log('=== URL 测试 ===');
assertTrue(!checkLoginByURL('bilibili', 'https://passport.bilibili.com/login'), '登录页不应匹配');
assertTrue(checkLoginByURL('bilibili', 'https://www.bilibili.com/'), '首页应匹配');
assertTrue(checkLoginByURL('bilibili', 'https://www.bilibili.com/video/BVxxx'), '视频页应匹配');
assertTrue(!checkLoginByURL('bilibili', 'https://passport.bilibili.com/ajax/sms/send'), 'API不应匹配');
console.log('✓ URL 测试通过');

console.log('=== CDP 测试 ===');
assertTrue(!checkLoginByCDP({code: 0, data: {}}), '空数据不应触发');
assertTrue(!checkLoginByCDP({code: 0, data: {message: 'ok'}}), '无登录字段不应触发');
assertTrue(checkLoginByCDP({code: 0, data: {dedeUserID: '12345'}}), 'dedeUserID应触发');
assertTrue(checkLoginByCDP({code: 0, data: {mid: 12345}}), 'mid应触发');
assertTrue(checkLoginByCDP({code: 0, data: {isLogin: true}}), 'isLogin=true应触发');
assertTrue(checkLoginByCDP({code: 0, data: {access_token: 'xxx'}}), 'access_token应触发');
assertTrue(!checkLoginByCDP({code: -101, data: {}}), '错误码不应触发');
assertTrue(!checkLoginByCDP({code: 0}), '无data不应触发');
assertTrue(!checkLoginByCDP({code: 0, data: null}), 'null data不应触发');
console.log('✓ CDP 测试通过');

console.log('\n✅ 全部 9 个测试通过');
