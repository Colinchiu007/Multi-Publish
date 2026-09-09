// 内容质量评估展示契约的纯函数，无 DOM/Element 依赖，供组件与测试复用。
export function isApplicable(dimension) {
  return dimension?.applicable !== false
}

export function hasApplicableSamples(statDimension) {
  return (statDimension?.count ?? 0) > 0
}
