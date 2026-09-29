import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { defineComponent, h, nextTick, ref } from "vue";
import { mount } from "@vue/test-utils";
import i18n from "@/i18n";
import { useCoverPreview } from "./useCoverPreview";

/**
 * 宿主组件：useCoverPreview 依赖组件作用域（watch + onScopeDispose）与 i18n 注入，
 * 因此必须在真实 setup 中调用，不能在裸函数里调。
 */
function createHost(pathRef, extra = {}) {
  let api = null;
  const Host = defineComponent({
    setup() {
      api = useCoverPreview(() => pathRef.value, extra);
      return () => h("div");
    },
  });
  const wrapper = mount(Host, { global: { plugins: [i18n] } });
  return { wrapper, get api() { return api; } };
}

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

const OK = (url) => ({ code: 0, data: { dataUrl: url }, message: "封面读取成功" });

describe("useCoverPreview", () => {
  beforeEach(() => {
    i18n.global.locale.value = "zh";
    vi.restoreAllMocks();
    delete window.electronAPI;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("导出完整性：模板消费的属性必须全部存在", () => {
    const pathRef = ref("");
    const { api } = createHost(pathRef);
    for (const key of ["dataUrl", "error", "loading", "reload"]) {
      expect(api).toHaveProperty(key);
    }
    expect(typeof api.reload).toBe("function");
  });

  it("空路径不发起 IPC，且不算错误（正常空态）", () => {
    const readCoverData = vi.fn();
    vi.stubGlobal("electronAPI", { readCoverData });
    const pathRef = ref("");
    const { api } = createHost(pathRef);

    expect(readCoverData).not.toHaveBeenCalled();
    expect(api.dataUrl.value).toBe("");
    expect(api.error.value).toBe("");
    expect(api.loading.value).toBe(false);
  });

  it("非字符串路径同样按空态处理，不投 IPC", async () => {
    const readCoverData = vi.fn();
    vi.stubGlobal("electronAPI", { readCoverData });
    const pathRef = ref(null);
    createHost(pathRef);
    pathRef.value = 123;
    await nextTick();

    expect(readCoverData).not.toHaveBeenCalled();
  });

  it("真实数据路径：code 0 → dataUrl 转发到响应式状态", async () => {
    const readCoverData = vi.fn().mockResolvedValue(OK("data:image/jpeg;base64,AAA"));
    vi.stubGlobal("electronAPI", { readCoverData });
    const pathRef = ref("D:/cover.jpg");
    const { api } = createHost(pathRef);
    await nextTick();
    await vi.waitFor(() => expect(api.loading.value).toBe(false));

    expect(readCoverData).toHaveBeenCalledWith("D:/cover.jpg");
    expect(api.dataUrl.value).toBe("data:image/jpeg;base64,AAA");
    expect(api.error.value).toBe("");
  });

  it("路径变化会重新加载并替换结果", async () => {
    const readCoverData = vi.fn()
      .mockResolvedValueOnce(OK("data:image/jpeg;base64,ONE"))
      .mockResolvedValueOnce(OK("data:image/jpeg;base64,TWO"));
    vi.stubGlobal("electronAPI", { readCoverData });
    const pathRef = ref("D:/a.jpg");
    const { api } = createHost(pathRef);
    await vi.waitFor(() => expect(api.dataUrl.value).toBe("data:image/jpeg;base64,ONE"));

    pathRef.value = "D:/b.jpg";
    await nextTick();
    await vi.waitFor(() => expect(api.dataUrl.value).toBe("data:image/jpeg;base64,TWO"));

    expect(readCoverData).toHaveBeenCalledTimes(2);
  });

  it("信封两种形状都能剥（data.dataUrl 与裸 dataUrl）", async () => {
    const pathRef = ref("D:/a.jpg");
    const flat = vi.fn().mockResolvedValue({ code: 0, dataUrl: "data:image/png;base64,FLAT" });
    vi.stubGlobal("electronAPI", { readCoverData: flat });
    const host1 = createHost(pathRef);
    await vi.waitFor(() => expect(host1.api.dataUrl.value).toBe("data:image/png;base64,FLAT"));

    const nested = vi.fn().mockResolvedValue(OK("data:image/png;base64,NESTED"));
    vi.stubGlobal("electronAPI", { readCoverData: nested });
    const host2 = createHost(ref("D:/a.jpg"));
    await vi.waitFor(() => expect(host2.api.dataUrl.value).toBe("data:image/png;base64,NESTED"));
  });

  it("code 非 0 → 如实展示服务端 message，不得伪装成空结果", async () => {
    const readCoverData = vi.fn().mockResolvedValue({ code: 1, message: "图片文件不存在" });
    vi.stubGlobal("electronAPI", { readCoverData });
    const { api } = createHost(ref("D:/gone.jpg"));
    await vi.waitFor(() => expect(api.loading.value).toBe(false));

    expect(api.dataUrl.value).toBe("");
    expect(api.error.value).toBe("图片文件不存在");
  });

  it("code 0 但 dataUrl 缺失/空白 → 回落通用不可用文案", async () => {
    const readCoverData = vi.fn().mockResolvedValue({ code: 0, data: {}, message: "" });
    vi.stubGlobal("electronAPI", { readCoverData });
    const { api } = createHost(ref("D:/weird.jpg"));
    await vi.waitFor(() => expect(api.loading.value).toBe(false));

    expect(api.dataUrl.value).toBe("");
    expect(api.error.value).toBe("封面预览不可用");
  });

  it("IPC reject → 取异常 message 作为错误", async () => {
    const readCoverData = vi.fn().mockRejectedValue(new Error("boom"));
    vi.stubGlobal("electronAPI", { readCoverData });
    const { api } = createHost(ref("D:/a.jpg"));
    await vi.waitFor(() => expect(api.loading.value).toBe(false));

    expect(api.error.value).toBe("boom");
  });

  it("同步抛错的 IPC 实现也必须被捕获（不得逃出成未处理拒绝）", async () => {
    const readCoverData = vi.fn(() => { throw new Error("sync-boom"); });
    vi.stubGlobal("electronAPI", { readCoverData });
    const { api } = createHost(ref("D:/a.jpg"));
    await vi.waitFor(() => expect(api.loading.value).toBe(false));

    expect(api.error.value).toBe("sync-boom");
  });

  it("reject 且 message 非字符串 → 回落通用文案", async () => {
    const readCoverData = vi.fn().mockRejectedValue({});
    vi.stubGlobal("electronAPI", { readCoverData });
    const { api } = createHost(ref("D:/a.jpg"));
    await vi.waitFor(() => expect(api.loading.value).toBe(false));

    expect(api.error.value).toBe("封面预览不可用");
  });

  it("无 electronAPI（浏览器打开 Vite）→ 出声且不抛错", async () => {
    const { api } = createHost(ref("D:/a.jpg"));
    await vi.waitFor(() => expect(api.loading.value).toBe(false));

    expect(api.dataUrl.value).toBe("");
    expect(api.error.value).toBe("封面预览不可用");
  });

  it("unavailableKey 可切换：裁剪弹窗用「加载失败」措辞而非缩略图措辞", async () => {
    const readCoverData = vi.fn().mockResolvedValue({ code: 0, data: {}, message: "" });
    vi.stubGlobal("electronAPI", { readCoverData });
    const { api } = createHost(ref("D:/a.jpg"), { unavailableKey: "publishPage.coverCrop.loadFailed" });
    await vi.waitFor(() => expect(api.loading.value).toBe(false));

    expect(api.error.value).toBe("封面图片加载失败");
  });

  it("竞态：迟到的旧响应必须被丢弃，不得覆盖新封面的结果", async () => {
    const slow = deferred();
    const fast = deferred();
    const readCoverData = vi.fn()
      .mockImplementationOnce(() => slow.promise)
      .mockImplementationOnce(() => fast.promise);
    vi.stubGlobal("electronAPI", { readCoverData });

    const pathRef = ref("D:/old.jpg");
    const { api } = createHost(pathRef);
    await nextTick();
    expect(readCoverData).toHaveBeenNthCalledWith(1, "D:/old.jpg");

    pathRef.value = "D:/new.jpg";
    await nextTick();
    expect(readCoverData).toHaveBeenNthCalledWith(2, "D:/new.jpg");

    fast.resolve(OK("data:image/jpeg;base64,NEW"));
    await vi.waitFor(() => expect(api.dataUrl.value).toBe("data:image/jpeg;base64,NEW"));

    slow.resolve(OK("data:image/jpeg;base64,OLD"));
    await nextTick();
    await nextTick();

    expect(api.dataUrl.value).toBe("data:image/jpeg;base64,NEW");
    expect(api.error.value).toBe("");
    expect(api.loading.value).toBe(false);
  });

  it("竞态：迟到的旧失败也不得把新结果抹成错误", async () => {
    const slow = deferred();
    const fast = deferred();
    const readCoverData = vi.fn()
      .mockImplementationOnce(() => slow.promise)
      .mockImplementationOnce(() => fast.promise);
    vi.stubGlobal("electronAPI", { readCoverData });

    const pathRef = ref("D:/old.jpg");
    const { api } = createHost(pathRef);
    await nextTick();
    pathRef.value = "D:/new.jpg";
    await nextTick();

    fast.resolve(OK("data:image/jpeg;base64,NEW"));
    await vi.waitFor(() => expect(api.dataUrl.value).toBe("data:image/jpeg;base64,NEW"));

    slow.resolve({ code: 1, message: "图片文件不存在" });
    await nextTick();
    await nextTick();

    expect(api.dataUrl.value).toBe("data:image/jpeg;base64,NEW");
    expect(api.error.value).toBe("");
  });

  it("卸载后迟到的响应不得再写状态", async () => {
    const pending = deferred();
    const readCoverData = vi.fn().mockReturnValue(pending.promise);
    vi.stubGlobal("electronAPI", { readCoverData });

    const pathRef = ref("D:/a.jpg");
    const { api, wrapper } = createHost(pathRef);
    await nextTick();
    wrapper.unmount();

    pending.resolve(OK("data:image/jpeg;base64,LATE"));
    await nextTick();
    await nextTick();

    expect(api.dataUrl.value).toBe("");
    expect(api.error.value).toBe("");
  });

  it("reload() 用当前路径重新拉取", async () => {
    const readCoverData = vi.fn()
      .mockResolvedValueOnce(OK("data:image/jpeg;base64,1"))
      .mockResolvedValueOnce(OK("data:image/jpeg;base64,2"));
    vi.stubGlobal("electronAPI", { readCoverData });
    const { api } = createHost(ref("D:/a.jpg"));
    await vi.waitFor(() => expect(api.dataUrl.value).toBe("data:image/jpeg;base64,1"));

    api.reload();
    await vi.waitFor(() => expect(api.dataUrl.value).toBe("data:image/jpeg;base64,2"));
    expect(readCoverData).toHaveBeenCalledTimes(2);
  });
});
