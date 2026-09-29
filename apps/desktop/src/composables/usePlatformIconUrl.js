/**
 * 平台图标 URL 解析器
 * 将平台 ID 映射到真实 SVG 图标资源 URL（Vite 静态导入）
 */
import wechatMpIcon from '@/assets/platforms/wechat_mp.svg'
import zhihuIcon from '@/assets/platforms/zhihu.svg'
import weiboIcon from '@/assets/platforms/weibo.svg'
import douyinIcon from '@/assets/platforms/douyin.svg'
import xiaohongshuIcon from '@/assets/platforms/xiaohongshu.svg'
import tencentVideoIcon from '@/assets/platforms/tencent_video.svg'
import kuaishouIcon from '@/assets/platforms/kuaishou.svg'
import toutiaoIcon from '@/assets/platforms/toutiao.svg'
import bilibiliIcon from '@/assets/platforms/bilibili.svg'
import baijiahaoIcon from '@/assets/platforms/baijiahao.svg'
import youtubeIcon from '@/assets/platforms/youtube.svg'
import tiktokIcon from '@/assets/platforms/tiktok.svg'
import twitterIcon from '@/assets/platforms/twitter.svg'
import instagramIcon from '@/assets/platforms/instagram.svg'
import facebookIcon from '@/assets/platforms/facebook.svg'

const ICON_URL_MAP = {
  wechat_mp: wechatMpIcon,
  zhihu: zhihuIcon,
  weibo: weiboIcon,
  douyin: douyinIcon,
  xiaohongshu: xiaohongshuIcon,
  tencent_video: tencentVideoIcon,
  kuaishou: kuaishouIcon,
  toutiao: toutiaoIcon,
  bilibili: bilibiliIcon,
  baijiahao: baijiahaoIcon,
  youtube: youtubeIcon,
  tiktok: tiktokIcon,
  twitter: twitterIcon,
  instagram: instagramIcon,
  facebook: facebookIcon,
}

/**
 * 获取平台图标 URL
 * @param {string} platformId - 平台标识
 * @returns {string} 图标 URL，未匹配时返回空字符串
 */
export function getPlatformIconUrl(platformId) {
  return ICON_URL_MAP[platformId] || ''
}

/**
 * 获取平台图标 URL（别名，兼容旧调用方式）
 * @param {string} platformId - 平台标识
 * @returns {string} 图标 URL
 */
export function platformIconUrl (platformId) {
  return getPlatformIconUrl(platformId)
}

/**
 * 判断一个图标值是否应当按 <img> 渲染，否则按文字渲染。
 *
 * 必须认 './' 相对产物：vite.config.js 的 base 为 './'，一旦某个 svg 长大到超过
 * Vite 的 assetsInlineLimit（默认 4096B），它就不再内联为 data URI 而是产出
 * ./assets/x.svg；不认这个前缀时组件会走 v-else 的 <span>{{ icon }}</span> 分支，
 * 把路径字符串当文字直接显示到卡片上。
 *
 * 同时必须拒绝真源 PLATFORM_ICONS 的历史值（"platforms/douyin.svg" 这类裸相对名）：
 * 它不是可解析 URL，当成 URL 渲染得到的是破图，比回退成文字更难看懂。
 *
 * @param {unknown} value - 图标值（URL / data URI / emoji / 首字回退）
 * @returns {boolean}
 */
// 注意：这是**图标资源**加载白名单（允许 data: 与相对路径），与渲染层「能不能把 URL 绑成
// 可点击锚点」的判据 @multi-publish/shared-utils/src/safe-http-url 是**不同问题轴**，不可互换，
// 也不要"顺手收敛"成一份 —— 合并会让图标功能退化。见 PRD-HREF-SCHEME-GUARD-2026-09-29 §5.1。
export function isPlatformIconUrl (value) {
  if (typeof value !== 'string') return false
  const v = value.trim()
  if (!v) return false
  return v.startsWith('./')
    || v.startsWith('/')
    || v.startsWith('data:')
    || v.startsWith('http://')
    || v.startsWith('https://')
}
