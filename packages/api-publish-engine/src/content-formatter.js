/**
 * content-formatter.js — 统一内容格式化
 * 负责：29 平台标签格式转换 + 内容/标题截断
 * 遵循增量原则：不修改 taskData 结构，只格式化已有字段
 */

// ---- 标签风格映射 ----
// '#tag'    →  douyin/xiaohongshu/kuaishou/bilibili/toutiao 等（多数平台）
// '#tag#'   →  weibo/souhu
// 'plain'   →  zhihu/wechat_mp/dayu/wangyi/yidianhao/dewu/baijiahao
var TAG_STYLES = {
  douyin: '#tag', xiaohongshu: '#tag', kuaishou: '#tag',
  bilibili: '#tag', toutiao: '#tag', aiqiyi: '#tag',
  pipixia: '#tag', meipai: '#tag', shipinhao: '#tag',
  xigua: '#tag', duoduo: '#tag', qiehao: '#tag',
  tengxun_shipin: '#tag', weishi: '#tag', souhu_shipin: '#tag',
  meiyou: '#tag', xhs_shangjia: '#tag', acfun: '#tag',
  chejiahao: '#tag', yichehao: '#tag',
  weibo: '#tag#', souhu: '#tag#',
  zhihu: 'plain', wechat_mp: 'plain', dayu: 'plain',
  wangyi: 'plain', yidianhao: 'plain', dewu: 'plain', baijiahao: 'plain',
};

// ---- 内容截断上限（字符数） ----
var CONTENT_LIMITS = {
  douyin: 1000, kuaishou: 1000, xiaohongshu: 1000,
  weibo: 2000, bilibili: 2000,
  toutiao: 5000, baijiahao: 5000,
  zhihu: 100000, wechat_mp: 50000,
};

// ---- 标题截断上限（字符数） ----
var TITLE_LIMITS = {
  douyin: 30, kuaishou: 30,
  xiaohongshu: 40,
  toutiao: 50, baijiahao: 50,
  wechat_mp: 64,
  bilibili: 80,
  zhihu: 100,
  weibo: 120,
};

var DEFAULT_CONTENT_LIMIT = 10000;
var DEFAULT_TITLE_LIMIT  = 100;

/**
 * 格式化标签数组
 * @param {string} platform
 * @param {Array} tags - 字符串数组 或 {name} 对象数组
 * @returns {Array}
 */
function formatTags(platform, tags) {
  if (!tags || !Array.isArray(tags)) return [];
  var style = TAG_STYLES[platform] || '#tag';
  return tags.map(function (t) {
    var name = (typeof t === 'string') ? t : (t && t.name ? t.name : String(t));
    if (style === '#tag') return '#' + name;
    if (style === '#tag#') return '#' + name + '#';
    return name; // plain
  });
}

/**
 * 截断内容
 * @param {string} platform
 * @param {string} str
 * @returns {string}
 */
function truncateContent(platform, str) {
  if (!str) return '';
  var limit = CONTENT_LIMITS[platform] || DEFAULT_CONTENT_LIMIT;
  return str.length > limit ? str.slice(0, limit) : str;
}

/**
 * 截断标题
 * @param {string} platform
 * @param {string} str
 * @returns {string}
 */
function truncateTitle(platform, str) {
  if (!str) return '';
  var limit = TITLE_LIMITS[platform] || DEFAULT_TITLE_LIMIT;
  return str.length > limit ? str.slice(0, limit) : str;
}

/**
 * 完整格式化 pipeline
 * @param {string} platform
 * @param {object} taskData - { title, content, tags }
 * @returns {object} 格式化后的 taskData（浅拷贝）
 */
function formatContent(platform, taskData) {
  if (!taskData) return taskData;
  var result = {};
  // 只处理关心的字段，其余透传
  for (var k in taskData) {
    if (Object.prototype.hasOwnProperty.call(taskData, k)) {
      result[k] = taskData[k];
    }
  }
  result.title   = truncateTitle(platform, result.title);
  result.content = truncateContent(platform, result.content);
  result.tags    = formatTags(platform, result.tags);
  return result;
}

module.exports = { formatContent, formatTags, truncateContent, truncateTitle };