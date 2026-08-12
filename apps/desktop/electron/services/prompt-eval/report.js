// @ts-check
/**
 * PromptEval 报告生成与聚合分析
 */
const { gradeForScore, IMAGE_DIMENSIONS } = require('./dimensions')

const DIMENSION_LABELS = {
  relevance: '关联度',
  content_accuracy: '内容准确性',
  aesthetic_quality: '视觉审美质量',
  cross_image_consistency: '跨图上下文一致性',
  temporal_consistency: '时序一致性（v2）',
  motion_accuracy: '运动准确性（v2）',
  audio_visual_sync: '音画同步（v2）',
  video_aesthetic_quality: '视频审美质量（v2）',
}

const GRADE_LABELS = {
  excellent: '优秀',
  good: '良好',
  fair: '一般',
  poor: '差',
}

const PROBLEM_CATEGORY_LABELS = {
  content_missing: '关键元素缺失',
  content_wrong: '元素错误/幻觉',
  style_deviation: '风格偏离',
  layout_composition: '构图问题',
  color_lighting: '色彩/光影问题',
  text_rendering: '文字渲染问题',
  ambiguity: '提示词歧义',
  context_loss: '上下文丢失',
  consistency_break: '跨图一致性断裂',
  quality_defect: '图像质量缺陷',
  unknown: '其他',
}

const SEVERITY_LABELS = { critical: '🔴 Critical', major: '🟠 Major', minor: '🟡 Minor' }

function buildRecord ({ input, parsed, meta }) {
  const now = new Date().toISOString()
  const items = (input.items || []).map((item, i) => ({
    imagePath: item.imagePath || '',
    sourceText: item.sourceText || '',
    context: item.context || null,
    optimizedPrompt: item.optimizedPrompt || '',
    negativePrompt: item.negativePrompt || '',
    imageIndex: typeof item.imageIndex === 'number' ? item.imageIndex : i,
  }))
  return {
    id: (meta && meta.id) || 'eval-unknown',
    mediaType: input.mediaType || 'image',
    evaluatedAt: now,
    overallScore: parsed.overall,
    weightedScore: parsed.weightedScore,
    grade: parsed.grade,
    overallMismatch: parsed.overallMismatch === true,
    dimensions: (parsed.dimensions || []).map(d => ({ ...d })),
    problems: (parsed.problems || []).map(p => ({ ...p })),
    promptOptimizationPoints: (parsed.promptOptimizationPoints || []).map(p => ({ ...p })),
    evaluatorModel: (meta && meta.evaluatorModel) || null,
    truncated: (meta && meta.truncated) === true,
    sanitizedKeys: (meta && meta.sanitizedKeys) || [],
    inputSnapshot: {
      mediaType: input.mediaType || 'image',
      items,
      options: input.options || {},
    },
  }
}

function toMarkdown (record) {
  const lines = []
  lines.push('# 提示词评估报告')
  lines.push('')
  lines.push('- 记录 ID：' + record.id)
  lines.push('- 评估时间：' + record.evaluatedAt)
  lines.push('- 媒体类型：' + (record.mediaType === 'video' ? '视频' : '图片'))
  lines.push('- 评估模型：' + (record.evaluatorModel || '未知'))
  lines.push('')
  lines.push('## 总体分：' + record.overallScore + '（' + (GRADE_LABELS[record.grade] || record.grade) + '）')
  if (record.overallMismatch) lines.push('> ⚠️ LLM 总体分与加权分偏差超过 10 分')
  lines.push('')
  lines.push('## 维度评分')
  lines.push('')
  lines.push('| 维度 | 分数 | 依据 |')
  lines.push('|------|------|------|')
  for (const d of record.dimensions || []) {
    lines.push('| ' + (DIMENSION_LABELS[d.id] || d.id) + ' | ' + d.score + ' | ' + String(d.evidence || '').replace(/\|/g, '\\|').replace(/\n/g, ' ') + ' |')
  }
  lines.push('')
  if ((record.problems || []).length > 0) {
    lines.push('## 问题清单')
    lines.push('')
    for (const p of record.problems) {
      lines.push('- ' + (SEVERITY_LABELS[p.severity] || p.severity) + ' ｜ ' + p.category + '（' + (PROBLEM_CATEGORY_LABELS[p.category] || p.category) + '） ｜ 归因：' + p.promptPart)
      lines.push('  - ' + p.description + (p.suggestion ? '（建议：' + p.suggestion + '）' : ''))
    }
    lines.push('')
  }
  if ((record.promptOptimizationPoints || []).length > 0) {
    lines.push('## 提示词优化点')
    lines.push('')
    for (const pt of record.promptOptimizationPoints) {
      lines.push('- [' + pt.type + ']（' + (pt.target || 'optimized_prompt') + '）：' + pt.suggestion)
    }
    lines.push('')
  }
  lines.push('## 输入快照')
  lines.push('')
  for (const item of (record.inputSnapshot && record.inputSnapshot.items) || []) {
    lines.push('### 图片 ' + item.imageIndex + '：' + item.imagePath)
    lines.push('- 原始文案：' + item.sourceText)
    lines.push('- 上下文：' + (item.context ? JSON.stringify(item.context) : '（未提供）'))
    lines.push('- 优化后提示词：' + item.optimizedPrompt)
    lines.push('- 负向提示：' + (item.negativePrompt || '（未提供）'))
  }
  lines.push('')
  if (record.truncated) lines.push('> ⚠️ 输入快照超长，已裁剪')
  return lines.join('\n')
}

function aggregate (records) {
  const list = Array.isArray(records) ? records : []
  if (list.length === 0) {
    return { recordCount: 0, averageOverall: 0, gradeDistribution: {}, dimensionAverages: [], problemCategories: [], promptPartDistribution: [], optimizationPoints: [], recommendations: [] }
  }
  const gradeDistribution = {}
  const dimMap = {}
  const problemMap = {}
  const partMap = {}
  const pointMap = {}
  let overallSum = 0
  for (const r of list) {
    overallSum += r.overallScore || 0
    gradeDistribution[r.grade || 'unknown'] = (gradeDistribution[r.grade || 'unknown'] || 0) + 1
    for (const d of r.dimensions || []) {
      if (!dimMap[d.id]) dimMap[d.id] = { sum: 0, count: 0 }
      dimMap[d.id].sum += d.score
      dimMap[d.id].count += 1
    }
    for (const p of r.problems || []) {
      const key = p.category
      if (!problemMap[key]) problemMap[key] = { category: key, count: 0, severity: {} }
      problemMap[key].count += 1
      problemMap[key].severity[p.severity] = (problemMap[key].severity[p.severity] || 0) + 1
      partMap[p.promptPart] = (partMap[p.promptPart] || 0) + 1
    }
    for (const pt of r.promptOptimizationPoints || []) {
      if (!pointMap[pt.type]) pointMap[pt.type] = { type: pt.type, count: 0, examples: [] }
      pointMap[pt.type].count += 1
      if (pointMap[pt.type].examples.length < 3 && !pointMap[pt.type].examples.includes(pt.suggestion)) {
        pointMap[pt.type].examples.push(pt.suggestion)
      }
    }
  }
  const dimensionAverages = Object.entries(dimMap).map(([id, v]) => ({
    id,
    label: DIMENSION_LABELS[id] || id,
    average: Number((v.sum / v.count).toFixed(1)),
  })).sort((a, b) => b.average - a.average)
  const problemCategories = Object.values(problemMap).sort((a, b) => b.count - a.count)
  const promptPartDistribution = Object.entries(partMap).map(([promptPart, count]) => ({ promptPart, count })).sort((a, b) => b.count - a.count)
  const optimizationPoints = Object.values(pointMap).sort((a, b) => b.count - a.count)
  const topProblems = problemCategories.slice(0, 3)
  const recommendations = []
  for (const p of topProblems) {
    const label = PROBLEM_CATEGORY_LABELS[p.category] || p.category
    recommendations.push('高频问题「' + label + '」（' + p.count + ' 次）：建议优先调整提示词优化引擎的对应改写策略，并在负向提示/上下文锚点中补充约束。')
  }
  const topPoint = optimizationPoints[0]
  if (topPoint) {
    recommendations.push('最高频优化点类型「' + topPoint.type + '」（' + topPoint.count + ' 次）：' + (topPoint.examples[0] || '建议补充具体细节与约束。'))
  }
  return {
    recordCount: list.length,
    averageOverall: Number((overallSum / list.length).toFixed(1)),
    gradeDistribution,
    dimensionAverages,
    problemCategories,
    promptPartDistribution,
    optimizationPoints,
    recommendations,
  }
}

module.exports = { buildRecord, toMarkdown, aggregate, GRADE_LABELS, DIMENSION_LABELS }

