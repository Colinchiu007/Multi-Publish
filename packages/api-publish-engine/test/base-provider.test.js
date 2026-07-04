const assert = require("assert");
const Base = require("../upload/base-provider");

let p=0,f=0;
function t(n,fn){try{fn();p++;console.log('  \u2705 '+n)}catch(e){f++;console.log('  \u274C '+n+': '+e.message)}}
function eq(a,b){assert.deepStrictEqual(a,b)}

console.log('--- BaseUploadProvider ---');
t('constructs with type',()=>{var b=new Base('test');eq(b.type,'test')});
t('uploadVideo returns null without filePath',async()=>{
  var b=new Base('test');var r=await b.uploadVideo({},'cookie');
  eq(r,null);
});
t('uploadVideo returns null with empty filePath',async()=>{
  var b=new Base('test');var r=await b.uploadVideo({filePath:''},'cookie');
  eq(r,null);
});
t('uploadVideo calls _doUpload when filePath present',async()=>{
  var b=new Base('test');var called=false;
  b._doUpload=async function(td,cookie){called=true;eq(td.filePath,'x.mp4');eq(cookie,'c');return{ok:true}};
  var r=await b.uploadVideo({filePath:'x.mp4'},'c');
  eq(called,true);eq(r.ok,true);
});
t('uploadVideo catches _doUpload error',async()=>{
  var b=new Base('test');
  b._doUpload=async function(){throw new Error('fail')};
  var r=await b.uploadVideo({filePath:'x.mp4'},'c');
  eq(r,null); // gracefully returns null
});
t('uploadCover delegates to uploadVideo',async()=>{
  var b=new Base('test');var videoArgs=null;
  b.uploadVideo=async function(td,cookie){videoArgs={td,cookie};return{ok:true}};
  var r=await b.uploadCover({filePath:'v.mp4',coverPath:'c.jpg'},'cookie');
  eq(r.ok,true);
  eq(videoArgs.td.filePath,'c.jpg'); // coverPath becomes filePath
  eq(videoArgs.td.coverPath,'c.jpg'); // original path preserved
});
t('uploadCover returns null without coverPath',async()=>{
  var b=new Base('test');var r=await b.uploadCover({filePath:'v.mp4'},'cookie');
  eq(r,null);
});

console.log('\n========== Result: '+p+'/'+(p+f)+' ==========');
if(f)process.exit(1);