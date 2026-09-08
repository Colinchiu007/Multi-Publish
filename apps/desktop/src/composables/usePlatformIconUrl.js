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
export function platformIconUrl(platformId) {
  return getPlatformIconUrl(platformId)
}
