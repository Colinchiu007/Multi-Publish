const assert = require("assert");
const { errorCode, getMsg, isSuccess } = require("../src/error-codes");
let p=0,f=0;
function t(n,fn){try{fn();p++;console.log('  \u2705 '+n)}catch(e){f++;console.log('  \u274C '+n+': '+e.message)}}
function eq(a,b){assert.deepStrictEqual(a,b)}
console.log('--- errorCode ---');
t('success=0',()=>{eq(errorCode.success,0)});
t('cancel_error=-999',()=>{eq(errorCode.cancel_error,-999)});
t('all codes are numbers',()=>{Object.values(errorCode).forEach(function(v){eq(typeof v,'number')})});
console.log('\n--- getMsg ---');
t('success message',()=>{eq(getMsg(0),'Success')});
t('cancel_error message',()=>{eq(getMsg(-999),'Task cancelled')});
t('unknown code',()=>{eq(getMsg(999),'Unknown code: 999')});
t('null code',()=>{eq(getMsg(null),'Unknown code: null')});
console.log('\n--- isSuccess ---');
t('code 0 is success',()=>{eq(isSuccess({code:0}),true)});
t('success:true is success',()=>{eq(isSuccess({success:true}),true)});
t('failure code',()=>{eq(isSuccess({code:-1}),false)});
t('null/undefined is falsy (returns null)',()=>{eq(isSuccess(null),null);eq(isSuccess(undefined),undefined)});
t('empty object',()=>{eq(isSuccess({}),false)});
console.log('\n========== '+p+'/'+(p+f)+' ==========');
if(f)process.exit(1);