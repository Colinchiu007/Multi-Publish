const asar = require("@electron/asar");
const path = require("path");

function normalizeEntry(entry) {
  return String(entry || "").replace(/\\/g, "/").replace(/^\/+/, "");
}

function inspectAsar(asarPath, archive = asar) {
  const rawEntries = archive.listPackage(asarPath);
  const entries = rawEntries.map(normalizeEntry);
  const rawByEntry = new Map(rawEntries.map(entry => [normalizeEntry(entry), entry]));
  const top = entries.filter(entry => !entry.includes("/")).slice(0, 30);
  const hasMain = rawByEntry.has("electron/main.js");
  const hasDist = entries.some(entry => entry.startsWith("dist/"));
  const mainSize = hasMain
    ? archive.statFile(asarPath, "electron/main.js").size
    : null;
  return { top, hasMain, hasDist, mainSize };
}

function main() {
  const asarPath = path.join(
    __dirname,
    "dist-electron", "win-unpacked", "resources", "app.asar"
  );
  const result = inspectAsar(asarPath);
  console.log("Top-level in asar:");
  result.top.forEach(entry => console.log("  " + entry));
  console.log("\nHas electron/main.js:", result.hasMain);
  console.log("Has dist/:", result.hasDist);
  if (result.mainSize !== null) {
    console.log("  electron/main.js size:", result.mainSize, "bytes");
  }
  if (!result.hasMain || !result.hasDist) {
    console.error("ASAR 缺少必需的 Electron 主进程或前端产物");
    process.exitCode = 1;
  }
  return result;
}

if (require.main === module) {
  main();
}

module.exports = { normalizeEntry, inspectAsar, main };
