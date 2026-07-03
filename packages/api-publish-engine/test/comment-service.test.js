const assert = require("assert");
const { CommentMessageService, EchoReplyGenerator, TemplateReplyGenerator } = require("../src/comment-service");
let p=0,f=0;
function t(n,fn){try{fn();p++;console.log('  \u2705 '+n)}catch(e){f++;console.log('  \u274C '+n+': '+e.message)}}
function eq(a,b){assert.deepStrictEqual(a,b)}

console.log('--- Structure ---');
t('exports CommentMessageService',()=>{eq(typeof CommentMessageService,'function')});
t('exports EchoReplyGenerator',()=>{eq(typeof EchoReplyGenerator,'function')});
t('exports TemplateReplyGenerator',()=>{eq(typeof TemplateReplyGenerator,'function')});

console.log('\n--- EchoReplyGenerator ---');
t('generateReply returns echo',()=>{
  var g=new EchoReplyGenerator();
  eq(g.generateReply({content:'hello'}),'感谢您的评论！回复: hello');
});

console.log('\n--- TemplateReplyGenerator ---');
t('template with content placeholder',()=>{
  var g=new TemplateReplyGenerator({template:'[REPLY] {content}'});
  eq(g.generateReply({content:'thanks'}),'[REPLY] thanks');
});
t('template with author placeholder',()=>{
  var g=new TemplateReplyGenerator({template:'@{author}: {content}'});
  eq(g.generateReply({content:'hi',author:'user'}),'@user: hi');
});
t('default template',()=>{
  var g=new TemplateReplyGenerator();
  eq(g.generateReply({content:'test'}),'谢谢: test');
});

console.log('\n--- CommentMessageService ---');
t('constructs with defaults',()=>{
  var s=new CommentMessageService({platform:'test',cookie:'c',replyGenerator:new EchoReplyGenerator()});
  eq(typeof s.start,'function');eq(typeof s.stop,'function');
});

console.log('\n========== Result: '+p+'/'+(p+f)+' ==========');
if(f)process.exit(1);