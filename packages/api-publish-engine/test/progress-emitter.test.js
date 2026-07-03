const assert = require("assert");
const { ProgressEmitter, publishStatusEnum } = require("../src/progress-emitter");
let p=0,f=0;
function t(n,fn){try{fn();p++;console.log('  \u2705 '+n)}catch(e){f++;console.log('  \u274C '+n+': '+e.message)}}
function eq(a,b){assert.deepStrictEqual(a,b)}

console.log('--- publishStatusEnum ---');
t('has all expected statuses',()=>{
  var keys=Object.keys(publishStatusEnum);
  ['init','uploading','uploadSuccess','uploadFail','pushing','pushSuccess','pushFail'].forEach(function(k){eq(keys.includes(k),true)});
});

console.log('\n--- ProgressEmitter ---');
t('setProgress emits progress event',()=>{
  var em=new ProgressEmitter(),data=null;
  em.on('progress',function(d){data=d});
  em.setProgress(50,'uploading');
  eq(data!==null,true);
  eq(data.percent,50);
  eq(data.message,'uploading');
});
t('setProgress clamps to 0-100',()=>{
  var em=new ProgressEmitter(),evts=[];
  em.on('progress',function(d){evts.push(d.percent)});
  em.setProgress(999,'too high');
  em.setProgress(-50,'too low');
  em.setProgress(75,'normal');
  eq(evts[0],100);
  eq(evts[1],0);
  eq(evts[2],75);
});
t('setStatus emits statusChange',()=>{
  var em=new ProgressEmitter(),data=null;
  em.on('statusChange',function(d){data=d});
  em.setStatus(publishStatusEnum.pushSuccess,'published');
  eq(data.status,'pushSuccess');
  eq(data.message,'published');
});
t('multiple emissions',()=>{
  var em=new ProgressEmitter(),count=0;
  em.on('progress',function(){count++});
  em.setProgress(10,'a');
  em.setProgress(50,'b');
  em.setProgress(100,'c');
  eq(count,3);
});
t('taskId forwarded',()=>{
  var em=new ProgressEmitter(),data=null;
  em.on('progress',function(d){data=d});
  em.setProgress(50,'upload','task-1');
  eq(data.taskId,'task-1');
});
console.log('\n========== Result: '+p+'/'+(p+f)+' ==========');
if(f)process.exit(1);