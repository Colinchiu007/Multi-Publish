// 渲染端（vite dev / build）使用的 ESM Podcast RSS 孪生文件。
// 主进程仍使用 podcast-rss.js（CommonJS），避免改变 Node 端契约。
//
// 为什么必须有孪生：浏览器无法执行 CommonJS。若渲染层直接
// `import podcastRss from '@multi-publish/shared-utils/src/podcast-rss'`，
// vite dev server 会在**运行时**抛「does not provide an export named ...」——
// rollup 构建期有 commonjs 插件兜底、vitest 有自己的 interop，所以打包与单测都绿，
// 只有跑 dev server 的视觉回归会红（本仓 2026-10-07 / PR #3011 真实踩过一次，
// 静态判据见 scripts/check-renderer-cjs-boundary.js 头注释）。
//
// 本孪生**只承载渲染层实际消费的切面**（分类/枚举目录 + 时长格式化），对齐
// platform-definitions / publish-audit-status 的窄面孪生先例：feed 的构建、校验、
// 自检一律留在主进程侧，渲染层不得自行产 feed。
// 枚举与函数必须与 podcast-rss.js 逐字对齐；漂移由
// __tests__/podcast-rss.test.js 的「CJS/ESM 孪生 parity」回归拦截。

/** iTunes 分级取值（引擎单一真源的同值副本，parity 回归锁定） */
export const EXPLICIT_VALUES = ['yes', 'no', 'clean']

/** 单集类型（full/trailer/bonus） */
export const EPISODE_TYPE_VALUES = ['full', 'trailer', 'bonus']

/** feed 类型（episodic 连载 / serial 顺序） */
export const EPISODE_FEED_TYPE_VALUES = ['episodic', 'serial']

/** iTunes 分类目录：顶级 → 子分类。渲染层下拉的唯一来源。 */
export const ITUNES_CATEGORIES = {
  'The Arts': ['Design', 'Fashion & Beauty', 'Food', 'Performing Arts', 'Visual Arts', 'Popular Culture', 'Relationships', 'Behind the Scenes', 'Crafts', 'Home & Garden'],
  'Business': ['Careers', 'Entrepreneurship', 'Management', 'Marketing', 'Non-Profit'],
  'Comedy': ['Comedy Interviews', 'Improv', 'Stand-Up', 'Sketch Comedy'],
  'Education': ['Alternative Education', 'Courses', 'Education for Kids', 'Higher Education', 'Primary & Secondary Schooling', 'Special Education', 'Tutorials', 'Self-Development', 'Language Learning'],
  'Fiction': ['Audio Drama', 'Science Fiction', 'Storytelling'],
  'Government': ['Countries', 'Local', 'National', 'State'],
  'Health & Fitness': ['Alternative Health', 'Audiology', 'Dental', 'Fitness', 'Health', 'Medication', 'Nutrition', 'Psychology', 'Public Health', 'Sexuality', 'Sleep', 'Sports Medicine', 'Surgery'],
  'History': ['Ancient', 'Africa', 'Americas', 'Asia', 'Europe', 'Middle East', 'Oceania', 'Present'],
  'Kids & Family': ['Education', 'Free Fun', 'Parenting', 'Pets & Animals'],
  'Leisure': ['Games & Hobbies', 'Automotive', 'Aviation', 'Hobbies', 'Video Games'],
  'Music': ['Music History & Commentary', 'Music Interviews', 'Music Listings'],
  'News Politics': ['Daily News', 'Politics', 'World News'],
  'Religion & Spirituality': ['Christianity', 'Hinduism', 'Islam', 'Judaism', 'Paganism', 'Spirituality'],
  'Science': ['Life Sciences', 'Natural Sciences', 'Physics', 'Social Sciences', 'Technology'],
  'Society Culture': ['Culture', 'Documentary', 'Ethnic & Identity', 'Flags & Countries', 'Genealogy', 'Interviews', 'Personal Journals', 'Philosophy', 'Places & Travel', 'Relationships'],
  'Sports': ['Amateur', 'Basketball', 'College', 'Cricket', 'Football', 'Golf', 'Motor Sports', 'Olympics', 'Outdoor', 'Professional', 'Rugby', 'Soccer', 'Fantasy'],
  'Technology': ['Gadgets', 'Podcasting', 'Software How-To'],
  'True Crime': ['Crime Fiction', 'Justice']
}

/**
 * 秒数 → itunes:duration 展示串（不足一小时为 mm:ss，超过为 hh:mm:ss）。
 * 与 podcast-rss.js 的 formatDuration 同实现；parity 回归逐表比对。
 */
export function formatDuration (totalSec) {
  const s = Math.max(0, Math.floor(Number(totalSec) || 0))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  const pad = (n) => String(n).padStart(2, '0')
  return h > 0 ? `${pad(h)}:${pad(m)}:${pad(sec)}` : `${pad(m)}:${pad(sec)}`
}
