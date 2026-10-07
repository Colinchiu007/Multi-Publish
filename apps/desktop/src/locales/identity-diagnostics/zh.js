/**
 * 身份诊断文案（连接/登录失败时的技术详情与一键复制）
 *
 * 从 locales/zh.js 的 memberCenter 命名空间拆出。
 *
 * 为什么拆：memberCenter 已挂账 3709 行、只剩 200 行增长容差，而诊断文案
 * 会随排障需求反复增补（每加一个分类就要加中英两条）。继续喂大文件迟早撞门禁，
 * 且会让真实的大块文案难以 review。
 *
 * 装配：locales/zh.js import 后展开回 memberCenter 命名空间内，键名与拆出前完全一致，
 * 因此组件里的 `t('memberCenter.diagnosticsXxx')` 无需改动。
 *
 * ⚠️ zh/en 必须成对修改：门禁 .github/scripts/check-locale-sync.js 的 --pair-base
 *    按目录把同名 zh.js / en.js 配对；--keys 扫描只跟随**默认相对导入**，
 *    因此本文件只能 `export default`，不得改成命名导入。
 */
export default {
  // ─── 网络失败细分（各自给出可执行的建议，而不是笼统的「稍后重试」）───
  // 关键约束：TLS 类**绝不能**建议用户关闭证书校验 —— 那是安全事故，
  // 正确做法是找 IT 加白名单。见下方 networkTlsBlocked。
  networkUnavailable: '网络暂时不可用，请稍后重试。',
  networkTlsBlocked: '安全连接无法建立，你的网络环境可能拦截了访问（常见于公司代理、杀毒软件的 HTTPS 扫描、VPN）。请勿关闭证书校验——那会让登录凭证暴露给中间设备。正确做法是让 IT 将服务地址加入白名单。',
  networkDnsFailed: '连不上服务地址，可能是设备未联网或 DNS 异常。请检查网络连接，重启路由器后再试。',
  networkTimeout: '连接超时，网络较慢或服务繁忙。请稍后重试；若持续超时，可尝试切换网络（如手机热点）。',
  networkProxyBlocked: '检测到网络代理或加速工具阻止了连接。请尝试关闭后重试，或在代理中放行本应用。',

  // ─── 技术详情折叠区（一键复制诊断信息）───
  diagnosticsShow: '技术详情',
  diagnosticsHide: '收起技术详情',
  diagnosticsLoading: '正在获取诊断信息…',
  diagnosticsEmpty: '暂无诊断信息。',
  diagnosticsCopy: '复制诊断信息',
  diagnosticsCopied: '已复制，可直接粘贴给我们',
  diagnosticsCopyFailed: '复制失败，请手动选中上方文本复制',
}