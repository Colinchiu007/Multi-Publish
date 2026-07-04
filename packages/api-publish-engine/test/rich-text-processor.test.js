const assert = require("assert");
const { RichTextProcessor } = require("../src/rich-text-processor");
let p=0,f=0;
function t(n,fn){try{fn();p++;console.log('  \u2705 '+n)}catch(e){f++;console.log('  \u274C '+n+': '+e.message)}}
function eq(a,b){assert.deepStrictEqual(a,b)}

var rtp = new RichTextProcessor();

console.log('--- process ---');
t('plain text returns one segment',()=>{
  var r=rtp.process('hello world');
  eq(r.segments.length,1);
  eq(r.segments[0].type,'text');
  eq(r.segments[0].text,'hello world');
});
t('#topic# parsed as topic',()=>{
  var r=rtp.process('a #科技# b');
  eq(r.segments.length,3);
  eq(r.segments[0].type,'text');
  eq(r.segments[1].type,'topic');
  eq(r.segments[1].name,'科技');
  eq(r.segments[2].type,'text');
});
t('@mention parsed',()=>{
  var r=rtp.process('a @user b');
  eq(r.segments.length,3);
  eq(r.segments[1].type,'mention');
  eq(r.segments[1].name,'user');
});
t('topics extracted in output',()=>{
  var r=rtp.process('#AI# and #科技#');
  eq(r.topics.length,2);
  eq(r.topics[0].name,'AI');
  eq(r.topics[1].name,'科技');
});
t('empty string',()=>{
  var r=rtp.process('');
  eq(r.segments.length,0);
  eq(r.topics.length,0);
});
t('no topics/mentions',()=>{
  var r=rtp.process('just text');
  eq(r.segments.length,1);
  eq(r.topics.length,0);
});
t('mixed content',()=>{
  var r=rtp.process('hello #AI# world @dev foo');
  eq(r.segments.length,5);
  eq(r.segments[1].type,'topic');
  eq(r.segments[3].type,'mention');
  eq(r.topics.length,1);
});
t('adjacent topic and mention',()=>{
  var r=rtp.process('#AI#@dev');
  eq(r.segments.length,2);
  eq(r.segments[0].type,'topic');
  eq(r.segments[1].type,'mention');
});

console.log('\n========== Result: '+p+'/'+(p+f)+' ==========');
if(f)process.exit(1);