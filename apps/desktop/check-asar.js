const asar = require("@electron/asar");
const path = require("path");

const asarPath = path.join(
  __dirname,
  "dist-electron", "win-unpacked", "resources", "app.asar"
);

const entries = asar.listPackage(asarPath);
const top = entries.filter(e => !e.includes("/")).slice(0, 30);
console.log("Top-level in asar:");
top.forEach(e => console.log("  " + e));

const hasMain = entries.some(e => e === "electron/main.js");
const hasDist = entries.some(e => e.startsWith("dist/"));

console.log("\nHas electron/main.js:", hasMain);
console.log("Has dist/:", hasDist);

if (hasMain) {
  const stat = asar.statFile(asarPath, "electron/main.js");
  console.log("  electron/main.js size:", stat.size, "bytes");
}
