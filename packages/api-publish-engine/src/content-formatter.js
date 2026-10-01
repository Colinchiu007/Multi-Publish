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
  douyin: 5000, xiaohongshu: 5000, tencent_video: 5000, kuaishou: 480,
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

// ============================================================
// 话题内联描述（publish-topic-inline-description）
// 描述文本是话题唯一真源：UI 追加管道把话题以 `#话题` 内联进描述，
// 引擎侧按平台三态处理——内联保留 / 内联转换（双井号）/ 剥离独立字段。
// 三个函数是唯一实现，各适配器只调用，禁止自抄（契约锁
// test/topic-inline-contract.test.js）。
// ============================================================

/** 转义正则特殊字符（话题名拼进动态正则用） */
function escapeTopicName(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** 已知话题清单归一化：接受字符串或 {name} 对象数组，剔空 */
function normalizeKnownTopics(knownTopics) {
  var list = Array.isArray(knownTopics) ? knownTopics : [];
  var names = [];
  for (var i = 0; i < list.length; i++) {
    var name = typeof list[i] === "string" ? list[i] : (list[i] && list[i].name) || "";
    if (name) names.push(String(name));
  }
  return names;
}

/**
 * 解析描述文本中的内联话题名（单井号 `#话题` 与双井号 `#话题#` 都识别，
 * 名字不含井号；`#` 后需至少一个非空白非井号字符，孤立井号不产生话题）。
 * 前置边界：井号前须为文本开头或空白——URL 片段（`https://x.com#tag`）
 * 里的井号不是话题（CCG claude 路评审修复，2026-10-09）。
 * @param {string} content 描述文本
 * @returns {string[]} 话题名数组（按出现顺序，不去重）
 */
function extractInlineTopicNames(content) {
  if (!content) return [];
  var tokens = String(content).match(/(^|\s)#[^\s#]+/g) || [];
  var names = [];
  for (var i = 0; i < tokens.length; i++) names.push(tokens[i].trim().slice(1));
  return names;
}

/**
 * 从描述剥离已知话题片段（独立字段型平台用：B站/知乎/头条/百家号/公众号）。
 * 只剥离 knownTopics 精确匹配的话题（词边界完整匹配），未列出的话题留在
 * 描述——防误伤代码片段（如 `#include`）、URL 片段与用户正文里的普通井号。
 * 双井号形态（`#话题#`）剥离时连同尾井号；移除后收拢分隔空白。
 * @param {string} content 描述文本
 * @param {Array} knownTopics 已知话题（字符串或 {name} 对象）
 * @returns {{content: string, topics: string[]}} 剥离后的描述与实际剥离出的话题名
 */
function stripTopicsFromContent(content, knownTopics) {
  var text = String(content == null ? "" : content);
  var removed = [];
  var names = normalizeKnownTopics(knownTopics);
  for (var i = 0; i < names.length; i++) {
    var name = names[i];
    // 前置边界 (^|\s)：井号前须为开头或空白，URL 片段里的 #tag 不受影响
    var pattern = "(^|\\s)#" + escapeTopicName(name) + "#?(?=\\s|$)(\\s?)";
    var hit = false;
    text = text.replace(new RegExp(pattern, "g"), function(full, before, after) {
      hit = true;
      if (before && after) return before;
      return "";
    });
    if (hit) removed.push(name);
  }
  return { content: text, topics: removed };
}

/** 双井号内联平台（微信系/微博系/百家号话题形态——参考产品取证：话题 `#名#` 拼正文） */
var DOUBLE_HASH_PLATFORMS = { weibo: true, tencent_video: true, baijiahao: true };

/**
 * 内联型平台的话题格式转换（发布时隐性转换，用户无感知）：
 * weibo/tencent_video 把描述里的 `#话题` 转成 `#话题#`（双井号），
 * 其余内联平台原样返回。只转换 knownTopics 精确匹配的话题（词边界 +
 * 前置边界：井号前须为开头或空白，URL 片段不误转），已是双井号的形态不重复加井号。
 * @param {string} platform 平台标识
 * @param {string} content 描述文本
 * @param {Array} knownTopics 已知话题（字符串或 {name} 对象）
 * @returns {string} 转换后的描述
 */
function convertInlineTopics(platform, content, knownTopics) {
  var text = String(content == null ? "" : content);
  if (!DOUBLE_HASH_PLATFORMS[platform]) return text;
  var names = normalizeKnownTopics(knownTopics);
  for (var i = 0; i < names.length; i++) {
    var name = names[i];
    var pattern = "(^|\\s)#" + escapeTopicName(name) + "#?(?=\\s|$)";
    text = text.replace(new RegExp(pattern, "g"), "$1#" + name + "#");
  }
  return text;
}

/**
 * 扫描已知话题在描述文本中的位置段（抖音 text_extra 等位置标记消费）。
 * 偏移按字符口径（JS string index，中文按 1 计）；双井号形态 end 含尾井号；
 * 多话题按出现位置排序；同一话题多次出现全部标记。
 * 前置边界：井号前须为开头或空白（URL 片段不产生虚假位置段）。
 * @param {string} content 描述文本
 * @param {Array} knownTopics 已知话题（字符串或 {name} 对象）
 * @returns {Array<{name: string, start: number, end: number}>} 位置段列表
 */
function findInlineTopicPositions(content, knownTopics) {
  var text = String(content == null ? "" : content);
  var positions = [];
  var names = normalizeKnownTopics(knownTopics);
  for (var i = 0; i < names.length; i++) {
    var name = names[i];
    var pattern = "(^|\\s)#" + escapeTopicName(name) + "#?(?=\\s|$)";
    var re = new RegExp(pattern, "g");
    var match;
    while ((match = re.exec(text)) !== null) {
      // match 含前导边界捕获（^ 匹配空串或一个空白），start 越过前导
      var lead = match[1] || "";
      positions.push({ name: name, start: match.index + lead.length, end: match.index + match[0].length });
    }
  }
  positions.sort(function (a, b) { return a.start - b.start; });
  return positions;
}

module.exports = {
  formatContent, formatTags, truncateContent, truncateTitle, replacePlaceholders,
  extractInlineTopicNames, stripTopicsFromContent, convertInlineTopics, findInlineTopicPositions,
};