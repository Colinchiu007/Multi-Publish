
/**
 * StoryboardPrompt — 视频分镜 prompt 模板生成器
 *
 * 改编自小黑插画 AI Agent 的"抽象→视觉隐喻"方法论：
 *   8 种构图模式 + 14 个动态动作 + 23 个视觉物体 + 三步隐喻法
 *
 * 用法:
 *   import { composeStoryboardPrompt, StoryboardPrompt } from './storyboard-prompt'
 *
 *   // 快速生成
 *   const prompt = composeStoryboardPrompt("AI 如何改变教育")
 *
 *   // 定制生成
 *   const prompt = composeStoryboardPrompt("市场竞争", {
 *     compositionType: '前后对比',
 *     creativeLevel: 7
 *   })
 *
 *   // 批量生成多个候选
 *   const candidates = generateCandidates("数据安全", 3)
 */

// ==================== 类型定义 ====================

export interface CompositionPattern {
  en: string
  zh: string
  description: string
  applyWhen: string[]
}

export interface ActionPoolItem {
  zh: string
  effect: string
  motion: string
}

export interface ObjectPoolItem {
  zh: string
  symbol: string
  sceneContext: string
}

export interface MetaphorResult {
  compositionType: string
  action: string
  object: string
  visualScene: string
}

export interface StoryboardPrompt {
  theme: string
  structure: string
  meaning: string
  picture: string
  color: string
  constraints: string
  keywords: string[]
}

// ==================== 构图模式 (8 Types) ====================

export const COMPOSITION_PATTERNS: Record<string, CompositionPattern> = {
  "流程展示": {
    en: "Workflow flow — step-by-step sequence",
    zh: "将抽象流程具象化为一条有清晰路径的视觉通道",
    description: "适合展示步骤、链条、阶段变化。用连接元素（箭头/轨迹）串联多个节点。",
    applyWhen: ["流程", "步骤", "阶段", "链路", "管道", "cycle", "pipeline"]
  },
  "系统局部": {
    en: "System partial — cross-section detail",
    zh: "\"管中窥豹\"，通过一个局部细节暗示整体系统",
    description: "适合展示复杂系统的核心机制。不画全貌，聚焦某个代表性截面或交互点。",
    applyWhen: ["系统", "架构", "结构", "机制", "内核", "engine", "core"]
  },
  "前后对比": {
    en: "Before/after — Split view or transition",
    zh: "通过视觉对比呈现变化，左边旧状态，右边新状态",
    description: "适合展示改进、升级、变革。中间用渐变/断层/桥梁过渡。",
    applyWhen: ["对比", "升级", "变革", "进化", "优化", "upgrade", "evolution"]
  },
  "角色状态": {
    en: "Character state — emotional/role embodiment",
    zh: "通过角色的姿态/表情/环境传递抽象概念的氛围",
    description: "适合传递情感、态度、文化内涵。角色可以是人/拟人化物件。",
    applyWhen: ["用户", "体验", "情感", "文化", "角色", "user", "experience"]
  },
  "概念隐喻": {
    en: "Concept metaphor — visual analogy",
    zh: "用已知视觉概念类比抽象概念，如\"防火墙\"=\"盾牌\"",
    description: "适合解释新技术/复杂概念。找到目标域与源域的映射关系。",
    applyWhen: ["概念", "隐喻", "类比", "解释", "定义", "concept", "metaphor"]
  },
  "方法分层": {
    en: "Method layers — stacked layers revealing depth",
    zh: "将抽象概念按层次展开，底层支撑上层",
    description: "适合展示层级、依赖、架构。底层大/基础、顶层小/应用。",
    applyWhen: ["分层", "层级", "架构", "依赖", "堆栈", "layer", "stack"]
  },
  "地图路径": {
    en: "Map route — journey with landmarks",
    zh: "将抽象过程映射为一张可导航的地图",
    description: "适合展示路线、规划、历史演进。标注关键里程碑。",
    applyWhen: ["路径", "路线", "规划", "旅程", "路线图", "roadmap", "journey"]
  },
  "迷你漫画": {
    en: "Mini comic panels — narrative sequence",
    zh: "用连环画分格讲述一个完整的小故事",
    description: "适合展示因果、场景叙事。2-4 格，每格一个关键帧。",
    applyWhen: ["叙事", "故事", "场景", "案例", "故事线", "story", "narrative"]
  }
}

// ==================== 动作库 (14 Actions) ====================

export const ACTION_POOL: ActionPoolItem[] = [
  { zh: "挤压 (squeezing)", effect: "压缩复杂信息到核心", motion: "自上而下的压合，伴随形变" },
  { zh: "剖开 (dissecting)", effect: "揭示内部结构或本质", motion: "纵向切开，展示截面" },
  { zh: "追逐 (chasing)", effect: "表现竞争或追赶趋势", motion: "平行或弧线运动，动态模糊" },
  { zh: "折叠 (folding)", effect: "合并/收拢分散元素", motion: "沿中线或螺旋向内折" },
  { zh: "放大 (magnifying)", effect: "聚焦局部细节", motion: "镜头推进或放大镜效果" },
  { zh: "缩小 (shrinking)", effect: "纳入更大上下文", motion: "镜头拉远，周围环境展开" },
  { zh: "穿透 (piercing)", effect: "突破障碍或边界", motion: "质点穿过屏障，伴随碎片/光效" },
  { zh: "缠绕 (winding)", effect: "关联/依赖/复杂纠葛", motion: "螺旋或交织，渐紧" },
  { zh: "分离 (separating)", effect: "解耦/拆解/分化", motion: "从联结状态向多方向扩散" },
  { zh: "融合 (merging)", effect: "整合/协同/统一", motion: "多元素向中心汇聚，边界模糊" },
  { zh: "弹跳 (bouncing)", effect: "波动/迭代/试错", motion: "上下或弹性轨迹，虚线路径" },
  { zh: "旋转 (spinning)", effect: "多角度审视/循环", motion: "绕轴旋转，拖影或多帧叠加" },
  { zh: "堆叠 (stacking)", effect: "积累/分级/构建", motion: "逐层向上或向内排列" },
  { zh: "拉伸 (stretching)", effect: "延伸/扩展/桥梁", motion: "两端反向牵引，弹性形变" }
]

// ==================== 物体库 (23 Objects) ====================

export const OBJECT_POOL: ObjectPoolItem[] = [
  { zh: "纸箱", symbol: "封装/存储/未知内容", sceneContext: "桌面或仓库场景，可打开/堆叠" },
  { zh: "抽屉", symbol: "收纳/分层/隐藏", sceneContext: "柜体截面，抽出一层展示内容" },
  { zh: "漏斗", symbol: "筛选/集中/转换", sceneContext: "上方宽口入，下方窄口出，颗粒/流体" },
  { zh: "天平", symbol: "平衡/权衡/对比", sceneContext: "两端托盘，砝码或抽象物体" },
  { zh: "弹簧", symbol: "弹性/张力/缓冲", sceneContext: "压缩或拉伸状态，受力箭头" },
  { zh: "积木", symbol: "模块化/组装/搭建", sceneContext: "不同形状/颜色积木，可组合" },
  { zh: "镜子", symbol: "反射/映射/自省", sceneContext: "镜面倒影，镜像世界轮廓" },
  { zh: "绳索", symbol: "连接/约束/承重", sceneContext: "两端固定，可绷紧或松弛" },
  { zh: "管道", symbol: "通道/传输/转换", sceneContext: "透明或截面管道，内部流体/粒子" },
  { zh: "齿轮", symbol: "传动/协同/机械", sceneContext: "啮合齿轮组，不同大小/转速" },
  { zh: "磁铁", symbol: "吸引/排斥/场", sceneContext: "两极标注，磁感线（虚线弧）" },
  { zh: "灯泡", symbol: "灵感/照明/能量", sceneContext: "发光或熄灭，脑内/环境光" },
  { zh: "沙漏", symbol: "时间/流逝/临界", sceneContext: "上半沙将尽，动态流沙颗粒" },
  { zh: "拼图", symbol: "完整/缺失/组合", sceneContext: "多片拼合或缺一片，互锁结构" },
  { zh: "树", symbol: "生长/分支/根基", sceneContext: "根系+树干+树冠，年轮截面" },
  { zh: "河流", symbol: "流动/方向/汇聚", sceneContext: "源头到入海，支流分叉" },
  { zh: "门", symbol: "入口/转折/可能", sceneContext: "开/关/半掩状态，门后透光" },
  { zh: "桥", symbol: "连接/跨越/过渡", sceneContext: "两岸/两物之间，结构支撑" },
  { zh: "阶梯", symbol: "递进/成长/层级", sceneContext: "逐级上升，不同高度/材质" },
  { zh: "网", symbol: "连接/捕获/筛选", sceneContext: "网格拓扑，节点大小/颜色区分" },
  { zh: "容器", symbol: "容纳/容量/边界", sceneContext: "器皿形状，水位或内容物高度" },
  { zh: "气球", symbol: "轻盈/膨胀/上升", sceneContext: "升空或系留，系绳牵引" },
  { zh: "锚", symbol: "稳定/定位/依靠", sceneContext: "锚链紧绷或松弛，水下/水上" }
]

// ==================== 三步隐喻引擎 ====================

/**
 * 三步隐喻法：抽象概念 → 构图模式匹配 → 动作+物体选择 → 视觉场景描述
 *
 * Step 1: 根据概念关键词匹配合适的构图模式
 * Step 2: 根据构图模式选择匹配的动作和物体
 * Step 3: 组合成视觉场景描述
 */

/** 概念 → 构图模式 映射规则 */
const CONCEPT_COMPOSITION_MAP: Array<{ concepts: string[], composition: string }> = [
  { concepts: ["竞争", "竞赛", "比赛", "争夺", "race", "compete"], composition: "前后对比" },
  { concepts: ["平衡", "权衡", "公平", "equal", "balance"], composition: "前后对比" },
  { concepts: ["增长", "成长", "发展", "growth", "grow"], composition: "角色状态" },
  { concepts: ["系统", "架构", "框架", "system", "framework"], composition: "方法分层" },
  { concepts: ["流程", "步骤", "pipeline", "workflow"], composition: "流程展示" },
  { concepts: ["创新", "突破", "革命", "innovation", "break"], composition: "概念隐喻" },
  { concepts: ["路线", "规划", "历史", "roadmap", "history"], composition: "地图路径" },
  { concepts: ["故事", "叙事", "案例", "story", "case"], composition: "迷你漫画" },
]

/** 构图 → 推荐动作映射 */
const COMPOSITION_ACTION_MAP: Record<string, string[]> = {
  "流程展示": ["追逐", "分离", "堆叠"],
  "系统局部": ["剖开", "放大", "穿透"],
  "前后对比": ["分离", "拉伸", "折叠"],
  "角色状态": ["缠绕", "挤压", "弹跳"],
  "概念隐喻": ["穿透", "融合", "放大"],
  "方法分层": ["堆叠", "剖开", "缩小"],
  "地图路径": ["旋转", "放大", "追逐"],
  "迷你漫画": ["弹跳", "融合", "分离"],
}

/** 构图 → 推荐物体映射 */
const COMPOSITION_OBJECT_MAP: Record<string, string[]> = {
  "流程展示": ["漏斗", "管道", "河流", "阶梯", "齿轮"],
  "系统局部": ["齿轮", "拼图", "树", "容器", "纸箱"],
  "前后对比": ["天平", "镜子", "桥", "门", "沙漏"],
  "角色状态": ["气球", "弹簧", "磁铁", "树", "锚"],
  "概念隐喻": ["灯泡", "镜子", "网", "门", "桥"],
  "方法分层": ["积木", "抽屉", "阶梯", "树", "容器"],
  "地图路径": ["河流", "阶梯", "桥", "门", "沙漏"],
  "迷你漫画": ["拼图", "绳索", "网", "积木", "纸箱"],
}

/**
 * 三步隐喻法：将抽象概念转化为视觉场景描述
 */
export function threeStepMetaphor(abstractConcept: string): MetaphorResult {
  const concept = abstractConcept.toLowerCase()

  // Step 1: 匹配构图模式
  let matchedComposition = "概念隐喻"
  for (const entry of CONCEPT_COMPOSITION_MAP) {
    if (entry.concepts.some(c => concept.includes(c))) {
      matchedComposition = entry.composition
      break
    }
  }

  // Step 2: 选择动作和物体
  const actions = COMPOSITION_ACTION_MAP[matchedComposition] || ["放大"]
  const objects = COMPOSITION_OBJECT_MAP[matchedComposition] || ["灯泡"]
  const action = actions[Math.floor(Math.random() * actions.length)]
  const object = objects[Math.floor(Math.random() * objects.length)]

  // Step 3: 组合视觉场景
  const objDetail = OBJECT_POOL.find(o => o.zh.startsWith(object))
  const actDetail = ACTION_POOL.find(a => a.zh.startsWith(action))
  const compDetail = COMPOSITION_PATTERNS[matchedComposition]

  const sceneLines = [
    "构图：" + matchedComposition + " — " + compDetail.description,
    "动作：" + (actDetail ? actDetail.zh : action) + "（" + (actDetail ? actDetail.motion : "") + "）",
    "物体：" + (objDetail ? objDetail.zh : object) + "，象征意义：" + (objDetail ? objDetail.symbol : ""),
    "场景描述：以【" + object + "】为主体，通过【" + action + "】的动态，表现「" + abstractConcept + "」的" + matchedComposition + "关系。"
  ]

  return {
    compositionType: matchedComposition,
    action: action,
    object: object,
    visualScene: sceneLines.join("\\n")
  }
}

// ==================== 分镜 Prompt 合成 ====================

/**
 * 生成完整的分镜 prompt
 *
 * @param concept - 抽象概念或主题
 * @param options - 可选配置
 * @returns 结构化的分镜 prompt
 */
export function composeStoryboardPrompt(
  concept: string,
  options?: {
    compositionType?: string
    creativeLevel?: number
    customAction?: string
    customObject?: string
  }
): StoryboardPrompt {
  const { compositionType, creativeLevel = 5, customAction, customObject } = options || {}

  const metaphor = compositionType
    ? { ...threeStepMetaphor(concept), compositionType }
    : threeStepMetaphor(concept)

  const finalAction = customAction || metaphor.action
  const finalObject = customObject || metaphor.object
  const compDetail = COMPOSITION_PATTERNS[metaphor.compositionType]
  const objDetail = OBJECT_POOL.find(o => o.zh.startsWith(finalObject))
  const actDetail = ACTION_POOL.find(a => a.zh.startsWith(finalAction))

  const detailLevel = Math.min(Math.max(creativeLevel, 1), 10)
  const showColor = detailLevel >= 4
  const showConstraints = detailLevel >= 6
  const showKeywords = detailLevel >= 3

  const colorSchemes: Record<string, string> = {
    "概念隐喻": "高饱和对比色，戏剧性光照，强调概念反差",
    "流程展示": "渐变色系，冷→暖过渡，清晰的方向性色调",
    "系统局部": "暗色调主体 + 局部高亮，吸引视线到截面",
    "前后对比": "冷暖对比（左冷右暖或反之），中间过渡带",
    "角色状态": "氛围色，与角色情绪匹配（暖=积极，冷=沉思）",
    "方法分层": "底层冷色/低饱和，上层暖色/高饱和，逐层提亮",
    "地图路径": "大地色系基调 + 标志性色彩标注里程碑",
    "迷你漫画": "每格独立配色，统一色调或递进变化",
  }

  const constraintMap: Record<string, string> = {
    "概念隐喻": "避免文字标注，让视觉元素本身传递隐喻关系; 主体占画面 60-70%",
    "流程展示": "元素之间保留 15-20% 间距放置连接线; 按阅读方向从左到右或从上到下排列",
    "系统局部": "截面边缘清晰，可用虚框暗示外部整体; 不要画完整系统",
    "前后对比": "中间过渡用渐变/碎裂/光照变化; 双方保持对称构图",
    "角色状态": "角色面部表情清晰可辨; 环境元素不超过 3 种",
    "方法分层": "底层面积 >= 上层 2 倍; 层间用虚线或浅色分隔",
    "地图路径": "标注不超过 5 个关键点; 路径线宽 2-4px 可见",
    "迷你漫画": "每格 2-4 个元素; 格间留白 10-15px",
  }

  const keywordMap: Record<string, string[]> = {
    "概念隐喻": ["analogy", "visual metaphor", "symbolism", "conceptual"],
    "流程展示": ["flow", "sequence", "arrow", "progression", "step-by-step"],
    "系统局部": ["cross-section", "detail", "close-up", "cutaway"],
    "前后对比": ["before/after", "split-view", "transition", "comparison"],
    "角色状态": ["portrait", "expression", "mood", "atmosphere", "character"],
    "方法分层": ["layered", "hierarchy", "stack", "depth", "foundation"],
    "地图路径": ["map", "route", "landmark", "path", "navigation"],
    "迷你漫画": ["comic panel", "narrative", "sequential art", "storyboard"],
  }

  return {
    theme: concept,
    structure: "构图模式：" + metaphor.compositionType + compDetail.description,
    meaning: [
      "核心概念：「" + concept + "」",
      "视觉隐喻：通过【" + finalObject + "】的【" + finalAction + "】动态，表现" + metaphor.compositionType + "关系",
      "象征意义：" + (objDetail ? objDetail.symbol : ""),
      "动作效果：" + (actDetail ? actDetail.effect : "")
    ].join("\\n"),
    picture: metaphor.visualScene,
    color: showColor ? (colorSchemes[metaphor.compositionType] || "中性色调，突出主体") : "",
    constraints: showConstraints ? (constraintMap[metaphor.compositionType] || "主体清晰，背景简洁") : "",
    keywords: showKeywords ? (keywordMap[metaphor.compositionType] || ["composition", "visual"]) : [],
  }
}

/**
 * 生成多个候选分镜 prompt
 */
export function generateCandidates(concept: string, count: number = 3): StoryboardPrompt[] {
  const candidates: StoryboardPrompt[] = []
  const usedStructures = new Set<string>()

  for (let i = 0; i < count; i++) {
    let attempts = 0
    let candidate: StoryboardPrompt

    do {
      candidate = composeStoryboardPrompt(concept, { creativeLevel: 5 + i * 2 })
      attempts++
    } while (usedStructures.has(candidate.structure) && attempts < 5)

    usedStructures.add(candidate.structure)
    candidates.push(candidate)
  }

  return candidates
}

/**
 * 将 StoryboardPrompt 渲染为字符串（可直接用作图片生成 prompt）
 */
export function renderPromptString(prompt: StoryboardPrompt): string {
  const parts: string[] = [
    "Theme: " + prompt.theme,
    prompt.structure,
    prompt.meaning,
    prompt.picture,
  ]

  if (prompt.color) parts.push("Color: " + prompt.color)
  if (prompt.constraints) parts.push("Constraints: " + prompt.constraints)
  if (prompt.keywords.length > 0) parts.push("Keywords: " + prompt.keywords.join(", "))

  return parts.join("\\n---\\n")
}

export default {
  COMPOSITION_PATTERNS,
  ACTION_POOL,
  OBJECT_POOL,
  threeStepMetaphor,
  composeStoryboardPrompt,
  generateCandidates,
  renderPromptString,
}
