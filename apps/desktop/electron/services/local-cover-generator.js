// @ts-check
/**
 * local-cover-generator.js — 本地内容感知封面生成器（零生图模型、零新增依赖）
 *
 * 用途：图文发布（小红书/快手/抖音图文）要求至少 1 张图片；当 AI 生图 provider 不可用
 * 或生图失败时，由本模块用「内容感知 SVG → sharp → PNG」产出**与文章内容相关**的封面，
 * 保证一键发布图文链路可用。
 *
 * 设计约束：
 * - 零模型调用：主题识别完全靠本地词典 + 哈希派生，这是「文字模型不可用」场景仍能产出
 *   内容相关封面的前提；任何对 LLM 的依赖都会让兜底在模型挂掉时一起挂掉。
 * - 零新增依赖：sharp 已在 packages/shared-utils 依赖（hoisted node_modules），主进程直接 require。
 * - 确定性：同一份内容必然产出同一张封面（便于回归断言与用户预期稳定）；换 variant 才换风格。
 * - 装饰不压字：纹样只在标题块下方的「安全区」内布局，杜绝装饰穿过标题。
 * - 比例：3:4（1080x1440，小红书/快手图文推荐竖版）/ 16:9（1920x1080）/ 1:1（1080x1080）
 *   / 4:3（1440x1080）/ 9:16（1080x1920）
 * - 输出：os.tmpdir()/multi-publish-cover-local/<时间戳>-<随机>.png（与 AI 封面目录区分）
 */
'use strict'

const fs = require('fs')
const os = require('os')
const path = require('path')

const RATIOS = Object.freeze({
  '3:4': { width: 1080, height: 1440 },
  '16:9': { width: 1920, height: 1080 },
  '1:1': { width: 1080, height: 1080 },
  '4:3': { width: 1440, height: 1080 },
  '9:16': { width: 1080, height: 1920 },
})

const FONT_STACK = "'Microsoft YaHei','PingFang SC','Hiragino Sans GB',sans-serif"
const MAX_LINES = 4

/**
 * 主题词典：每个主题 = 关键词 + 双色渐变 + 强调色 + 程序化纹样。
 * 关键词刻意收录「具体名词」（红烧肉/川西/柯基）而不只是品类词（美食/旅行）——
 * 真实标题写的是具体事物，只收品类词会大面积漏判。
 * 声明顺序即平局时的决胜顺序（保证确定性）。
 */
const TOPICS = [
  { id: 'tech', label: '科技', motif: 'circuit', from: '#0B1F3A', to: '#1E6FDB', accent: '#35E0FF',
    kw: ['ai', '人工智能', '大模型', '算法', '芯片', '编程', '代码', '软件', '互联网', '数据', '云计算', '机器人', '智能', '5g', '量子', '程序员', '开发', '开源', 'github', 'python', '大数据', '模型', '算力', 'gpu', '前端', '后端', '数据库', '神经网络', '深度学习', '苹果', '华为', '小米', '字节', '腾讯', '阿里', '百度', '谷歌', '英伟达', '显卡', '内存', '固态硬盘', '装机', 'react', 'vue', 'java', '爬虫', 'api', 'saas', '服务器', '容器', 'docker', 'k8s', 'app', 'ios', 'android', '鸿蒙', 'bug', '上线', '部署', '运维', '架构', '源码', 'chatgpt', 'claude', 'gpt', '提示词', 'prompt', 'token'] },
  { id: 'finance', label: '财经', motif: 'chart', from: '#102A43', to: '#0E7C66', accent: '#F2C94C',
    kw: ['股票', '基金', '投资', '理财', '经济', '楼市', '黄金', '汇率', '财报', '上市', '市值', '融资', '估值', '比特币', '加密货币', '银行', '降息', '加息', '收益', '亏损', '资产', '负债', '期货', '保险', '房产', 'a股', '美股', '定投', '指数', '存款', '利率', '分红', '账本', '记账'] },
  { id: 'food', label: '美食', motif: 'steam', from: '#7A2E1E', to: '#E08A3C', accent: '#FFE0A3',
    kw: ['美食', '菜谱', '做饭', '烘焙', '咖啡', '奶茶', '火锅', '烧烤', '面条', '早餐', '甜品', '蛋糕', '探店', '餐厅', '厨房', '食材', '减脂餐', '食谱', '面包', '米饭', '调味', '下饭', '甜点', '拿铁', '美式', '红烧肉', '糖醋排骨', '酸菜鱼', '麻辣烫', '可乐鸡翅', '番茄炒蛋', '三明治', '沙拉', '寿司', '拉面', '饺子', '包子', '炒饭', '意面', '披萨', '汉堡', '牛排', '烤肉', '小龙虾', '螺蛳粉', '小炒', '空气炸锅', '预制菜', '下酒菜', 'food', 'recipe', 'restaurant'] },
  { id: 'travel', label: '旅行', motif: 'mountains', from: '#0E4F6B', to: '#2A9D8F', accent: '#FFD166',
    kw: ['旅行', '旅游', '攻略', '机票', '酒店', '自驾', '露营', '户外', '景点', '打卡', '出行', '徒步', '海岛', '山野', '签证', '度假', '路线', '民宿', '行李', '风景', '日出', '古镇', '川西', '西藏', '云南', '大理', '丽江', '成都', '重庆', '三亚', '青岛', '厦门', '桂林', '西安', '京都', '首尔', '曼谷', '东京', '巴黎', '海拔', '高原', '雪山', '草原', '沙漠', '海边', '夜景', '穷游', '跟团', '自由行', '青旅', '门票', '行程', 'travel'] },
  { id: 'health', label: '健康', motif: 'pulse', from: '#134E4A', to: '#38A169', accent: '#E6FFFA',
    kw: ['健康', '减肥', '健身', '运动', '跑步', '瑜伽', '睡眠', '营养', '体检', '疾病', '心理', '抑郁', '焦虑', '疫苗', '养生', '拉伸', '蛋白', '减脂', '体态', '康复', '眼睛', '颈椎', '医生', '医院', '血压', '血糖', '感冒', '咳嗽', '训练', '拉伸', '燃脂', '补剂'] },
  { id: 'career', label: '职场', motif: 'checklist', from: '#2D3748', to: '#4A5568', accent: '#F6AD55',
    kw: ['职场', '简历', '面试', '求职', '加班', '老板', '同事', '晋升', '工资', '离职', '副业', '打工人', '效率', '沟通', '汇报', '35岁', '招聘', '试用期', '转正', '裁员', '绩效', '团队', 'offer', 'kpi', '述职', '跳槽', '实习', '外企', '国企', '考公', '编制', '甲方', '乙方', '项目', '甲方需求'] },
  { id: 'education', label: '教育', motif: 'book', from: '#312E81', to: '#4C51BF', accent: '#F6C177',
    kw: ['教育', '学习', '考试', '考研', '高考', '留学', '学校', '老师', '学生', '课程', '作业', '论文', '培训', '证书', '学历', '专业', '大学', '中学', '补课', '录取', '分数线', '单词', '四六级', '雅思', '托福', '保研', '导师', '开学', '期末', '专业课', '公开课'] },
  { id: 'game', label: '游戏', motif: 'pixel', from: '#3B0764', to: '#A21CAF', accent: '#22D3EE',
    kw: ['游戏', '电竞', '手游', '主机', 'steam', '原神', '王者', '开黑', '上分', '装备', '皮肤', '副本', '攻略', '电玩', 'ps5', 'xbox', '通关', '段位', '操作', '帧率', 'switch', 'ns', '独立游戏', '抽卡', '氪金', '玩家', '服务器', '显卡', '联机', 'steam deck'] },
  { id: 'media', label: '影视', motif: 'spotlight', from: '#18122B', to: '#6D28D9', accent: '#F472B6',
    kw: ['电影', '电视剧', '综艺', '明星', '票房', '追剧', '音乐', '歌曲', '专辑', '演唱会', '歌手', '乐评', '影评', '动漫', '番剧', '导演', '演员', '剧情', '美剧', '国剧', '音乐节', '配音', '新歌', '单曲', 'live', 'mv', '话剧', '纪录片', '小说', '作者', '出版', '连载'] },
  { id: 'pet', label: '宠物', motif: 'paw', from: '#78350F', to: '#F59E0B', accent: '#FDE68A',
    kw: ['猫', '狗', '宠物', '喵', '汪', '铲屎官', '猫粮', '狗粮', '领养', '绝育', '猫砂', '幼崽', '猫咪', '狗狗', '毛孩子', '宠物医院', '吸猫', '英短', '美短', '布偶', '橘猫', '狸花', '柯基', '柴犬', '哈士奇', '金毛', '泰迪', '猫抓板', '驱虫', '猫窝', '狗窝', '遛狗', '洗牙', '拆家', '掉毛'] },
  { id: 'car', label: '汽车', motif: 'road', from: '#1E293B', to: '#475569', accent: '#FB923C',
    kw: ['汽车', '买车', '新能源车', '电动车', '比亚迪', '特斯拉', '驾驶', '驾照', '油耗', '保养', '车位', '高速', '车祸', '车型', '试驾', '混动', '续航', '发动机', '轮胎', '轿车', 'suv', 'mpv', '提车', '车险', '年检', '违章', '停车', '导航', '辅助驾驶'] },
  { id: 'fashion', label: '时尚', motif: 'ribbon', from: '#4C1D3F', to: '#BE185D', accent: '#FBCFE8',
    kw: ['穿搭', '时尚', '服装', '化妆', '护肤', '香水', '潮流', '搭配', '口红', '面膜', '衣橱', '审美', '连衣裙', '外套', '鞋子', '发型', '染发', '包包', '首饰', '毛衣', '衬衫', '阔腿裤', '显瘦', '通勤装', '约会穿搭', '国货', '精华', '防晒'] },
  { id: 'family', label: '情感', motif: 'hearts', from: '#7E22CE', to: '#EC4899', accent: '#FDE68A',
    kw: ['育儿', '宝宝', '孩子', '父母', '婚姻', '恋爱', '情感', '婆媳', '亲子', '幼儿园', '孕', '产后', '家庭', '夫妻', '带娃', '早教', '绘本', '结婚', '离婚', '相亲', '婆', '老公', '老婆', '闺蜜', '友情', '独居', '相亲角', '催婚'] },
  { id: 'home', label: '家居', motif: 'arch', from: '#3F3A34', to: '#A67B5B', accent: '#E8D6B3',
    kw: ['家居', '装修', '收纳', '清洁', '出租屋', '断舍离', '家电', '家具', '布局', '采光', '客厅', '卧室', '厨房装修', '瓷砖', '橱柜', '软装', '好物', '宜家', '扫地机器人', '洗碗机', '投影', '窗帘', '沙发', '床品', '除螨'] },
  { id: 'growth', label: '成长', motif: 'steps', from: '#1E3A8A', to: '#3B82F6', accent: '#93C5FD',
    kw: ['成长', '认知', '思维', '习惯', '自律', '复盘', '目标', '早起', '方法论', '专注', '内耗', '情绪价值', '心智', '迭代', '闭环', '底层逻辑', '长期主义', '记笔记', '时间管理', '自我提升', '规划', '执行力', '拖延', '焦虑管理', '深度工作'] },
]

/** 可用纹样清单（与 motifs 对象一一对应） */
const MOTIFS = ['circuit', 'chart', 'steam', 'mountains', 'pulse', 'checklist', 'book', 'pixel', 'spotlight', 'paw', 'road', 'ribbon', 'hearts', 'arch', 'steps', 'dots']

/** FNV-1a 32 位哈希（无符号返回） */
function fnv1a (str) {
  let h = 0x811c9dc5
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return h >>> 0
}

/** HSL → #RRGGBB */
function hslToHex (h, s, l) {
  h = ((h % 360) + 360) % 360
  s /= 100
  l /= 100
  const c = (1 - Math.abs(2 * l - 1)) * s
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1))
  const m = l - c / 2
  // 下列 if/else 链已穷尽 h∈[0,360)，不预置初值（ESLint no-useless-assignment）
  let r, g, b
  if (h < 60) [r, g, b] = [c, x, 0]
  else if (h < 120) [r, g, b] = [x, c, 0]
  else if (h < 180) [r, g, b] = [0, c, x]
  else if (h < 240) [r, g, b] = [0, x, c]
  else if (h < 300) [r, g, b] = [x, 0, c]
  else [r, g, b] = [c, 0, x]
  const to = (v) => Math.round((v + m) * 255).toString(16).padStart(2, '0')
  return '#' + to(r) + to(g) + to(b)
}

/** 转义 SVG 文本特殊字符（标题是用户内容，防注入 SVG 标记） */
function escapeXml (text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

/** CJK/全角字符（按 2 个单位宽计） */
function isWideChar (ch) {
  return /[\u1100-\u115F\u2E80-\uA4CF\uAC00-\uD7A3\uF900-\uFAFF\uFE30-\uFE4F\uFF00-\uFF60\uFFE0-\uFFE6]/.test(ch)
}

function displayWidth (s) {
  let w = 0
  for (const ch of s) w += isWideChar(ch) ? 2 : 1
  return w
}

// 中文排版禁则：不能出现在行首 / 不能出现在行尾的字符
const NO_LINE_START = '」）》】、。，！？：；·%…—’”'
const NO_LINE_END = '（「《【‘“'

/**
 * 标题折行：按显示宽度（CJK=2 / ASCII=1）切分，遵守三条排版规则
 *  1) ASCII 连续片段视为不可分割单元（「AI」「GPT-2026」不被拆成两行）
 *  2) 闭合标点不落行首（」不单独起行）
 *  3) 开启标点不落行尾（「不挂在行尾）
 *
 * @param {string} rawTitle
 * @param {number} maxUnits - 每行最大显示宽度
 * @returns {string[]} 最多 MAX_LINES 行
 */
function wrapTitle (rawTitle, maxUnits) {
  const title = String(rawTitle || '').trim()
  if (!title) return ['图文作品']

  // 切最小排版单元：ASCII 连续片段合并为 1 个单元
  const tokens = []
  let buf = ''
  for (const ch of title) {
    if (/[A-Za-z0-9@#.+_-]/.test(ch)) { buf += ch; continue }
    if (buf) { tokens.push(buf); buf = '' }
    tokens.push(ch)
  }
  if (buf) tokens.push(buf)

  const lines = []
  let cur = ''
  for (let i = 0; i < tokens.length; i++) {
    const tk = tokens[i]
    if (cur && displayWidth(cur) + displayWidth(tk) > maxUnits) {
      let carry = null
      if (NO_LINE_START.includes(tk) && displayWidth(cur) > 2) { carry = cur.slice(-1); cur = cur.slice(0, -1) }
      lines.push(cur)
      if (lines.length >= MAX_LINES) {
        // 仍有未排入的文本 → 末行加省略号。如实标记「已截断」，
        // 否则 300 字标题会静默丢掉 278 字，调用方无从判断内容是否完整。
        if (i < tokens.length - 1 && cur.length > 0) {
          lines[lines.length - 1] = cur.slice(0, -1) + '…'
        }
        return lines
      }
      cur = (carry || '') + tk
    } else {
      cur += tk
    }
  }
  while (cur.length > 1 && NO_LINE_END.includes(cur.slice(-1)) && lines.length < MAX_LINES) {
    lines.push(cur.slice(0, -1))
    cur = cur.slice(-1)
  }
  if (cur) lines.push(cur)
  return lines.length ? lines : ['图文作品']
}

/**
 * 主题识别：标题命中权重 3、正文命中权重 1，取加权最高者
 * @returns {{topic:object, score:number}|null} 无命中返回 null
 */
function detectTopic (title, content) {
  const t = String(title || '').toLowerCase()
  const c = String(content || '').slice(0, 400).toLowerCase()
  let best = null
  let bestScore = 0
  for (const topic of TOPICS) {
    let score = 0
    for (const k of topic.kw) {
      if (t.includes(k)) score += 3
      if (c.includes(k)) score += 1
    }
    if (score > bestScore) { bestScore = score; best = topic }
  }
  return bestScore > 0 ? { topic: best, score: bestScore } : null
}

/** 抽取最多 3 个命中关键词作为副标题 */
function extractKeywords (title, content) {
  const text = (String(title || '') + ' ' + String(content || '').slice(0, 200)).toLowerCase()
  const hit = []
  for (const topic of TOPICS) {
    for (const k of topic.kw) {
      if (text.includes(k) && hit.length < 3 && !hit.some((x) => x.toLowerCase() === k)) hit.push(k.toUpperCase())
    }
    if (hit.length >= 3) break
  }
  return hit
}

/**
 * 纹样：全部在安全区 [y0, h] 内自适应布局。
 * 约定：只允许在文字块下方绘制，且以低不透明度呈现，保证标题始终是视觉主体。
 * @param {number} w @param {number} h @param {string} c 描边/填充色
 * @param {number} seed @param {number} y0 安全区上边界
 * @returns {string} SVG 片段
 */
const motifs = {
  circuit (w, h, c, seed, y0) {
    const bh = h - y0, n = 7
    let s = `<g stroke="${c}" stroke-width="2" fill="none">`
    for (let i = 0; i < n; i++) {
      const y = (y0 + (bh / n) * i).toFixed(0)
      const x = (((seed >> (i % 12)) & 255) / 255) * w * 0.7 + w * 0.15
      s += `<path d="M0 ${y} H${x.toFixed(0)} l ${(w * 0.05).toFixed(0)} ${(bh / n).toFixed(0)} H${w}"/>`
      s += `<circle cx="${x.toFixed(0)}" cy="${y}" r="5" fill="${c}" stroke="none"/>`
    }
    return s + '</g>'
  },
  chart (w, h, c, seed, y0) {
    const bh = h - y0
    let s = ''
    for (let i = 0; i < 7; i++) {
      const barH = bh * (0.25 + (((seed >> i) & 31) / 31) * 0.6)
      const bx = w * 0.06 + i * (w * 0.13)
      s += `<rect x="${bx.toFixed(0)}" y="${(h - barH).toFixed(0)}" width="${(w * 0.085).toFixed(0)}" height="${barH.toFixed(0)}" fill="${c}" opacity="0.55" rx="5"/>`
    }
    s += `<polyline points="${(w * 0.06).toFixed(0)},${(y0 + bh * 0.2).toFixed(0)} ${(w * 0.32).toFixed(0)},${(y0 + bh * 0.55).toFixed(0)} ${(w * 0.55).toFixed(0)},${(y0 + bh * 0.4).toFixed(0)} ${(w * 0.78).toFixed(0)},${(y0 + bh * 0.78).toFixed(0)} ${(w * 0.96).toFixed(0)},${(y0 + bh * 0.6).toFixed(0)}" fill="none" stroke="${c}" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>`
    return s
  },
  steam (w, h, c, seed, y0) {
    const bh = h - y0
    let s = `<g fill="none" stroke="${c}" stroke-width="6" stroke-linecap="round">`
    for (let i = 0; i < 3; i++) {
      const x = (w * (0.32 + i * 0.18)).toFixed(0)
      s += `<path d="M${x} ${(y0 + bh * 0.5).toFixed(0)} q -20 -${(bh * 0.12).toFixed(0)} 0 -${(bh * 0.24).toFixed(0)} q 20 -${(bh * 0.12).toFixed(0)} 0 -${(bh * 0.24).toFixed(0)}"/>`
    }
    s += '</g>'
    s += `<path d="M${(w * 0.18).toFixed(0)} ${(y0 + bh * 0.62).toFixed(0)} h${(w * 0.64).toFixed(0)} l -${(w * 0.05).toFixed(0)} ${(bh * 0.34).toFixed(0)} h -${(w * 0.54).toFixed(0)} z" fill="${c}" fill-opacity="0.5"/>`
    return s
  },
  mountains (w, h, c, seed, y0) {
    const bh = h - y0
    let s = `<circle cx="${(w * 0.8).toFixed(0)}" cy="${(y0 + bh * 0.16).toFixed(0)}" r="${(w * 0.09).toFixed(0)}" fill="${c}" opacity="0.6"/>`
    s += `<g fill="${c}" opacity="0.45"><path d="M0 ${h} L${(w * 0.28).toFixed(0)} ${(y0 + bh * 0.34).toFixed(0)} L${(w * 0.56).toFixed(0)} ${h} Z"/>`
    s += `<path d="M${(w * 0.32).toFixed(0)} ${h} L${(w * 0.66).toFixed(0)} ${(y0 + bh * 0.5).toFixed(0)} L${w} ${h} Z"/></g>`
    return s
  },
  pulse (w, h, c, seed, y0) {
    const bh = h - y0, y = (y0 + bh * 0.4).toFixed(0)
    return `<polyline points="0,${y} ${(w * 0.28).toFixed(0)},${y} ${(w * 0.35).toFixed(0)},${(y0 + bh * 0.12).toFixed(0)} ${(w * 0.45).toFixed(0)},${(y0 + bh * 0.78).toFixed(0)} ${(w * 0.53).toFixed(0)},${y} ${w},${y}" fill="none" stroke="${c}" stroke-width="7" stroke-linejoin="round" stroke-linecap="round"/>`
  },
  checklist (w, h, c, seed, y0) {
    const bh = h - y0, n = 4, sz = Math.min(w * 0.07, (bh / n) * 0.42)
    let s = `<g fill="none" stroke="${c}" stroke-width="4">`
    for (let i = 0; i < n; i++) {
      const y = y0 + bh * (0.15 + i * (0.8 / n)), x = w * 0.1
      s += `<rect x="${x.toFixed(0)}" y="${y.toFixed(0)}" width="${sz.toFixed(0)}" height="${sz.toFixed(0)}" rx="${(sz * 0.22).toFixed(0)}"/>`
      s += `<path d="M${(x + sz * 0.2).toFixed(0)} ${(y + sz * 0.52).toFixed(0)} l ${(sz * 0.2).toFixed(0)} ${(sz * 0.22).toFixed(0)} l ${(sz * 0.36).toFixed(0)} -${(sz * 0.44).toFixed(0)}" stroke-linecap="round" stroke-linejoin="round"/>`
      s += `<line x1="${(x + sz * 1.5).toFixed(0)}" y1="${(y + sz * 0.5).toFixed(0)}" x2="${(w * 0.9).toFixed(0)}" y2="${(y + sz * 0.5).toFixed(0)}" stroke-linecap="round"/>`
    }
    return s + '</g>'
  },
  book (w, h, c, seed, y0) {
    const bh = h - y0, n = 6
    let s = `<g stroke="${c}" stroke-width="3" fill="none" stroke-linecap="round">`
    for (let i = 0; i < n; i++) {
      const y = (y0 + bh * (0.12 + i * (0.8 / n))).toFixed(0)
      const inset = (i % 3) * w * 0.05
      s += `<line x1="${(w * 0.1 + inset).toFixed(0)}" y1="${y}" x2="${(w * 0.9 - inset).toFixed(0)}" y2="${y}"/>`
    }
    s += `<line x1="${(w * 0.5).toFixed(0)}" y1="${(y0 + bh * 0.1).toFixed(0)}" x2="${(w * 0.5).toFixed(0)}" y2="${(y0 + bh * 0.9).toFixed(0)}"/></g>`
    return s
  },
  pixel (w, h, c, seed, y0) {
    let s = ''
    for (let i = 0; i < 46; i++) {
      const bx = (((seed >> (i % 16)) & 255) / 255) * w * 0.96
      const by = y0 + (((seed >> ((i + 3) % 16)) & 255) / 255) * (h - y0) * 0.94
      const sz = w * 0.022 + (((seed >> i) & 7) / 7) * (w * 0.05)
      s += `<rect x="${bx.toFixed(0)}" y="${by.toFixed(0)}" width="${sz.toFixed(0)}" height="${sz.toFixed(0)}" fill="${c}" opacity="0.7" rx="${(sz * 0.16).toFixed(0)}"/>`
    }
    return s
  },
  spotlight (w, h, c, seed, y0) {
    const bh = h - y0
    let s = `<polygon points="${(w * 0.42).toFixed(0)},${(y0 + bh * 0.1).toFixed(0)} ${(w * 0.58).toFixed(0)},${(y0 + bh * 0.1).toFixed(0)} ${(w * 0.95).toFixed(0)},${h} ${(w * 0.05).toFixed(0)},${h}" fill="${c}" opacity="0.45"/>`
    s += `<g fill="none" stroke="${c}" stroke-width="3" opacity="0.5">`
    for (let i = 0; i < 4; i++) {
      s += `<rect x="${(w * 0.04 + i * w * 0.24).toFixed(0)}" y="${(y0 + bh * 0.06).toFixed(0)}" width="${(w * 0.2).toFixed(0)}" height="${(bh * 0.88).toFixed(0)}" stroke-dasharray="12 10" rx="8"/>`
    }
    return s + '</g>'
  },
  paw (w, h, c, seed, y0) {
    const bh = h - y0, cx = w * 0.7, cy = y0 + bh * 0.34, r = Math.min(w * 0.1, bh * 0.22)
    let s = `<g fill="${c}"><ellipse cx="${cx.toFixed(0)}" cy="${(cy + r * 0.5).toFixed(0)}" rx="${r.toFixed(0)}" ry="${(r * 0.8).toFixed(0)}"/>`
    for (let i = 0; i < 4; i++) {
      const a = (-140 + i * 40) * Math.PI / 180
      s += `<ellipse cx="${(cx + Math.cos(a) * r * 1.5).toFixed(0)}" cy="${(cy + Math.sin(a) * r * 1.5).toFixed(0)}" rx="${(r * 0.34).toFixed(0)}" ry="${(r * 0.44).toFixed(0)}"/>`
    }
    return s + '</g>'
  },
  road (w, h, c, seed, y0) {
    const bh = h - y0, ty = y0 + bh * 0.15
    let s = `<polygon points="${(w * 0.43).toFixed(0)},${ty.toFixed(0)} ${(w * 0.57).toFixed(0)},${ty.toFixed(0)} ${w},${h} 0,${h}" fill="${c}" opacity="0.3"/>`
    s += `<line x1="${(w * 0.5).toFixed(0)}" y1="${ty.toFixed(0)}" x2="${(w * 0.5).toFixed(0)}" y2="${h}" stroke="${c}" stroke-width="9" stroke-dasharray="28 24" opacity="0.55"/>`
    return s
  },
  ribbon (w, h, c, seed, y0) {
    const bh = h - y0
    let s = `<g fill="none" stroke="${c}" stroke-linecap="round">`
    for (let i = 0; i < 3; i++) {
      const y = y0 + bh * (0.2 + i * 0.28)
      s += `<path d="M-20 ${y.toFixed(0)} q ${(w * 0.26).toFixed(0)} -${(bh * 0.16).toFixed(0)} ${(w * 0.52).toFixed(0)} 0 t ${(w * 0.52).toFixed(0)} 0" stroke-width="${(16 - i * 4).toFixed(0)}" opacity="${(0.75 - i * 0.15).toFixed(2)}"/>`
    }
    return s + '</g>'
  },
  hearts (w, h, c, seed, y0) {
    let s = ''
    for (let i = 0; i < 10; i++) {
      const cx = (((seed >> (i % 12)) & 255) / 255) * w * 0.94
      const cy = y0 + (((seed >> ((i + 5) % 12)) & 255) / 255) * (h - y0) * 0.9
      const r = w * (0.025 + (i % 3) * 0.02)
      s += `<path transform="translate(${(cx - r).toFixed(0)},${(cy - r).toFixed(0)}) scale(${(r / 16).toFixed(3)})" fill="${c}" opacity="0.65" d="M16 30 C 0 18, -6 4, 4 -2 C 10 -6, 15 -1, 16 3 C 17 -1, 22 -6, 28 -2 C 38 4, 32 18, 16 30 Z"/>`
    }
    return s
  },
  arch (w, h, c, seed, y0) {
    const bh = h - y0
    let s = `<g fill="none" stroke="${c}" stroke-width="4">`
    for (let i = 0; i < 3; i++) {
      const inset = w * (0.06 + i * 0.13)
      const top = y0 + bh * (0.12 + i * 0.1)
      const aw = (w - inset * 2) / 2
      s += `<path d="M${inset.toFixed(0)} ${h} V${(top + aw).toFixed(0)} a ${aw.toFixed(0)} ${aw.toFixed(0)} 0 0 1 ${(w - inset * 2).toFixed(0)} 0 V${h}"/>`
    }
    return s + '</g>'
  },
  steps (w, h, c, seed, y0) {
    const bh = h - y0, n = 5, sw = w * 0.15, sh = (bh * 0.82) / n
    let s = `<g fill="${c}">`
    for (let i = 0; i < n; i++) {
      const x = w * 0.06 + i * sw * 1.12, y = h - (i + 1) * sh
      s += `<rect x="${x.toFixed(0)}" y="${y.toFixed(0)}" width="${sw.toFixed(0)}" height="${sh.toFixed(0)}" rx="7"/>`
    }
    return s + '</g>'
  },
  dots (w, h, c, seed, y0) {
    let s = `<g fill="${c}">`
    for (let i = 0; i < 56; i++) {
      const cx = ((seed >> (i % 16)) & 255) / 255 * w
      const cy = y0 + ((seed >> ((i + 2) % 16)) & 255) / 255 * (h - y0) * 0.95
      const r = 3 + (((seed >> i) & 7) / 7) * (w * 0.011)
      s += `<circle cx="${cx.toFixed(0)}" cy="${cy.toFixed(0)}" r="${r.toFixed(1)}"/>`
    }
    return s + '</g>'
  },
}

/**
 * 主题解析：显式指定 > 词典命中 > 内容哈希派生
 *
 * ⚠ 两处易踩的坑（均有回归测试钉住）：
 * 1) JS 的 `^` 返回**有符号** 32 位整数，哈希值 >2^31 时经 `^ k` 会翻成负数，
 *    导致 MOTIFS[负下标] === undefined，未命中分支直接崩 —— 必须 `>>> 0` 收回无符号。
 * 2) FNV-1a 的**低 4 位**对「随笔0/随笔1/…」这类高度相似串分布不均
 *    （实测 20 条只落 7 种纹样），纹样索引与色相都取高位（>>> 11）。
 */
function resolveTheme (title, content, forced, variant) {
  if (forced) {
    const t = TOPICS.find((x) => x.id === forced)
    if (t) return t
  }
  const hit = detectTopic(title, content)
  if (hit) return hit.topic
  const seed = (fnv1a(String(title || '') + '|' + String(content || '').slice(0, 200)) ^
    Math.imul((variant || 0) + 1, 2654435761)) >>> 0
  const hue = (seed >>> 11) % 360
  return {
    id: 'generated',
    label: '',
    motif: MOTIFS[(seed >>> 11) % MOTIFS.length],
    from: hslToHex(hue, 62, 26),
    to: hslToHex(hue + 40, 66, 44),
    accent: hslToHex(hue + 180, 85, 66),
  }
}

// CJK 字形相对基线的上伸比例（排版计算行盒高度用）
const ASCENT = 0.86

/**
 * 构造内容感知封面 SVG
 * @param {string} title 文章标题
 * @param {object} [options]
 * @param {number} [options.width=1080]
 * @param {number} [options.height=1440]
 * @param {string} [options.content] 正文摘要，供主题识别与关键词抽取
 * @param {string} [options.theme] 强制主题 id
 * @param {number} [options.variant=0] 风格变体，同内容换风格
 * @returns {string} SVG 字符串
 */
function buildCoverSvg (title, options = {}) {
  const w = options.width || 1080
  const h = options.height || 1440
  const theme = resolveTheme(title, options.content, options.theme, options.variant)
  const seed = (fnv1a(String(title || '') + '|' + theme.id) ^ Math.imul((options.variant || 0) + 1, 97)) >>> 0
  const units = w >= 1400 ? 13 : w >= 1000 ? 11 : 8
  const lines = wrapTitle(title, units)
  const kws = extractKeywords(title, options.content)

  // 字号按「短边」缩放（按宽缩放会把横版文字块撑爆、纹样区被挤没），
  // 并对整块高度设预算：超出则等比收缩，保证纹样安全区至少留 ~32% 画布高。
  const landscape = w / h > 1.25
  const maxBlock = Math.round(h * (landscape ? 0.58 : 0.62))
  const layout = (fs) => {
    const lineH = Math.round(fs * 1.42)
    const badgeR = Math.round(fs * 0.62)
    const badgeH = badgeR * 2
    const gap1 = Math.round(fs * 0.75)
    const gap2 = kws.length ? Math.round(fs * 0.9) : 0
    const kwsH = kws.length ? Math.round(fs * 0.46) : 0
    const titleBoxH = Math.round(fs * ASCENT) + lineH * (lines.length - 1) + Math.round(fs * 0.22)
    return { lineH, badgeR, badgeH, gap1, gap2, titleBoxH, totalH: badgeH + gap1 + titleBoxH + gap2 + kwsH }
  }
  let fs = Math.round(Math.min(w, h) * 0.072)
  let L = layout(fs)
  if (L.totalH > maxBlock) {
    fs = Math.max(Math.round(fs * (maxBlock / L.totalH)), Math.round(h * 0.032))
    L = layout(fs)
  }

  const { lineH, badgeR, badgeH, gap1, gap2, titleBoxH } = L
  const blockTop = Math.round((h - L.totalH) / 2)
  const badgeX = Math.round(w * 0.085)
  const badgeY = blockTop
  const label = theme.label || (options.variant ? '换个风格' : '内容封面')
  const barW = Math.round(fs * 0.18)
  const textX = badgeX + Math.round(fs * 0.55)
  const firstBaseline = badgeY + badgeH + gap1 + Math.round(fs * ASCENT)
  const kwsBaseline = firstBaseline + lineH * (lines.length - 1) + Math.round(fs * 0.22) + gap2 + Math.round(fs * 0.42)
  const blockBottom = kws.length ? kwsBaseline + fs * 0.1 : firstBaseline + lineH * (lines.length - 1) + fs * 0.3

  // 纹样安全区上边界：文字块下方，且不超过 84% 画高
  let safeTop = blockBottom + fs * 0.85
  if (safeTop > h * 0.84) safeTop = Math.max(h * 0.6, blockBottom + fs * 0.3)

  const tspans = lines
    .map((l, i) => `<tspan x="${textX}" dy="${i === 0 ? 0 : lineH}">${escapeXml(l)}</tspan>`)
    .join('')

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">` +
    `<defs>` +
    `<linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">` +
    `<stop offset="0%" stop-color="${theme.from}"/><stop offset="100%" stop-color="${theme.to}"/></linearGradient>` +
    `<linearGradient id="scrim" x1="0%" y1="0%" x2="0%" y2="100%">` +
    `<stop offset="0%" stop-color="#000" stop-opacity="0.26"/>` +
    `<stop offset="45%" stop-color="#000" stop-opacity="0.08"/>` +
    `<stop offset="100%" stop-color="#000" stop-opacity="0.40"/></linearGradient>` +
    `<linearGradient id="fade" x1="0%" y1="0%" x2="0%" y2="100%">` +
    `<stop offset="0%" stop-color="#000" stop-opacity="0.5"/>` +
    `<stop offset="100%" stop-color="#000" stop-opacity="0"/></linearGradient>` +
    `<clipPath id="safe"><rect x="0" y="${Math.round(safeTop)}" width="${w}" height="${Math.round(h - safeTop)}"/></clipPath>` +
    `</defs>` +
    `<rect width="${w}" height="${h}" fill="url(#bg)"/>` +
    `<g clip-path="url(#safe)">${motifs[theme.motif](w, h, '#ffffff', seed, Math.round(safeTop))}</g>` +
    `<rect x="0" y="${Math.round(safeTop - fs * 1.4)}" width="${w}" height="${Math.round(fs * 1.4)}" fill="url(#fade)"/>` +
    `<rect width="${w}" height="${h}" fill="url(#scrim)"/>` +
    `<rect x="${badgeX}" y="${badgeY}" width="${Math.round(label.length * fs * 0.62 + fs * 1.1)}" height="${badgeH}" rx="${badgeR}" fill="${theme.accent}" opacity="0.95"/>` +
    `<text x="${badgeX + Math.round(fs * 0.55)}" y="${Math.round(badgeY + badgeH * 0.68)}" font-family="${FONT_STACK}" font-size="${Math.round(fs * 0.5)}" font-weight="bold" fill="#101828">${escapeXml(label)}</text>` +
    `<rect x="${badgeX}" y="${firstBaseline - Math.round(fs * ASCENT)}" width="${barW}" height="${titleBoxH}" rx="${Math.round(fs * 0.09)}" fill="${theme.accent}"/>` +
    `<text x="${textX}" y="${firstBaseline}" font-family="${FONT_STACK}" font-size="${fs}" font-weight="bold" fill="#ffffff">${tspans}</text>` +
    (kws.length
      ? `<text x="${textX}" y="${kwsBaseline}" font-family="${FONT_STACK}" font-size="${Math.round(fs * 0.42)}" fill="#ffffff" opacity="0.86">${escapeXml(kws.join('  ·  '))}</text>`
      : '') +
    `</svg>`
}

/**
 * 生成本地内容感知封面
 * @param {string} title 文章标题（折行/截断由内部处理）
 * @param {object} [options]
 * @param {string} [options.outputDir] 输出目录（默认 os.tmpdir()/multi-publish-cover-local）
 * @param {string} [options.ratio] 宽高比（默认 3:4 竖版）
 * @param {string} [options.content] 正文摘要，供主题识别与关键词抽取
 * @param {string} [options.theme] 强制主题 id（15 个主题之一）
 * @param {number} [options.variant=0] 风格变体，同内容换风格
 * @returns {Promise<{code:number,data:{path:string,theme:string,themeLabel:string,keywords:string[]}|null,message?:string}>}
 */
async function generateLocalCover (title, options = {}) {
  try {
    const ratioKey = RATIOS[options.ratio] ? options.ratio : '3:4'
    const { width, height } = RATIOS[ratioKey]
    const outputDir = options.outputDir || path.join(os.tmpdir(), 'multi-publish-cover-local')
    fs.mkdirSync(outputDir, { recursive: true })
    const fileName = `cover-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.png`
    const outputPath = path.join(outputDir, fileName)

    const svg = buildCoverSvg(title, {
      width,
      height,
      content: options.content,
      theme: options.theme,
      variant: options.variant,
    })
    const sharp = require('sharp')
    await sharp(Buffer.from(svg)).png().toFile(outputPath)

    if (!fs.existsSync(outputPath)) {
      return { code: -1, data: null, message: '本地封面写入失败' }
    }
    const resolved = resolveTheme(title, options.content, options.theme, options.variant)
    return {
      code: 0,
      data: {
        path: outputPath,
        theme: resolved.id,
        themeLabel: resolved.label || '内容封面',
        keywords: extractKeywords(title, options.content),
      },
    }
  } catch (e) {
    return { code: -1, data: null, message: '本地封面生成失败：' + (e && e.message) }
  }
}

module.exports = {
  generateLocalCover,
  wrapTitle,
  buildCoverSvg,
  resolveTheme,
  detectTopic,
  extractKeywords,
  fnv1a,
  escapeXml,
  TOPICS,
  MOTIFS,
  motifs,
  RATIOS,
}
