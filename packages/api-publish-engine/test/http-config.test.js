const assert = require("assert");
const { getPlatformConfig, PLATFORM_CONFIG } = require("../upload/providers/http-config");
const HttpProvider = require("../upload/providers/http-provider");

let p=0,f=0;
function t(n,fn){try{fn();p++;console.log('  \u2705 '+n)}catch(e){f++;console.log('  \u274C '+n+': '+e.message)}}
function eq(a,b){assert.deepStrictEqual(a,b)}

console.log('--- Platform count ---');
t('24 HTTP platforms configured',()=>{eq(Object.keys(PLATFORM_CONFIG).length,24)});

console.log('\n--- Config validation ---');
var platforms=Object.keys(PLATFORM_CONFIG);
platforms.forEach(function(plat){
  t(plat+' has apiDomain/uploadPath/referer/uploadType',function(){
    var cfg=PLATFORM_CONFIG[plat];
    eq(typeof cfg.apiDomain,'string');eq(cfg.apiDomain.length>0,true);
    eq(typeof cfg.uploadPath,'string');eq(cfg.uploadPath.length>0,true);
    eq(typeof cfg.referer,'string');eq(cfg.referer.length>0,true);
    eq(typeof cfg.uploadType,'string');
  });
});

console.log('\n--- getPlatformConfig ---');
t('returns config for douyin',()=>{eq(getPlatformConfig('douyin')!==null,true)});
t('returns null for unknown',()=>{eq(getPlatformConfig('unknown'),null)});

console.log('\n--- HTTP provider URL ---');
t('_getUploadUrl for douyin',()=>{
  var prov=new HttpProvider();
  eq(prov._getUploadUrl('douyin'),'https://creator.douyin.com/web/api/media/aweme/upload/');
});
t('_getUploadUrl for unknown returns null',()=>{
  var prov=new HttpProvider();
  eq(prov._getUploadUrl('unknown'),null);
});

console.log('\n--- HTTP provider graceful ---');
t('uploadVideo returns null without file',async()=>{
  var prov=new HttpProvider();
  eq(await prov.uploadVideo({platform:'douyin'},''),null);
});
t('uploadVideo returns null for unknown platform',async()=>{
  var prov=new HttpProvider();
  eq(await prov.uploadVideo({platform:'unknown',filePath:'x.mp4'},''),null);
});

console.log('\n========== Result: '+p+'/'+(p+f)+' ==========');
if(f)process.exit(1);