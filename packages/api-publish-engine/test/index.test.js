const assert = require("assert");
const { getAdapter, supportsApi, publishViaApi, batchPublish, REGISTRY } = require("../src/index");
let p=0,f=0;
function t(n,fn){try{fn();p++;console.log('  \u2705 '+n)}catch(e){f++;console.log('  \u274C '+n+': '+e.message)}}
function eq(a,b){assert.deepStrictEqual(a,b)}

console.log('--- REGISTRY ---');
t('has 29 platforms',()=>{eq(Object.keys(REGISTRY).length,29)});
t('includes zhihu',()=>{eq('zhihu' in REGISTRY,true)});
t('includes douyin',()=>{eq('douyin' in REGISTRY,true)});
t('includes duoduo',()=>{eq('duoduo' in REGISTRY,true)});

console.log('\n--- getAdapter ---');
t('returns adapter for zhihu',()=>{var a=getAdapter('zhihu');eq(a!==null,true);eq(typeof a.execute,'function')});
t('returns null for unknown',()=>{eq(getAdapter('unknown'),null)});

console.log('\n--- supportsApi ---');
t('zhihu is supported',()=>{eq(supportsApi('zhihu'),true)});
t('unknown is not supported',()=>{eq(supportsApi('unknown'),false)});

console.log('\n--- publishViaApi ---');
t('throws for unknown platform',async()=>{
  var threw=false;try{await publishViaApi('unknown',{},'')}catch(e){threw=true;eq(e.message.includes('No API adapter'),true)}
  eq(threw,true);
});

console.log('\n--- batchPublish ---');
t('exports batchPublish',()=>{eq(typeof batchPublish,'function')});
t('empty platforms',async()=>{var r=await batchPublish([],{},'');eq(Array.isArray(r),true);eq(r.length,0)});
t('unknown platform returns failure',async()=>{
  var r=await batchPublish(['unknown'],{title:'t'},'');
  eq(r.length,1);eq(r[0].success,false);eq(r[0].platform,'unknown');
});

console.log('\n========== Result: '+p+'/'+(p+f)+' ==========');
if(f)process.exit(1);