// Platform-specific content formatting
// Tag prefix by platform: #tag (douyin, xiaohongshu), #tag# (weibo), plain (zhihu)
const PLATFORM_TAG_STYLE = {
  douyin: "#", xiaohongshu: "#", tencent_video: "#", kuaishou: "#",
  weibo: "##", bilibili: "#", toutiao: "#", baijiahao: "#",
  zhihu: "", wechat_mp: "", aiqiyi: "#", dayu: "#",
  qiehao: "#", souhu: "", wangyi: "", tengxun_shipin: "#",
  weishi: "#", yidianhao: "", souhu_shipin: "", pipixia: "#",
  meipai: "#", acfun: "#", dewu: "#", chejiahao: "",
  yichehao: "", meiyou: "", xhs_shangjia: "#", xigua: "#",
  duoduo: "#",
};

// Approximate content limits by platform (chars, based on common platform rules)
const PLATFORM_LIMITS = {
  wechat_mp: { title: 64, content: 20000 },
  zhihu: { title: 120, content: 100000 },
  weibo: { title: 140, content: 2000 },
  douyin: { title: 50, content: 1000 },
  xiaohongshu: { title: 40, content: 1000 },
  tencent_video: { title: 60, content: 1000 },
  kuaishou: { title: 60, content: 500 },
  bilibili: { title: 80, content: 5000 },
  toutiao: { title: 60, content: 5000 },
  baijiahao: { title: 64, content: 10000 },
  aiqiyi: { title: 60, content: 5000 },
  dayu: { title: 60, content: 10000 },
  qiehao: { title: 60, content: 10000 },
  souhu: { title: 120, content: 50000 },
  wangyi: { title: 60, content: 10000 },
  tengxun_shipin: { title: 60, content: 500 },
  weishi: { title: 40, content: 300 },
  souhu_shipin: { title: 60, content: 1000 },
  pipixia: { title: 40, content: 500 },
  meipai: { title: 30, content: 300 },
  acfun: { title: 80, content: 5000 },
  dewu: { title: 30, content: 300 },
  chejiahao: { title: 60, content: 10000 },
  yichehao: { title: 60, content: 10000 },
  meiyou: { title: 60, content: 1000 },
  xhs_shangjia: { title: 40, content: 1000 },
  xigua: { title: 60, content: 1000 },
  duoduo: { title: 30, content: 300 },
  default: { title: 200, content: 50000 },
};

function truncateTitle(title, platform) {
  var limit = (PLATFORM_LIMITS[platform] || PLATFORM_LIMITS.default).title;
  if (!title) return "";
  return title.length > limit ? title.substring(0, limit) : title;
}

function truncateContent(content, platform) {
  var limit = (PLATFORM_LIMITS[platform] || PLATFORM_LIMITS.default).content;
  if (!content) return "";
  return content.length > limit ? content.substring(0, limit) : content;
}

function formatTags(tags, platform) {
  if (!tags || tags.length === 0) return [];
  var style = PLATFORM_TAG_STYLE[platform] || "";
  if (style === "##") return tags.map(function(t) { return "#" + t + "#"; });
  if (style === "#") return tags.map(function(t) { return "#" + t; });
  return tags; // plain
}

function formatContent(struct, platform) {
  var title = truncateTitle(struct && struct.title, platform);
  var content = truncateContent(struct && struct.content, platform);
  var tags = formatTags(struct && struct.tags, platform);
  return { title: title, content: content, tags: tags };
}

module.exports = { formatContent, truncateTitle, truncateContent, formatTags, PLATFORM_TAG_STYLE, PLATFORM_LIMITS };
