const assert = require("assert");

// TDD: batchPublish 尚未实现，定义期望的接口
let batchPublish;
try {
  batchPublish = require("../src/index").batchPublish;
} catch(e) {
  batchPublish = null;
}

let p=0,f=0;
function t(n,fn){try{fn();p++;console.log('  \u2705 '+n)}catch(e){f++;console.log('  \u274C '+n+': '+e.message)}}
function eq(a,b){assert.deepStrictEqual(a,b)}

console.log('--- batchPublish interface ---');
t('batchPublish is exported from index.js',()=>{
  eq(typeof batchPublish,'function');
});

// 以下测试在 batchPublish 实现后自动生效
if (batchPublish) {
  console.log('\n--- batchPublish behavior ---');
  t('publishes to multiple platforms', async () => {
    var results = await batchPublish(['zhihu','douyin'], {title:'test',content:'hello'}, 'cookie', {dryRun:true});
    eq(Array.isArray(results),true);
    eq(results.length,2);
    results.forEach(function(r){eq(typeof r.platform,'string');eq(typeof r.success,'boolean')});
  });

  t('handles empty platforms array', async () => {
    var results = await batchPublish([], {}, '', {});
    eq(Array.isArray(results),true);
    eq(results.length,0);
  });

  t('continues on partial failure', async () => {
    var results = await batchPublish(['unknown_platform','zhihu'], {title:'t',content:'c'}, 'cookie', {dryRun:true});
    eq(results.length,2);
    eq(results[0].success,false); // unknown platform fails
    eq(results[1].success,true);  // zhihu succeeds
  });

  t('with onProgress callback', async () => {
    var progress = [];
    await batchPublish(['zhihu','douyin'], {title:'t',content:'c'}, 'cookie', {
      dryRun: true,
      onProgress: function(pct,msg){progress.push({pct:pct,msg:msg})}
    });
    eq(progress.length>0,true);
  });
}

console.log('\n========== Result: '+p+'/'+(p+f)+' ==========');
if(f)process.exit(1);