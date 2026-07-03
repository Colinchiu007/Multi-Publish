const assert = require("assert");
const CosP = require("../upload/providers/cos-provider");
const OssP = require("../upload/providers/oss-provider");
const HttpP = require("../upload/providers/http-provider");
const orch = require("../upload/orchestrator");

let p=0,f=0;
function t(n,fn){try{fn();p++;console.log('  \u2705 '+n)}catch(e){f++;console.log('  \u274C '+n+': '+e.message)}}
function eq(a,b){assert.deepStrictEqual(a,b)}
function ok(v){eq(v,true)}

console.log('--- Provider structure ---');
t('CosProvider constructs',()=>{var c=new CosP();eq(typeof c.uploadVideo,'function');eq(c.type,'cos')});
t('OssProvider constructs',()=>{var o=new OssP();eq(typeof o.uploadVideo,'function');eq(o.type,'oss')});
t('HttpProvider constructs',()=>{var h=new HttpP();eq(typeof h.uploadVideo,'function');eq(h.type,'http')});

console.log('\n--- Orchestrator routing ---');
var ROUTE=[['xiaohongshu','cos'],['tencent_video','cos'],['zhihu','oss'],['dewu','oss'],['yidianhao','oss'],['douyin','http'],['kuaishou','http'],['baijiahao','http'],['bilibili','http'],['weibo','http'],['toutiao','http'],['wechat_mp','http'],['aiqiyi','http'],['dayu','http'],['qiehao','http'],['souhu','http'],['wangyi','http'],['tengxun_shipin','http'],['weishi','http'],['souhu_shipin','http'],['pipixia','http'],['meipai','http'],['acfun','http'],['chejiahao','http'],['yichehao','http'],['meiyou','http'],['xhs_shangjia','http'],['xigua','http'],['duoduo','http']];
ROUTE.forEach(function(rr){
  var plat=rr[0],typ=rr[1];
  t(typ+' -> '+plat,function(){var prov=orch.getUploadProvider(plat);eq(prov!==null,true);eq(prov.type,typ)});
});
t('unknown returns null',()=>{eq(orch.getUploadProvider('unknown'),null)});
t('upload unknown returns null',async()=>{var r=await orch.upload({platform:'unknown',filePath:'x.mp4',cookie:''});eq(r,null)});

console.log('\n--- Adapter uploadVideo graceful ---');
var ADAPTERS=['acfun','aiqiyi','baijiahao','bilibili','chejiahao','dayu','douyin','duoduo','kuaishou','meipai','meiyou','pipixia','qiehao','souhu','souhu_shipin','tengxun_shipin','toutiao','wangyi','wechat_mp','weibo','weishi','xhs_shangjia','xigua','yichehao','zhihu','xiaohongshu','shipinhao','dewu','yidianhao'];
ADAPTERS.forEach(function(name){
  t(name+' uploadVideo graceful',async function(){
    var Adp=require('../src/adapters/'+name);var inst=new Adp();var r=await inst.uploadVideo({},'');
    eq(r,null);
  });
});

console.log('\n========== Result: '+p+'/'+(p+f)+' ==========');
if(f)process.exit(1);