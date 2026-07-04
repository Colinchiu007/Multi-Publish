const assert = require("assert");
let pass=0,fail=0;

// async-aware test runner
var testQueue = Promise.resolve();
function t(n,fn){
  testQueue = testQueue.then(async function(){
    try{await fn();pass++;console.log("  OK "+n)}
    catch(e){fail++;console.log("  FAIL "+n+": "+e.message)}
  });
}
function eq(a,b){assert.deepStrictEqual(a,b)}

var mockIpcMain={handlers:{}};
mockIpcMain.handle=function(ch,fn){this.handlers[ch]=fn};

var mockEngine={
  lastOpts:null,
  render:function(p,opts){this.lastOpts=opts;return{success:true,outputPath:"/tmp/t.mp4"}},
  cancel:function(){this.canceled=true},
  getStatus:function(){return{ready:true}},
  installDeps:function(cb){return{success:true}},
  listCompositions:function(){return[{id:"Explainer",label:"test"}]},
  listProfiles:function(){return["youtube-landscape"]},
};
var mockWin={webContents:{send:function(){}}};
var mockBW={fromWebContents:function(){return mockWin}};

var registerHandlers=require("../electron/ipc-handlers/render");
registerHandlers(mockIpcMain,{renderEngine:mockEngine,BrowserWindow:mockBW,log:console.log});

console.log("=== IPC channel ===");
t("render:start",function(){eq(typeof mockIpcMain.handlers["render:start"],"function")});
t("render:cancel",function(){eq(typeof mockIpcMain.handlers["render:cancel"],"function")});
t("render:status",function(){eq(typeof mockIpcMain.handlers["render:status"],"function")});
t("render:install-deps",function(){eq(typeof mockIpcMain.handlers["render:install-deps"],"function")});
t("render:list-compositions",function(){eq(typeof mockIpcMain.handlers["render:list-compositions"],"function")});
t("render:list-profiles",function(){eq(typeof mockIpcMain.handlers["render:list-profiles"],"function")});

console.log("\n=== param passthrough ===");
t("composition",async function(){
  await mockIpcMain.handlers["render:start"]({sender:{}},{composition:"CinematicRenderer"});
  eq(mockEngine.lastOpts.composition,"CinematicRenderer");
});
t("compositionArgs",async function(){
  await mockIpcMain.handlers["render:start"]({sender:{}},{compositionArgs:{x:1}});
  eq(mockEngine.lastOpts.compositionArgs.x,1);
});
t("renderMode",async function(){
  await mockIpcMain.handlers["render:start"]({sender:{}},{renderMode:"still"});
  eq(mockEngine.lastOpts.renderMode,"still");
});
t("outputFormat",async function(){
  await mockIpcMain.handlers["render:start"]({sender:{}},{outputFormat:"webm"});
  eq(mockEngine.lastOpts.outputFormat,"webm");
});
t("profile",async function(){
  await mockIpcMain.handlers["render:start"]({sender:{}},{profile:"tiktok"});
  eq(mockEngine.lastOpts.profile,"tiktok");
});

console.log("\n=== list queries ===");
t("list-compositions returns array",async function(){
  var r=await mockIpcMain.handlers["render:list-compositions"]();
  eq(Array.isArray(r),true);
});
t("list-profiles returns array",async function(){
  var r=await mockIpcMain.handlers["render:list-profiles"]();
  eq(Array.isArray(r),true);
});

// Wait for all tests then print summary
testQueue.then(function(){
  console.log("\n=== "+pass+" pass, "+fail+" fail ===");
  process.exit(fail>0?1:0);
}).catch(function(e){
  console.error("Test harness error:", e);
  process.exit(1);
});
