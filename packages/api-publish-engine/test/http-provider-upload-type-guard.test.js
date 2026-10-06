const assert = require("assert");
const { PLATFORM_CONFIG } = require("../upload/providers/http-config");
const HttpProvider = require("../upload/providers/http-provider");

/**
 * 回归锁：未知 uploadType 必须**显式抛错**，不得退化为 return null。
 *
 * 起因：原先的 uploadType 白名单校验写在 try 内部，而本函数末尾的
 * `catch(e){ console.warn(...); return null }` 会把它吞掉——注释承诺的
 * 「应当当场失败」实际只是把「静默走单次 POST」换成了「静默返回 null」，
 * 而 null 与「平台没返回 fileId」「文件读失败」在调用方
 * （upload/orchestrator.js）完全不可区分。等于新造一处静默失败。
 *
 * 该缺陷在既有测试下始终为绿：既有用例传的是 async 回调给同步 t()，
 * 从未被 await，断言不生效。本文件全部 await，断言真实执行。
 */
(async function () {
  let p = 0, f = 0;
  const ok = (cond, msg) => assert.ok(cond, msg);

  try {
    // 1) 未知 uploadType → 必须抛，而不是返回 null
    PLATFORM_CONFIG.zz_regression_platform = {
      uploadType: "chunk", // 故意用已被更正掉的失真值
      apiDomain: "https://example.invalid",
      uploadPath: "/upload",
      referer: "https://example.invalid/",
    };
    const prov = new HttpProvider();
    let threw = null, returned;
    try {
      returned = await prov.uploadVideo(
        { platform: "zz_regression_platform", filePath: "/tmp/does-not-matter.mp4" }, "c=1");
    } catch (e) { threw = e; }
    ok(threw !== null, "未知 uploadType 应当抛出，实得返回 " + JSON.stringify(returned));
    ok(/unknown uploadType/.test(threw.message), "错误信息应指明 uploadType 问题，实得：" + threw.message);
    ok(/zz_regression_platform/.test(threw.message), "错误信息应指明平台，实得：" + threw.message);
    p++; console.log("  ✅ 未知 uploadType 显式抛出，不被末尾 catch 吞成 null");
  } catch (e) {
    f++; console.log("  ❌ 未知 uploadType 未抛出：" + e.message);
  }

  try {
    // 2) 已登记的 single-post 仍应正常走原有分支（不因本次移动而回归）
    PLATFORM_CONFIG.zz_single_post = {
      uploadType: "single-post",
      apiDomain: "https://example.invalid",
      uploadPath: "/upload",
      referer: "https://example.invalid/",
    };
    const prov = new HttpProvider();
    // 不给真实文件 → fs 读失败会被末尾 catch 吞成 null，这是**预期**行为
    const r = await prov.uploadVideo({ platform: "zz_single_post", filePath: "/tmp/nope.mp4" }, "c=1");
    ok(r === null, "已登记 uploadType 的读文件失败仍应走原有 catch 返回 null，实得 " + JSON.stringify(r));
    p++; console.log("  ✅ 已登记 uploadType 的失败路径行为不变（未被新校验误伤）");
  } catch (e) {
    f++; console.log("  ❌ 已登记 uploadType 路径被误伤：" + e.message);
  }

  try {
    // 3) 未登记平台（无 config）仍应返回 null，不得抛——保持既有契约
    const prov = new HttpProvider();
    const r = await prov.uploadVideo({ platform: "zz_no_such_platform", filePath: "/tmp/x.mp4" }, "c=1");
    ok(r === null, "未登记平台应返回 null，实得 " + JSON.stringify(r));
    p++; console.log("  ✅ 未登记平台仍返回 null，既有契约不变");
  } catch (e) {
    f++; console.log("  ❌ 未登记平台被误抛：" + e.message);
  }

  // 清理注入的配置，避免污染同进程内其他用例
  delete PLATFORM_CONFIG.zz_regression_platform;
  delete PLATFORM_CONFIG.zz_single_post;

  console.log("\n  ========== " + p + "/" + (p + f) + " ==========");
  if (f) process.exit(1);
})();