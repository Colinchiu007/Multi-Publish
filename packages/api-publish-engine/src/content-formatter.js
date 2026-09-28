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
// 2026-10-08 CCG 评审（W4）同步：值对齐 packages/shared-utils/src/publish-capabilities.json
// 注册表（单一真源）；引擎零依赖约束下不能运行时 import 注册表，改由
// test/content-formatter-registry-sync.test.js 契约锁钉住两表一致（漂移即红）。
// 无标题平台（weibo/tencent_video/kuaishou/tiktok/twitter/instagram）：标题合并进
// 描述（由各适配器 compose），标题不单独截断（title 上限设 100000 = no-op），
// 合并后长度由 contentMax 管辖。百家号标题按 UTF-8 字节 149 上限（≈49 中文字符）。
var CONTENT_LIMITS = {
  wechat_mp: 20000, zhihu: 100000, weibo: 2000,
  douyin: 1000, xiaohongshu: 1000, tencent_video: 1000, kuaishou: 1000,
  toutiao: 100000, bilibili: 2000, baijiahao: 100000,
  youtube: 5000, tiktok: 2200, twitter: 280, instagram: 2200, facebook: 63206,
};

// ---- 标题截断上限（字符数） ----
var TITLE_LIMITS = {
  wechat_mp: 64, zhihu: 50,
  douyin: 55, xiaohongshu: 20,
  toutiao: 30, bilibili: 80, baijiahao: 49,
  youtube: 100, facebook: 100,
  // 无标题平台：标题合并进描述，不单独截断（no-op 上限）
  weibo: 100000, tencent_video: 100000, kuaishou: 100000,
  tiktok: 100000, twitter: 100000, instagram: 100000,
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


function replacePlaceholders(text, topics, mentions) {
  if (!text) return { text: "", topics: [], mentions: [] }
  var result = { text: text, topics: [], mentions: [] }
  result.text = result.text.replace(/\{tmp_h_(\d+)\}/g, function(m, idx) {
    var t = topics[parseInt(idx) - 1]
    if (t) { result.topics.push(t); return "#" + t + "#" }
    return m
  })
  result.text = result.text.replace(/\{tmp_f_(\d+)\}/g, function(m, idx) {
    var u = mentions[parseInt(idx) - 1]
    if (u) { result.mentions.push(u); return "@" + u }
    return m
  })
  return result
}

module.exports = { formatContent, formatTags, truncateContent, truncateTitle, replacePlaceholders };