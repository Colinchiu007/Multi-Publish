const assert = require("assert");
const { CancelToken } = require("../src/cancel-token");
let p=0,f=0;
function t(n,fn){try{fn();p++;console.log('  \u2705 '+n)}catch(e){f++;console.log('  \u274C '+n+': '+e.message)}}
function eq(a,b){assert.deepStrictEqual(a,b)}
console.log('--- CancelToken ---');
t('starts not cancelled',()=>{eq(new CancelToken().isCancelled,false)});
t('cancel() sets flag',()=>{var c=new CancelToken();c.cancel();eq(c.isCancelled,true)});
t('throwIfCancelled throws after cancel',()=>{
  var c=new CancelToken();c.cancel();var threw=false;
  try{c.throwIfCancelled()}catch(e){threw=true;eq(e.isCanceled,true);eq(e.code,-999)}
  eq(threw,true);
});
t('throwIfCancelled does not throw when not cancelled',()=>{
  var c=new CancelToken();var threw=false;
  try{c.throwIfCancelled()}catch(e){threw=true}
  eq(threw,false);
});
t('onCancel fires listeners on cancel',()=>{
  var c=new CancelToken(),fired=false;
  c.onCancel(function(){fired=true});
  c.cancel();
  eq(fired,true);
});
t('onCancel clears after firing',()=>{
  var c=new CancelToken(),count=0;
  c.onCancel(function(){count++});
  c.cancel();
  c.cancel(); // second cancel should not fire again
  eq(count,1);
});
t('multiple onCancel listeners',()=>{
  var c=new CancelToken(),a=0,b=0;
  c.onCancel(function(){a++});
  c.onCancel(function(){b++});
  c.cancel();
  eq(a,1);eq(b,1);
});
t('onCancel with non-function is ignored',()=>{
  var c=new CancelToken();
  c.onCancel(null);
  c.onCancel('string');
  c.onCancel(123);
  c.cancel();
  eq(c.isCancelled,true); // no error thrown
});
console.log('\n========== '+p+'/'+(p+f)+' ==========');
if(f)process.exit(1);