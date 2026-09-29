/**
 * useCoverPreview — 把「封面本地绝对路径」解析成渲染层可显示的 dataURL
 *
 * 存在理由（两处不可省略的收敛）：
 *  1. 渲染层 CSP 的 img-src 不含 `file:`，本地绝对路径不能直接当 `<img src>`，
 *     必须经主进程 `cover:read-data` 转成 dataURL。该「剥信封」动作
 *     （`res.data.dataUrl || res.dataUrl`）此前散落在 CoverCropDialog 内部；
 *     同一剥壳逻辑抄第二份必然漂移，故收敛为唯一实现。
 *  2. 封面路径有五个写入口（提取 / AI 生成 / 裁剪 / 手动选择 / 草稿恢复）。
 *     预览挂在字段上而非挂在按钮回调上，新增入口才不会再被漏接线。
 *
 * 竞态是本模块的核心约束：用户可连续点「提取 → AI 生成 → 裁剪」，
 * 迟到的旧响应若写回状态，缩略图会显示上一张封面 —— 那是比「没有缩略图」
 * 更糟的错误证据。故每次加载领一个序号，写状态前比对，不等即整段丢弃。
 */
import { onScopeDispose, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { getApi } from "@/api/electron-bridge";

export function useCoverPreview (pathGetter, options = {}) {
  const { t } = useI18n();
  // 两处消费面的措辞不同：缩略图位是「预览不可用」（图仍可选用），
  // 裁剪弹窗是「加载失败」（没有图就无法裁剪）。
  const unavailableKey = options.unavailableKey || "publishPage.coverPreview.unavailable";
  const unavailable = () => t(unavailableKey);
  const dataUrl = ref("");
  const error = ref("");
  const loading = ref(false);
  let requestToken = 0;

  async function run (imagePath, token) {
    const stale = () => token !== requestToken;
    const reader = getApi()?.readCoverData;

    if (typeof reader !== "function") {
      // 浏览器打开 Vite 时无 electronAPI：所有 IPC 调用默认静默 fallback，
      // 这里必须出声，否则用户看到的是「没有封面」而不是「预览不可用」。
      if (stale()) return;
      error.value = unavailable();
      loading.value = false;
      return;
    }

    let result = null;
    let failure = null;
    try {
      result = await reader(imagePath);
    } catch (e) {
      failure = e;
    }
    if (stale()) return;

    if (failure) {
      error.value = typeof failure?.message === "string" && failure.message.trim()
        ? failure.message
        : unavailable();
    } else {
      const url = result?.data?.dataUrl || result?.dataUrl || "";
      if (result?.code === 0 && typeof url === "string" && url.trim()) {
        dataUrl.value = url;
      } else {
        // 不得兜底成空对象/空串了事：那会把契约破坏伪装成「没有封面」。
        error.value = typeof result?.message === "string" && result.message.trim()
          ? result.message
          : unavailable();
      }
    }
    loading.value = false;
  }

  function load (imagePath) {
    const token = ++requestToken;
    dataUrl.value = "";
    error.value = "";
    if (typeof imagePath !== "string" || !imagePath) {
      loading.value = false;
      return;
    }
    loading.value = true;
    run(imagePath, token);
  }

  watch(pathGetter, (next) => load(next), { immediate: true });
  // 卸载即作废在途请求：组件已消失，迟到响应无人消费
  onScopeDispose(() => { requestToken += 1; });

  return { dataUrl, error, loading, reload: () => load(pathGetter()) };
}
